import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToShopping } from "../domain/lists";
import { CestaApi } from "./api";
import { LocalDb, memoryPersistence } from "./local-db";
import { seedIfEmpty } from "./seed";

let db: LocalDb;
let api: CestaApi;

beforeEach(async () => {
  db = new LocalDb("hogar-atomico", memoryPersistence());
  await seedIfEmpty(db);
  api = new CestaApi(db);
});

const stockOf = async (name: string) => (await api.products()).find((product) => product.name === name)!.currentStock;

describe("LocalDb.applyBatch", () => {
  it("aplica en orden y avisa una vez por tabla", async () => {
    const listener = vi.fn();
    db.subscribe(listener);
    const leche = (await api.products()).find((product) => product.name === "Leche entera")!;
    await db.applyBatch([
      { kind: "update", table: "products", id: leche.id, patch: { currentStock: 2 } },
      { kind: "update", table: "products", id: leche.id, patch: { currentStock: 3 } },
    ]);
    expect(await stockOf("Leche entera")).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("si una escritura falla, no se aplica ninguna", async () => {
    const leche = (await api.products()).find((product) => product.name === "Leche entera")!;
    await expect(
      db.applyBatch([
        { kind: "update", table: "products", id: leche.id, patch: { currentStock: 9 } },
        { kind: "inventada" } as never,
      ]),
    ).rejects.toThrow("Operación desconocida");
    expect(await stockOf("Leche entera")).toBe(0);
  });
});

describe("operaciones de varios pasos", () => {
  const compra = () => addToShopping(addToShopping([], "Leche entera", [], {}), "Arroz largo", [], {});

  it("guardar la compra se aplica en una sola escritura", async () => {
    const batch = vi.spyOn(db, "applyBatch");
    const update = vi.spyOn(db, "update");
    await api.storePurchased(compra().map((item) => ({ ...item, done: true })));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(await stockOf("Leche entera")).toBe(1);
  });

  it("si guardar la compra falla, no queda nada a medias", async () => {
    vi.spyOn(db, "applyBatch").mockRejectedValueOnce(new Error("sin red"));
    await expect(api.storePurchased(compra().map((item) => ({ ...item, done: true })))).rejects.toThrow("sin red");
    expect(await stockOf("Leche entera")).toBe(0);
    expect(await stockOf("Arroz largo")).toBe(0);
    expect(await db.list("stock_events")).toEqual([]);
    expect(await db.list("operations")).toEqual([]);
    expect(await db.list("provisional_purchases")).toEqual([]);
  });

  it("deshacer también es todo o nada", async () => {
    await api.storePurchased(compra().map((item) => ({ ...item, done: true })));
    vi.spyOn(db, "applyBatch").mockRejectedValueOnce(new Error("sin red"));
    await expect(api.undo()).rejects.toThrow("sin red");
    expect(await stockOf("Leche entera")).toBe(1);
    expect(await api.undo()).toMatch(/Compra/);
    expect(await stockOf("Leche entera")).toBe(0);
  });

  it("si el ticket no se guarda, su foto no queda huérfana", async () => {
    vi.spyOn(db, "uploadTicketImage").mockResolvedValueOnce("hogar/t1.jpg");
    const removeImages = vi.spyOn(db, "removeTicketImages");
    vi.spyOn(db, "applyBatch").mockRejectedValueOnce(new Error("sin red"));
    await expect(
      api.saveTicket({
        image: new Blob(["x"]),
        merchant: "Mercadona",
        purchasedAt: "2026-10-17",
        totalCents: 300,
        rawText: "",
        items: [{ description: "Leche entera", quantity: 1, lineTotalCents: 95 }],
      }),
    ).rejects.toThrow("sin red");
    expect(removeImages).toHaveBeenCalledWith(["hogar/t1.jpg"]);
    expect((await api.tickets()).tickets).toEqual([]);
  });
});

describe("consultas precisas", () => {
  it("cambiar existencias no lee el catálogo entero", async () => {
    const leche = (await api.products()).find((product) => product.name === "Leche entera")!;
    const list = vi.spyOn(db, "list");
    await api.updateProduct(leche.id, { currentStock: 2 });
    expect(list).not.toHaveBeenCalledWith("products");
    expect(await stockOf("Leche entera")).toBe(2);
  });

  it("listBy filtra por columna", async () => {
    const leche = (await api.products()).find((product) => product.name === "Leche entera")!;
    await api.addLot({ productId: leche.id, productName: leche.name, quantity: 1, expiryDate: null });
    await api.addLot({ productId: null, productName: "Otro", quantity: 1, expiryDate: null });
    expect((await db.listBy("inventory_lots", "productId", leche.id)).map((lot) => lot.productName)).toEqual([
      "Leche entera",
    ]);
  });
});
