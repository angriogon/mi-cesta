import { describe, expect, it, vi } from "vitest";
import { isNetworkError, memoryStore, Outbox, type OutboxTarget } from "./outbox";

const pet = { id: "p1", householdId: "h", name: "Pienso", currentStock: 2, minimumStock: 1, updatedAt: "" };
const ticket = {
  image: null,
  merchant: "Mercadona",
  purchasedAt: "2026-10-18",
  totalCents: 500,
  rawText: "",
  items: [],
};

function target(fail?: (kind: string) => Error | null): OutboxTarget & { calls: string[] } {
  const calls: string[] = [];
  const run = async (kind: string) => {
    const error = fail?.(kind);
    if (error) throw error;
    calls.push(kind);
  };
  return {
    calls,
    updateProduct: (id, patch) => run(`stock:${id}:${patch.currentStock}`),
    updateDogItem: (item) => run(`pet:${item.id}:${item.currentStock}`),
    saveTicket: () => run("ticket"),
  };
}

describe("cola sin conexión", () => {
  it("guarda los cambios y los envía en orden; de un mismo producto solo el último", async () => {
    const outbox = new Outbox("h", memoryStore());
    await outbox.enqueue({ kind: "stock", productId: "leche", currentStock: 1, minimumStock: 2 });
    await outbox.enqueue({ kind: "ticket", ticket });
    await outbox.enqueue({ kind: "stock", productId: "leche", currentStock: 3, minimumStock: 2 });
    await outbox.enqueue({ kind: "pet-item", item: pet });
    expect(await outbox.pending()).toBe(3);
    const api = target();
    expect(await outbox.flush(api)).toEqual({ sent: 3, dropped: 0 });
    expect(api.calls).toEqual(["stock:leche:3", "ticket", "pet:p1:2"]);
    expect(await outbox.pending()).toBe(0);
  });

  it("si sigue sin red se para y lo intenta más tarde", async () => {
    const outbox = new Outbox("h", memoryStore());
    await outbox.enqueue({ kind: "ticket", ticket });
    await outbox.enqueue({ kind: "pet-item", item: pet });
    const offline = target(() => new TypeError("Failed to fetch"));
    expect(await outbox.flush(offline)).toEqual({ sent: 0, dropped: 0 });
    expect(await outbox.pending()).toBe(2);
    expect(await outbox.flush(target())).toEqual({ sent: 2, dropped: 0 });
  });

  it("descarta lo que ya no se puede aplicar y avisa", async () => {
    const outbox = new Outbox("h", memoryStore());
    await outbox.enqueue({ kind: "stock", productId: "borrado", currentStock: 1, minimumStock: 0 });
    await outbox.enqueue({ kind: "ticket", ticket });
    const onDropped = vi.fn();
    const api = target((kind) => (kind.startsWith("stock") ? new Error("Ese producto ya no existe.") : null));
    expect(await outbox.flush(api, onDropped)).toEqual({ sent: 1, dropped: 1 });
    expect(onDropped).toHaveBeenCalledOnce();
    expect(await outbox.pending()).toBe(0);
  });

  it("cada hogar tiene su cola", async () => {
    const store = memoryStore();
    await new Outbox("a", store).enqueue({ kind: "ticket", ticket });
    expect(await new Outbox("b", store).pending()).toBe(0);
  });

  it("distingue los errores de red de los de datos", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Guardar products: TypeError: Load failed"))).toBe(true);
    expect(isNetworkError(new Error("Ese producto ya no existe."))).toBe(false);
  });
});
