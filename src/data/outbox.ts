import { uid } from "../lib/text";
import type { DogItem, TicketItem } from "./types";

/** Un ticket por guardar (con su foto, si la tiene). */
export interface PendingTicket {
  image: Blob | null;
  merchant: string;
  purchasedAt: string;
  totalCents: number;
  rawText: string;
  items: TicketItem[];
}

/** Cambios que se guardan sin conexión y se envían al volver la red. */
export type OutboxOp =
  | { kind: "stock"; productId: string; currentStock: number; minimumStock: number }
  | { kind: "pet-item"; item: DogItem }
  | { kind: "ticket"; ticket: PendingTicket };

export interface OutboxEntry {
  id: string;
  householdId: string;
  createdAt: string;
  op: OutboxOp;
}

/** Dónde se guarda la cola: IndexedDB en el navegador (admite la foto del ticket), memoria en pruebas. */
export interface OutboxStore {
  all(): Promise<OutboxEntry[]>;
  put(entry: OutboxEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Lo que la cola necesita de la API para enviar cada cambio. */
export interface OutboxTarget {
  updateProduct(id: string, patch: { currentStock: number; minimumStock: number }): Promise<void>;
  updateDogItem(item: DogItem): Promise<void>;
  saveTicket(ticket: PendingTicket): Promise<unknown>;
}

/** El error es de red (sin conexión, servidor inalcanzable), no de datos: vale la pena reintentar. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timed? ?out/i.test(
    message,
  );
}

/**
 * Cola de cambios hechos sin conexión, por hogar. Los cambios de existencias de un mismo producto
 * (o de un mismo artículo de la mascota) se sustituyen: solo cuenta el último. Los tickets se
 * guardan todos, en orden.
 */
export class Outbox {
  private listeners = new Set<(pending: number) => void>();
  private flushing: Promise<{ sent: number; dropped: number }> | null = null;

  constructor(
    private readonly householdId: string,
    private readonly store: OutboxStore,
  ) {}

  private async entries() {
    return (await this.store.all())
      .filter((entry) => entry.householdId === this.householdId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async pending(): Promise<number> {
    return (await this.entries()).length;
  }

  subscribe(listener: (pending: number) => void): () => void {
    this.listeners.add(listener);
    void this.pending().then(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    const pending = await this.pending();
    for (const listener of this.listeners) listener(pending);
  }

  async enqueue(op: OutboxOp): Promise<void> {
    const id =
      op.kind === "stock"
        ? `${this.householdId}:stock:${op.productId}`
        : op.kind === "pet-item"
          ? `${this.householdId}:pet:${op.item.id}`
          : `${this.householdId}:ticket:${uid()}`;
    const previous = (await this.store.all()).find((entry) => entry.id === id);
    await this.store.put({
      id,
      householdId: this.householdId,
      // Al sustituir un cambio se conserva su turno, para no adelantar a lo que se hizo antes.
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      op,
    });
    await this.notify();
  }

  /**
   * Envía la cola en orden. Si falla la red se para (lo demás espera); si un cambio ya no se puede
   * aplicar (el producto ya no existe…), se descarta y se cuenta en `dropped`.
   */
  flush(target: OutboxTarget, onDropped?: (entry: OutboxEntry, error: unknown) => void) {
    this.flushing ??= (async () => {
      let sent = 0;
      let dropped = 0;
      try {
        for (const entry of await this.entries()) {
          try {
            await apply(target, entry.op);
            sent++;
          } catch (error) {
            if (isNetworkError(error)) break;
            dropped++;
            onDropped?.(entry, error);
          }
          await this.store.remove(entry.id);
        }
      } finally {
        this.flushing = null;
        await this.notify();
      }
      return { sent, dropped };
    })();
    return this.flushing;
  }
}

async function apply(target: OutboxTarget, op: OutboxOp) {
  if (op.kind === "stock")
    await target.updateProduct(op.productId, { currentStock: op.currentStock, minimumStock: op.minimumStock });
  else if (op.kind === "pet-item") await target.updateDogItem(op.item);
  else await target.saveTicket(op.ticket);
}

export function memoryStore(): OutboxStore {
  const rows = new Map<string, OutboxEntry>();
  return {
    all: async () => [...rows.values()],
    put: async (entry) => void rows.set(entry.id, entry),
    remove: async (id) => void rows.delete(id),
  };
}

/** IndexedDB «cesta-outbox»: sobrevive a cerrar la app y guarda la foto del ticket tal cual. */
export function indexedDbStore(): OutboxStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cesta-outbox", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("ops", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la cola sin conexión."));
    });
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = work(db.transaction("ops", mode).objectStore("ops"));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Error en la cola sin conexión."));
      });
    } finally {
      db.close();
    }
  };
  return {
    all: () => run<OutboxEntry[]>("readonly", (store) => store.getAll() as IDBRequest<OutboxEntry[]>),
    put: async (entry) => void (await run("readwrite", (store) => store.put(entry))),
    remove: async (id) => void (await run("readwrite", (store) => store.delete(id))),
  };
}

const outboxes = new Map<string, Outbox>();

/** La cola de un hogar (una por hogar y pestaña). Sin IndexedDB, en memoria. */
export function outboxFor(householdId: string): Outbox {
  let outbox = outboxes.get(householdId);
  if (!outbox) {
    outbox = new Outbox(householdId, typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore());
    outboxes.set(householdId, outbox);
  }
  return outbox;
}
