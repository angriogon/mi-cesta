import type { CasResult, Db } from "./db";
import type { Household, ListItem, Lists, TableName, Tables } from "./types";

type Snapshot = {
  household: Household;
  lists: Lists;
  tables: { [K in TableName]?: Tables[K][] };
  images: Record<string, string>;
};

export interface LocalPersistence {
  load(key: string): string | null;
  save(key: string, value: string): void;
  remove(key: string): void;
}

export const browserPersistence: LocalPersistence = {
  load: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  save: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Sin espacio o almacenamiento bloqueado: los datos siguen en memoria durante la sesión.
    }
  },
  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignorado a propósito.
    }
  },
};

export function memoryPersistence(): LocalPersistence {
  const store = new Map<string, string>();
  return {
    load: (key) => store.get(key) ?? null,
    save: (key, value) => void store.set(key, value),
    remove: (key) => void store.delete(key),
  };
}

const clone = <T>(value: T): T => structuredClone(value);

export function newHousehold(id: string, name = "Mi hogar"): Household {
  return {
    id,
    name,
    inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    mode: "normal",
    petName: "Mascota",
    postalCode: "",
    priceMeta: { postalCode: "", lastAttemptedAt: null, lastSuccessfulAt: null, updatedCount: 0 },
    preferences: { specialDietEnabled: false, allergens: [], avoided: [] },
    createdAt: new Date().toISOString(),
  };
}

/** Base de datos en el propio dispositivo, con el mismo contrato que Supabase. */
export class LocalDb implements Db {
  readonly kind = "local" as const;
  private data: Snapshot;
  private listeners = new Set<(table: TableName | "lists") => void>();
  private readonly key: string;

  constructor(
    readonly householdId: string,
    private readonly persistence: LocalPersistence = browserPersistence,
  ) {
    this.key = `cesta-local-db-v5:${householdId}`;
    const saved = persistence.load(this.key);
    this.data = saved
      ? (JSON.parse(saved) as Snapshot)
      : {
          household: newHousehold(householdId),
          lists: { householdId, shopping: [], checklist: [], revision: 0, updatedAt: new Date().toISOString() },
          tables: {},
          images: {},
        };
  }

  private persist(table: TableName | "lists" | "household") {
    this.persistence.save(this.key, JSON.stringify(this.data));
    if (table !== "household") for (const listener of this.listeners) listener(table);
  }

  private rows<T extends TableName>(table: T): Tables[T][] {
    return (this.data.tables[table] ??= []) as Tables[T][];
  }

  async list<T extends TableName>(table: T): Promise<Tables[T][]> {
    return clone(this.rows(table));
  }

  async insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
    if (!rows.length) return;
    const existing = this.rows(table);
    for (const row of rows) {
      const id = (row as { id: string }).id;
      const index = existing.findIndex((item) => (item as { id: string }).id === id);
      if (index >= 0) existing[index] = clone(row);
      else existing.push(clone(row));
    }
    this.persist(table);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    const rows = this.rows(table);
    const index = rows.findIndex((item) => (item as { id: string }).id === id);
    if (index < 0) return;
    rows[index] = { ...rows[index], ...clone(patch) };
    this.persist(table);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const set = new Set(ids);
    this.data.tables[table] = this.rows(table).filter((item) => !set.has((item as { id: string }).id)) as never;
    this.persist(table);
  }

  async removeAll(table: TableName): Promise<void> {
    this.data.tables[table] = [] as never;
    this.persist(table);
  }

  async getHousehold(): Promise<Household> {
    return clone(this.data.household);
  }

  async updateHousehold(patch: Partial<Household>): Promise<Household> {
    this.data.household = { ...this.data.household, ...clone(patch) };
    this.persist("household");
    return clone(this.data.household);
  }

  async getLists(): Promise<Lists> {
    return clone(this.data.lists);
  }

  async casLists(shopping: ListItem[], checklist: ListItem[], revision: number): Promise<CasResult> {
    if (revision !== this.data.lists.revision) return { ok: false, lists: clone(this.data.lists) };
    this.data.lists = {
      householdId: this.householdId,
      shopping: clone(shopping),
      checklist: clone(checklist),
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.persist("lists");
    return { ok: true, lists: clone(this.data.lists) };
  }

  async uploadTicketImage(ticketId: string, file: Blob): Promise<string | null> {
    // En modo local solo se guardan imágenes pequeñas para no llenar el almacenamiento.
    if (file.size > 1_500_000) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
    this.data.images[ticketId] = dataUrl;
    this.persist("tickets");
    return ticketId;
  }

  async ticketImageUrl(path: string): Promise<string | null> {
    return this.data.images[path] ?? null;
  }

  async removeTicketImages(paths: string[]): Promise<void> {
    for (const path of paths) delete this.data.images[path];
    this.persist("tickets");
  }

  subscribe(onChange: (table: TableName | "lists") => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Borra todo lo guardado por este hogar en el dispositivo. */
  destroy() {
    this.persistence.remove(this.key);
  }
}
