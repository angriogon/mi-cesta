import type { BatchOp, CasResult, Db } from "./db";
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

  async get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    const row = this.rows(table).find((item) => (item as { id: string }).id === id);
    return row ? clone(row) : null;
  }

  async listBy<T extends TableName, K extends keyof Tables[T] & string>(
    table: T,
    column: K,
    value: Tables[T][K],
  ): Promise<Tables[T][]> {
    return clone(this.rows(table).filter((item) => item[column] === value));
  }

  /** Aplica una escritura en memoria, sin guardar ni avisar; devuelve si cambió algo. */
  private apply(op: BatchOp): boolean {
    if (op.kind === "insert") {
      if (!op.rows.length) return false;
      const existing = this.rows(op.table) as object[];
      for (const row of op.rows) {
        const id = (row as { id: string }).id;
        const index = existing.findIndex((item) => (item as { id: string }).id === id);
        if (index >= 0) existing[index] = clone(row);
        else existing.push(clone(row));
      }
      return true;
    }
    if (op.kind === "update") {
      const rows = this.rows(op.table) as object[];
      const index = rows.findIndex((item) => (item as { id: string }).id === op.id);
      if (index < 0) return false;
      rows[index] = { ...rows[index], ...clone(op.patch) };
      return true;
    }
    if (op.kind === "remove") {
      if (!op.ids.length) return false;
      const ids = new Set(op.ids);
      this.data.tables[op.table] = this.rows(op.table).filter((item) => !ids.has((item as { id: string }).id)) as never;
      return true;
    }
    if (op.kind === "removeAll") {
      this.data.tables[op.table] = [] as never;
      return true;
    }
    throw new Error(`Operación desconocida: ${(op as { kind: string }).kind}`);
  }

  async insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
    if (this.apply({ kind: "insert", table, rows })) this.persist(table);
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    if (this.apply({ kind: "update", table, id, patch })) this.persist(table);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (this.apply({ kind: "remove", table, ids })) this.persist(table);
  }

  async removeAll(table: TableName): Promise<void> {
    if (this.apply({ kind: "removeAll", table })) this.persist(table);
  }

  async applyBatch(ops: BatchOp[]): Promise<void> {
    // Se trabaja sobre una copia: si algo falla, los datos quedan como estaban.
    const before = clone(this.data.tables);
    const touched = new Set<TableName>();
    try {
      for (const op of ops) if (this.apply(op)) touched.add(op.table);
    } catch (error) {
      this.data.tables = before;
      throw error;
    }
    if (!touched.size) return;
    this.persistence.save(this.key, JSON.stringify(this.data));
    for (const table of touched) for (const listener of this.listeners) listener(table);
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
