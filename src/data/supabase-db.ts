import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, TablesUpdate } from "./database.types";
import type { CasResult, Db } from "./db";
import type { Household, ListItem, Lists, TableName, Tables } from "./types";

const toSnake = (key: string) => key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

/** Solo se convierten las claves de primer nivel: el contenido jsonb se guarda tal cual. */
function rowToDb(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toSnake(key), value]));
}

function rowFromDb<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) as T;
}

const REALTIME_TABLES: (TableName | "lists")[] = [
  "lists",
  "products",
  "inventory_lots",
  "dog_items",
  "dog_reminders",
  "tickets",
  "ticket_reviews",
  "activity",
  "prices",
];

export class SupabaseDb implements Db {
  readonly kind = "supabase" as const;

  constructor(
    private readonly client: SupabaseClient<Database>,
    readonly householdId: string,
  ) {}

  /**
   * Las operaciones genéricas reciben el nombre de tabla en tiempo de ejecución, así que usan el cliente sin tipar.
   * Que los tipos de la app coinciden con las columnas reales lo comprueba `schema.ts` al compilar.
   */
  private get anyTable(): SupabaseClient {
    return this.client;
  }

  private fail(error: { message: string } | null, action: string): void {
    if (error) throw new Error(`${action}: ${error.message}`);
  }

  async list<T extends TableName>(table: T): Promise<Tables[T][]> {
    const pageSize = 1000;
    const rows: Tables[T][] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.anyTable
        .from(table)
        .select("*")
        .eq("household_id", this.householdId)
        .order("id")
        .range(from, from + pageSize - 1);
      this.fail(error, `Leer ${table}`);
      rows.push(...(data ?? []).map((row) => rowFromDb<Tables[T]>(row)));
      if (!data || data.length < pageSize) return rows;
    }
  }

  async insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.anyTable
      .from(table)
      .upsert(rows.map((row) => rowToDb({ ...(row as object), householdId: this.householdId })));
    this.fail(error, `Guardar ${table}`);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    const { error } = await this.anyTable
      .from(table)
      .update(rowToDb(patch as Record<string, unknown>))
      .eq("household_id", this.householdId)
      .eq("id", id);
    this.fail(error, `Actualizar ${table}`);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await this.anyTable.from(table).delete().eq("household_id", this.householdId).in("id", ids);
    this.fail(error, `Eliminar en ${table}`);
  }

  async removeAll(table: TableName): Promise<void> {
    const { error } = await this.anyTable.from(table).delete().eq("household_id", this.householdId);
    this.fail(error, `Vaciar ${table}`);
  }

  async getHousehold(): Promise<Household> {
    const { data, error } = await this.client.from("households").select("*").eq("id", this.householdId).single();
    this.fail(error, "Leer hogar");
    return rowFromDb<Household>(data!);
  }

  async updateHousehold(patch: Partial<Household>): Promise<Household> {
    const { data, error } = await this.client
      .from("households")
      .update(rowToDb(patch as Record<string, unknown>) as TablesUpdate<"households">)
      .eq("id", this.householdId)
      .select("*")
      .single();
    this.fail(error, "Actualizar hogar");
    return rowFromDb<Household>(data!);
  }

  async getLists(): Promise<Lists> {
    const { data, error } = await this.client.from("lists").select("*").eq("household_id", this.householdId).single();
    this.fail(error, "Leer listas");
    return rowFromDb<Lists>(data!);
  }

  async casLists(shopping: ListItem[], checklist: ListItem[], revision: number): Promise<CasResult> {
    const { data, error } = await this.client.rpc("cas_lists", {
      p_household_id: this.householdId,
      p_shopping: shopping as unknown as Json,
      p_checklist: checklist as unknown as Json,
      p_revision: revision,
    });
    this.fail(error, "Sincronizar listas");
    const result = data as { ok: boolean; lists: Record<string, unknown> };
    return { ok: result.ok, lists: rowFromDb<Lists>(result.lists) };
  }

  async uploadTicketImage(ticketId: string, file: Blob): Promise<string | null> {
    const extension = file.type === "image/png" ? "png" : file.type === "image/heic" ? "heic" : "jpg";
    const path = `${this.householdId}/${ticketId}.${extension}`;
    const { error } = await this.client.storage
      .from("ticket-images")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    return error ? null : path;
  }

  async ticketImageUrl(path: string): Promise<string | null> {
    const { data } = await this.client.storage.from("ticket-images").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async removeTicketImages(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await this.client.storage.from("ticket-images").remove(paths);
    this.fail(error, "Borrar fotos de tickets");
  }

  /**
   * Un único canal por hogar compartido por todas las pantallas: Supabase reutiliza el canal
   * con el mismo nombre y no permite añadirle escuchas una vez abierto.
   */
  subscribe(onChange: (table: TableName | "lists") => void): () => void {
    const entry = sharedChannel(this.client, this.householdId);
    entry.listeners.add(onChange);
    return () => {
      entry.listeners.delete(onChange);
      if (entry.listeners.size) return;
      channelsByClient.get(this.client)?.delete(this.householdId);
      void this.client.removeChannel(entry.channel);
    };
  }

  /** Solo para pruebas: simula un cambio recibido por el canal. */
  notifyForTests(table: TableName | "lists") {
    channelsByClient
      .get(this.client)
      ?.get(this.householdId)
      ?.listeners.forEach((listener) => listener(table));
  }
}

type Listener = (table: TableName | "lists") => void;
interface SharedChannel {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
}

const channelsByClient = new WeakMap<SupabaseClient<Database>, Map<string, SharedChannel>>();

function sharedChannel(client: SupabaseClient<Database>, householdId: string): SharedChannel {
  let channels = channelsByClient.get(client);
  if (!channels) {
    channels = new Map();
    channelsByClient.set(client, channels);
  }
  const existing = channels.get(householdId);
  if (existing) return existing;
  const entry: SharedChannel = { channel: client.channel(`household:${householdId}`), listeners: new Set() };
  for (const table of REALTIME_TABLES) {
    entry.channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` },
      () => entry.listeners.forEach((listener) => listener(table)),
    );
  }
  entry.channel.subscribe();
  channels.set(householdId, entry);
  return entry;
}
