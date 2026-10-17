import type { Household, ListItem, Lists, TableName, Tables } from "./types";

export type CasResult = { ok: true; lists: Lists } | { ok: false; lists: Lists };

/**
 * Acceso a los datos de un hogar. Hay dos implementaciones con el mismo contrato:
 * Supabase (producción, compartido entre dispositivos) y local (demo y pruebas).
 */
export interface Db {
  readonly householdId: string;
  readonly kind: "supabase" | "local";
  list<T extends TableName>(table: T): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  removeAll(table: TableName): Promise<void>;
  getHousehold(): Promise<Household>;
  updateHousehold(patch: Partial<Omit<Household, "id" | "inviteCode" | "createdAt">>): Promise<Household>;
  getLists(): Promise<Lists>;
  /** Guarda las listas solo si nadie las ha cambiado desde `revision` (compare-and-swap). */
  casLists(shopping: ListItem[], checklist: ListItem[], revision: number): Promise<CasResult>;
  uploadTicketImage(ticketId: string, file: Blob): Promise<string | null>;
  ticketImageUrl(path: string): Promise<string | null>;
  /** Avisa cuando otro dispositivo cambia datos del hogar. */
  subscribe(onChange: (table: TableName | "lists") => void): () => void;
}
