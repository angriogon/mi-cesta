import type { BatchOp, CasResult, Db } from "./db";
import type { Household, ListItem, Lists, TableName, Tables } from "./types";

/**
 * Db que acumula las escrituras en lugar de aplicarlas, para enviarlas juntas con `commit()`
 * en una sola transacción. Las lecturas van directas a la base de datos real: una operación
 * atómica no debe depender de leer lo que ella misma acaba de escribir.
 */
export class BatchDb implements Db {
  private readonly ops: BatchOp[] = [];

  constructor(private readonly inner: Db) {}

  get householdId() {
    return this.inner.householdId;
  }

  get kind() {
    return this.inner.kind;
  }

  /** Aplica todo lo acumulado de una vez. */
  async commit(): Promise<void> {
    if (this.ops.length) await this.inner.applyBatch(this.ops.splice(0));
  }

  // ---- Lecturas: directas ----
  list<T extends TableName>(table: T): Promise<Tables[T][]> {
    return this.inner.list(table);
  }

  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
    return this.inner.get(table, id);
  }

  listBy<T extends TableName, K extends keyof Tables[T] & string>(
    table: T,
    column: K,
    value: Tables[T][K],
  ): Promise<Tables[T][]> {
    return this.inner.listBy(table, column, value);
  }

  getHousehold(): Promise<Household> {
    return this.inner.getHousehold();
  }

  getLists(): Promise<Lists> {
    return this.inner.getLists();
  }

  ticketImageUrl(path: string): Promise<string | null> {
    return this.inner.ticketImageUrl(path);
  }

  subscribe(onChange: (table: TableName | "lists") => void): () => void {
    return this.inner.subscribe(onChange);
  }

  // ---- Escrituras de tablas: se acumulan ----
  async insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
    if (rows.length) this.ops.push({ kind: "insert", table, rows });
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
    this.ops.push({ kind: "update", table, id, patch });
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (ids.length) this.ops.push({ kind: "remove", table, ids });
  }

  async removeAll(table: TableName): Promise<void> {
    this.ops.push({ kind: "removeAll", table });
  }

  async applyBatch(ops: BatchOp[]): Promise<void> {
    this.ops.push(...ops);
  }

  // ---- Lo que no puede formar parte de la transacción ----
  updateHousehold(): Promise<Household> {
    return Promise.reject(new Error("Los ajustes del hogar no se guardan dentro de una operación atómica."));
  }

  casLists(_shopping: ListItem[], _checklist: ListItem[], _revision: number): Promise<CasResult> {
    return Promise.reject(new Error("Las listas no se guardan dentro de una operación atómica."));
  }

  /** Las fotos van al almacenamiento, fuera de la base de datos: quien llama debe borrarlas si la operación falla. */
  uploadTicketImage(ticketId: string, file: Blob): Promise<string | null> {
    return this.inner.uploadTicketImage(ticketId, file);
  }

  removeTicketImages(paths: string[]): Promise<void> {
    return this.inner.removeTicketImages(paths);
  }
}
