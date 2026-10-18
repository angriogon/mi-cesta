import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeByName } from "../domain/lists";
import { CestaApi } from "./api";
import { LocalDb, memoryPersistence } from "./local-db";
import { seedIfEmpty } from "./seed";

let api: CestaApi;
let db: LocalDb;

beforeEach(async () => {
  db = new LocalDb("hogar-test", memoryPersistence());
  await seedIfEmpty(db);
  api = new CestaApi(db, {
    fetch: async (_cp, names) =>
      names.filter((name) => /tomate/i.test(name)).map((name) => ({ name, priceCents: 249 })),
  });
});

const byName = async (name: string) => (await api.products()).find((product) => product.name === name)!;

describe("hogar nuevo", () => {
  it("empieza con el catálogo base vacío de existencias y sin datos", async () => {
    const products = await api.products();
    expect(products.length).toBe(345);
    expect(products.every((product) => product.currentStock === 0 && product.minimumStock === 0)).toBe(true);
    expect(await api.lots()).toEqual([]);
    expect((await api.tickets()).tickets).toEqual([]);
    expect((await api.lists()).revision).toBe(0);
    const overview = await api.overview([]);
    expect(overview.tranquility.score).toBe(100);
  });
});

describe("catálogo", () => {
  it("crea productos, rechaza duplicados y nombres vacíos", async () => {
    await api.createProduct({ name: "Kombucha de jengibre", category: "Bebidas" });
    await expect(api.createProduct({ name: "kombucha de jengibre", category: "Bebidas" })).rejects.toThrow("ya existe");
    await expect(api.createProduct({ name: " ", category: "Bebidas" })).rejects.toThrow();
  });

  it("guarda existencias y mínimos sin permitir negativos", async () => {
    const arroz =
      (await api.products()).find((product) => product.sku === "despensa-arroz") ?? (await api.products())[0];
    await api.updateProduct(arroz.id, { currentStock: -3, minimumStock: 2 });
    const updated = (await api.products()).find((product) => product.id === arroz.id)!;
    expect(updated.currentStock).toBe(0);
    expect(updated.minimumStock).toBe(2);
  });
});

describe("compra y ticket", () => {
  it("lo guardado desde la tienda no se duplica al guardar el ticket", async () => {
    await api.storePurchased([{ id: "1", name: "Leche entera", quantity: 2, category: "Refrigerados", done: true }]);
    expect((await byName("Leche entera")).currentStock).toBe(2);

    const result = await api.saveTicket({
      image: null,
      merchant: "Mercadona",
      purchasedAt: "2026-10-17",
      totalCents: 500,
      rawText: "",
      items: [
        { description: "LECHE ENTERA", quantity: 3, lineTotalCents: 300 },
        { description: "TOMATE ENSALADA", quantity: 1, lineTotalCents: 200 },
        { description: "ZZZ PRODUCTO RARO", quantity: 1, lineTotalCents: 0 },
      ],
    });
    expect(result.added).toBe(2);
    expect((await byName("Leche entera")).currentStock).toBe(3);
    expect((await byName("Tomate ensalada")).currentStock).toBe(1);
    const { tickets, reviews } = await api.tickets();
    expect(tickets[0].items).toHaveLength(3);
    expect(reviews.map((review) => review.issueType)).toEqual(["unidentified"]);
    // Los perecederos del ticket generan un lote para seguir su caducidad.
    expect((await api.lots()).map((lot) => lot.productName)).toContain("Tomate ensalada");
  });

  it("deshacer un ticket devuelve el almacén a como estaba", async () => {
    await api.saveTicket({
      image: null,
      merchant: "Mercadona",
      purchasedAt: "2026-10-17",
      totalCents: 120,
      rawText: "",
      items: [{ description: "GARBANZO COCIDO", quantity: 2, lineTotalCents: 120 }],
    });
    const before = await api.products();
    const garbanzo = before.find((product) => product.currentStock === 2)!;
    expect(garbanzo).toBeTruthy();
    expect((await api.overview([])).undo?.summary).toBe("Ticket · Mercadona");
    expect(await api.undo()).toBe("Ticket · Mercadona");
    expect((await byName(garbanzo.name)).currentStock).toBe(0);
    expect((await api.tickets()).tickets).toEqual([]);
    expect((await api.overview([])).undo).toBeNull();
  });

  it("la revisión de una línea aprende el nombre para el siguiente ticket", async () => {
    await api.saveTicket({
      image: null,
      merchant: "Lidl",
      purchasedAt: "2026-10-17",
      totalCents: 199,
      rawText: "",
      items: [{ description: "KMB JENGIBRE 330", quantity: 1, lineTotalCents: 199 }],
    });
    const [review] = (await api.tickets()).reviews;
    await api.resolveReview(review.id, "Kombucha de jengibre");
    expect((await byName("Kombucha de jengibre")).currentStock).toBe(1);
    expect((await api.tickets()).reviews).toEqual([]);

    await api.saveTicket({
      image: null,
      merchant: "Lidl",
      purchasedAt: "2026-10-18",
      totalCents: 199,
      rawText: "",
      items: [{ description: "KMB JENGIBRE 330", quantity: 1, lineTotalCents: 199 }],
    });
    expect((await api.tickets()).reviews).toEqual([]);
    expect((await byName("Kombucha de jengibre")).currentStock).toBe(2);
  });

  it("rechaza tickets sin total o con fecha inválida", async () => {
    const base = { image: null, merchant: "X", rawText: "", items: [] };
    await expect(api.saveTicket({ ...base, purchasedAt: "2026-10-17", totalCents: 0 })).rejects.toThrow("total");
    await expect(api.saveTicket({ ...base, purchasedAt: "17/10/2026", totalCents: 100 })).rejects.toThrow("fecha");
  });
});

describe("listas compartidas", () => {
  it("si otro dispositivo guardó antes, mezcla en vez de pisar", async () => {
    const lists = await api.lists();
    const other = new CestaApi(db);
    await other.saveLists(
      [{ id: "a", name: "Pan", quantity: 1, category: "Panadería", done: false }],
      [],
      lists.revision,
      (r) => r,
    );
    const saved = await api.saveLists(
      [{ id: "b", name: "Leche", quantity: 1, category: "Refrigerados", done: false }],
      [],
      lists.revision,
      (remote) => ({
        ...remote,
        shopping: mergeByName(remote.shopping, [
          { id: "b", name: "Leche", quantity: 1, category: "Refrigerados", done: false },
        ]),
      }),
    );
    expect(saved.shopping.map((item) => item.name).sort()).toEqual(["Leche", "Pan"]);
    expect(saved.revision).toBe(2);
  });
});

describe("recetas, AutoCesta y respuestas", () => {
  it("cocinar descuenta ingredientes, guarda raciones y se puede deshacer", async () => {
    const huevos = (await api.products()).find((product) => /huevo/i.test(product.name))!;
    await api.updateProduct(huevos.id, { currentStock: 6 });
    await api.cook("Tortilla francesa de calabacín y cebolla", ["huevo", "calabacín", "cebolla"], 3);
    expect((await byName(huevos.name)).currentStock).toBe(5);
    const lots = await api.lots();
    expect(lots).toEqual([
      expect.objectContaining({
        productName: "Raciones de Tortilla francesa de calabacín y cebolla",
        quantity: 2,
        state: "cooked",
      }),
    ]);
    await api.undo();
    expect((await byName(huevos.name)).currentStock).toBe(6);
    expect(await api.lots()).toEqual([]);
  });

  it("responder 'No' deja el producto a cero y se puede deshacer", async () => {
    const ajo = (await api.products())[5];
    await api.updateProduct(ajo.id, { currentStock: 3, minimumStock: 1 });
    await api.answer(ajo.id, "no");
    expect((await byName(ajo.name)).currentStock).toBe(0);
    await api.undo();
    expect((await byName(ajo.name)).currentStock).toBe(3);
  });

  it("'No sugerir' oculta el producto de las sugerencias", async () => {
    const product = (await api.products())[10];
    await api.updateProduct(product.id, { currentStock: 0, minimumStock: 2 });
    await api.setMode("autocesta");
    expect((await api.overview([])).suggestions.map((item) => item.productId)).toContain(product.id);
    await api.suppress(product.id);
    expect((await api.overview([])).suggestions.map((item) => item.productId)).not.toContain(product.id);
  });

  it("las compras evitadas cuentan en el resumen semanal", async () => {
    await api.avoided();
    expect((await api.overview([])).weekly.avoidedPurchases).toBe(1);
  });
});

describe("precios", () => {
  it("sin código postal no consulta fuera y conserva lo aprendido", async () => {
    const result = await api.refreshPrices();
    expect(result.online).toBe(false);
    expect(result.externalUpdated).toBe(0);
  });

  it("con código postal actualiza fruta y verdura desde la referencia externa", async () => {
    await api.setPostalCode("41300");
    const result = await api.refreshPrices();
    expect(result.online).toBe(true);
    expect(result.externalUpdated).toBeGreaterThan(0);
    expect(result.prices.every((price) => price.category === "Fruta y verdura")).toBe(true);
    expect(result.meta.lastSuccessfulAt).not.toBeNull();
    await expect(api.setPostalCode("4130")).rejects.toThrow();
  });
});

describe("Serranito", () => {
  it("gestiona artículos, nombre y avisos", async () => {
    const item = await api.addDogItem("Snack dental");
    await expect(api.addDogItem("snack dental")).rejects.toThrow();
    await api.updateDogItem({ id: item.id, currentStock: 3, minimumStock: -1 });
    expect((await api.dogItems()).items[0]).toMatchObject({ currentStock: 3, minimumStock: 0 });
    expect(await api.setPetName("  Toby ")).toBe("Toby");
    let reminders = await api.addReminder("Dar snack", "21:00");
    reminders = await api.addReminder("Paseo", "08:30");
    expect(reminders.map((reminder) => reminder.reminderTime)).toEqual(["08:30", "21:00"]);
    reminders = await api.updateReminder(reminders[0].id, { enabled: false });
    expect(reminders[0].enabled).toBe(false);
    await expect(api.addReminder("X", "25h")).rejects.toThrow();
    expect(await api.deleteReminder(reminders[0].id)).toHaveLength(1);
  });
});

describe("inventario rápido y códigos de barras", () => {
  it("guarda el progreso y al incorporar suma existencias con su ubicación", async () => {
    const id = await api.saveQuickSession(null, "Congelador", [
      {
        id: "1",
        name: "Guisantes congelados",
        quantity: 2,
        category: "Congelados",
        unit: "unidad",
        confidence: 0.9,
        source: "manual",
      },
    ]);
    expect((await api.quickInventory()).sessions).toHaveLength(1);
    const count = await api.commitQuickSession(id, "Congelador", [
      {
        id: "1",
        name: "Guisantes congelados",
        quantity: 2,
        category: "Congelados",
        unit: "unidad",
        confidence: 0.9,
        source: "manual",
      },
    ]);
    expect(count).toBe(1);
    expect((await api.quickInventory()).sessions).toEqual([]);
    expect((await api.lots())[0]).toMatchObject({ location: "Congelador", state: "frozen", quantity: 2 });
  });

  it("recuerda códigos guardados por el hogar y consulta Open Food Facts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name_es: "Galletas María",
            brands: "Marca",
            allergens_tags: ["en:gluten"],
            nutriments: { "energy-kcal_100g": 440 },
          },
        }),
      ),
    );
    const found = await api.lookupBarcode("8410000000000");
    expect(found).toMatchObject({ name: "Galletas María", allergens: ["gluten"] });
    expect(found?.nutrients.kcal).toBe(440);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 0 })));
    expect(await api.lookupBarcode("8410000000017")).toBeNull();
    await api.saveBarcode("8410000000017", "Mi producto");
    expect((await api.lookupBarcode("8410000000017"))?.name).toBe("Mi producto");
    await expect(api.lookupBarcode("123")).rejects.toThrow();
    fetchSpy.mockRestore();
  });
});

describe("restablecer", () => {
  it("borra todo y deja el catálogo base a cero", async () => {
    await api.createProduct({ name: "Producto propio", category: "Despensa" });
    const p = (await api.products())[0];
    await api.updateProduct(p.id, { currentStock: 4, minimumStock: 2 });
    await api.addDogItem("Pienso");
    await api.saveLists([{ id: "1", name: "Pan", quantity: 1, category: "Panadería", done: false }], [], 0, (r) => r);
    await api.resetHousehold();
    const products = await api.products();
    expect(products.length).toBe(345);
    expect(products.every((product) => product.currentStock === 0 && product.minimumStock === 0)).toBe(true);
    expect((await api.dogItems()).items).toEqual([]);
    expect((await api.lists()).shopping).toEqual([]);
  });
});

describe("privacidad", () => {
  it("exporta todos los datos del hogar en un archivo legible", async () => {
    await api.createProduct({ name: "Kombucha de jengibre", category: "Bebidas" });
    const data = await api.exportHousehold();
    expect(data.format).toBe("cesta-export");
    expect(data.household).toMatchObject({ id: "hogar-test" });
    expect(data.tables.products?.length).toBe(346);
    expect(Object.keys(data.tables)).toEqual(
      expect.arrayContaining(["inventory_lots", "tickets", "prices", "dog_items", "dog_reminders", "stock_events"]),
    );
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});

describe("alimentación especial", () => {
  it("no guarda alergias sin consentimiento y las borra al retirarlo", async () => {
    await expect(
      api.savePreferences({ specialDietEnabled: true, allergens: ["gluten"], avoided: [], healthConsentAt: null }),
    ).rejects.toThrow("consentimiento");
    const at = "2026-10-18T10:00:00.000Z";
    await api.savePreferences({ specialDietEnabled: true, allergens: ["gluten"], avoided: [], healthConsentAt: at });
    expect(await api.preferences()).toMatchObject({ allergens: ["gluten"], healthConsentAt: at });
    await api.savePreferences({ specialDietEnabled: false, allergens: [], avoided: [], healthConsentAt: null });
    expect(await api.preferences()).toMatchObject({ allergens: [], avoided: [], healthConsentAt: null });
  });
});

describe("primer uso", () => {
  it("propone los básicos del catálogo y guarda sus mínimos de una vez", async () => {
    const { needsStarter, starterChoices } = await import("../domain/starter");
    const products = await api.products();
    expect(needsStarter(products)).toBe(true);
    const choices = starterChoices(products);
    expect(choices.length).toBeGreaterThanOrEqual(15);
    await api.setStarterMinimums(choices.map(({ product, minimum }) => ({ productId: product.id, minimum })));
    const after = await api.products();
    expect(needsStarter(after)).toBe(false);
    expect(after.find((product) => product.name === "Leche semidesnatada")?.minimumStock).toBe(2);
  });
});

describe("recetas favoritas", () => {
  it("recuerda la última marca de cada receta", async () => {
    await api.recipeFavorite("r1", true);
    await api.recipeFavorite("r2", true);
    await api.recipeFavorite("r1", false);
    expect([...(await api.favoriteRecipes())]).toEqual(["r2"]);
  });
});
