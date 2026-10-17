import type { Household, ListItem, Lists, TableName, Tables } from "./types";

export type CasResult = { ok: true; lists: Lists } | { ok: false; lists: Lists };

/** Una escritura dentro de una operación atómica (`applyBatch`). Las filas usan los nombres de la app. */
export type BatchOp =
  | { kind: "insert"; table: TableName; rows: object[] }
  | { kind: "update"; table: TableName; id: string; patch: object }
  | { kind: "remove"; table: TableName; ids: string[] }
  | { kind: "removeAll"; table: TableName };

/**
 * Acceso a los datos de un hogar. Hay dos implementaciones con el mismo contrato:
 * Supabase (producción, compartido entre dispositivos) y local (demo y pruebas).
 */
export interface Db {
  readonly householdId: string;
  readonly kind: "supabase" | "local";
  list<T extends TableName>(table: T): Promise<Tables[T][]>;
  /** Una fila por id, sin leer la tabla entera. */
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  /** Las filas cuyo campo `column` vale `value`, filtradas en la base de datos. */
  listBy<T extends TableName, K extends keyof Tables[T] & string>(
    table: T,
    column: K,
    value: Tables[T][K],
  ): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  removeAll(table: TableName): Promise<void>;
  /** Aplica varias escrituras en orden y en una sola transacción: o todas o ninguna. */
  applyBatch(ops: BatchOp[]): Promise<void>;
  getHousehold(): Promise<Household>;
  updateHousehold(patch: Partial<Omit<Household, "id" | "inviteCode" | "createdAt">>): Promise<Household>;
  getLists(): Promise<Lists>;
  /** Guarda las listas solo si nadie las ha cambiado desde `revision` (compare-and-swap). */
  casLists(shopping: ListItem[], checklist: ListItem[], revision: number): Promise<CasResult>;
  uploadTicketImage(ticketId: string, file: Blob): Promise<string | null>;
  ticketImageUrl(path: string): Promise<string | null>;
  removeTicketImages(paths: string[]): Promise<void>;
  /** Avisa cuando otro dispositivo cambia datos del hogar. */
  subscribe(onChange: (table: TableName | "lists") => void): () => void;
}
