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
  api = new CestaApi(db);
});

const byName = async (name: string) => (await api.products()).find((product) => product.name === name)!;

describe("hogar nuevo", () => {
  it("empieza con el catálogo base vacío de existencias y sin datos", async () => {
    const products = await api.products();
    expect(products.length).toBe(399);
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
      items: [{ description: "KMB JNG 330", quantity: 1, lineTotalCents: 199 }],
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
      items: [{ description: "KMB JNG 330", quantity: 1, lineTotalCents: 199 }],
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
  it("solo usa lo pagado en los tickets: los de la tienda online antigua se ignoran", async () => {
    await db.insert("prices", [
      {
        id: "mercadona:x",
        householdId: "hogar-test",
        productId: "x",
        productName: "Tomate ensalada",
        category: "Fruta y verdura",
        priceCents: 249,
        merchant: "Mercadona",
        source: "mercadona",
        observedAt: "2026-10-01T10:00:00.000Z",
      },
    ]);
    const result = await api.refreshPrices();
    expect(result.learned).toBe(0);
    expect(result.prices).toEqual([]);
  });

  it("guarda el último precio de cada súper y el súper elegido para la compra", async () => {
    const base = {
      householdId: "hogar-test",
      productId: "x",
      productName: "Tomate ensalada",
      category: "Fruta y verdura" as const,
      source: "ticket" as const,
    };
    await db.insert("prices", [
      { ...base, id: "p1", priceCents: 249, merchant: "Mercadona", observedAt: "2026-10-01T10:00:00.000Z" },
      { ...base, id: "p2", priceCents: 239, merchant: "MERCADONA S.A.", observedAt: "2026-10-08T10:00:00.000Z" },
      { ...base, id: "p3", priceCents: 199, merchant: "Dia", observedAt: "2026-10-05T10:00:00.000Z" },
    ]);
    const { prices } = await api.prices();
    expect(prices.map((price) => price.priceCents).sort()).toEqual([199, 239]);
    expect((await api.setPreferredStore("DIA")).preferredStore).toBe("DIA");
    // Actualizar precios no olvida el súper elegido.
    expect((await api.refreshPrices()).meta.preferredStore).toBe("DIA");
    expect((await api.prices()).meta.preferredStore).toBe("DIA");
  });
});

describe("plan de la semana del hogar", () => {
  it("lo que guarda un miembro lo ve otro, y solo queda el último", async () => {
    expect(await api.weekPlan()).toBeNull();
    const ids = Array.from({ length: 14 }, (_, index) => `receta-${index}`);
    await api.saveWeekPlan("2026-10-19", ids);
    // Otro miembro: otra instancia de la API sobre los mismos datos del hogar.
    const other = new CestaApi(db);
    expect(await other.weekPlan()).toMatchObject({ start: "2026-10-19", ids });
    await other.saveWeekPlan("2026-10-19", ["otra", ...ids.slice(1)]);
    expect((await api.weekPlan())?.ids[0]).toBe("otra");
    expect((await db.list("household_events")).filter((event) => event.kind === "week-plan")).toHaveLength(1);
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
    const found = await api.lookupBarcode("8410000000009");
    expect(found).toMatchObject({ name: "Galletas María", allergens: ["gluten"] });
    expect(found?.nutrients.kcal).toBe(440);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 0 })));
    expect(await api.lookupBarcode("8410000000016")).toBeNull();
    await api.saveBarcode("8410000000016", "Mi producto");
    expect((await api.lookupBarcode("8410000000016"))?.name).toBe("Mi producto");
    await expect(api.lookupBarcode("123")).rejects.toThrow();
    await expect(api.lookupBarcode("8410000000001")).rejects.toThrow(/último número no cuadra/);
    fetchSpy.mockRestore();
  });

  it("si no es comida, busca en las bases de limpieza, cosmética y mascotas", async () => {
    const hosts: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      hosts.push(url.host);
      const known = url.host === "world.openproductsfacts.org";
      return Promise.resolve(
        new Response(
          JSON.stringify(
            known
              ? { status: 1, product: { product_name: "Lavavajillas a mano", brands: "Bosque Verde" } }
              : { status: 0 },
          ),
        ),
      );
    });
    const found = await api.lookupBarcode("8480000160270");
    expect(found).toMatchObject({ code: "8480000160270", name: "Lavavajillas a mano", source: "Open Products Facts" });
    expect(hosts[0]).toBe("world.openfoodfacts.org");
    expect(hosts).toContain("world.openbeautyfacts.org");
    fetchSpy.mockRestore();
  });

  it("un envasado de marca propia con código que empieza por 2 se busca en Open Food Facts", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ status: 1, product: { product_name: "Rosquillas 2 sabores", brands: "Alcampo" } }),
          ),
        ),
      );
    expect(await api.lookupBarcode("2074477001295")).toMatchObject({ name: "Rosquillas 2 sabores", brand: "Alcampo" });
    fetchSpy.mockRestore();
  });

  it("las etiquetas de la balanza se recuerdan por el artículo", async () => {
    const hosts: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      hosts.push(new URL(input instanceof Request ? input.url : input).host);
      return Promise.resolve(new Response(JSON.stringify({ status: 0 })));
    });
    expect(await api.lookupBarcode("2300540012500")).toBeNull();
    await api.saveBarcode("2300540012500", "Pechuga de pollo al corte");
    // Otra etiqueta del mismo artículo con otro precio.
    expect(await api.lookupBarcode("2300540034502")).toMatchObject({
      code: "2300540034502",
      name: "Pechuga de pollo al corte",
      source: "Guardado por tu hogar · al peso",
    });
    // Solo se pregunta a Open Food Facts por el código exacto, no a las bases de limpieza o cosmética.
    expect(new Set(hosts)).toEqual(new Set(["world.openfoodfacts.org"]));
    // Corregir el nombre de una etiqueta concreta cambia el del artículo.
    await api.saveBarcode("2300540034502", "Contramuslo de pollo");
    expect((await api.lookupBarcode("2300540012500"))?.name).toBe("Contramuslo de pollo");
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
    expect(products.length).toBe(399);
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
    expect(data.tables.products?.length).toBe(400);
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

describe("equivalencias de tickets", () => {
  const ticket = (items: { description: string; productId?: string | null; skip?: boolean }[]) =>
    api.saveTicket({
      image: null,
      merchant: "Mercadona",
      purchasedAt: "2026-09-28",
      totalCents: 1000,
      rawText: "",
      items: items.map((item) => ({ quantity: 1, lineTotalCents: 500, ...item })),
    });

  it("PECHUGA FAMILIAR suma a Pechuga de pollo sin preguntar", async () => {
    const [match] = await api.matchTicketItems([{ description: "PECHUGA FAMILIAR", quantity: 1, lineTotalCents: 735 }]);
    expect(match).toMatchObject({ productName: "Pechuga de pollo", source: "equivalence" });
    const result = await ticket([{ description: "PECHUGA FAMILIAR" }]);
    expect(result.reviews).toBe(0);
    expect((await byName("Pechuga de pollo")).currentStock).toBe(1);
  });

  it("si se elige otro producto, se recuerda para los próximos tickets", async () => {
    const pollo = await byName("Pollo entero");
    await ticket([{ description: "PECHUGA FAMILIAR", productId: pollo.id }]);
    expect((await byName("Pollo entero")).currentStock).toBe(1);
    expect((await api.equivalences()).map((item) => [item.alias, item.productName])).toEqual([
      ["PECHUGA FAMILIAR", "Pollo entero"],
    ]);
    const [next] = await api.matchTicketItems([{ description: "PECHUGA FAMILIAR", quantity: 1, lineTotalCents: 735 }]);
    expect(next).toMatchObject({ productName: "Pollo entero", source: "alias" });
    await ticket([{ description: "PECHUGA FAMILIAR" }]);
    expect((await byName("Pollo entero")).currentStock).toBe(2);
    expect((await byName("Pechuga de pollo")).currentStock).toBe(0);
  });

  it("las líneas que no son del almacén no suman ni quedan para revisar", async () => {
    const result = await ticket([{ description: "BOLSA PLASTICO", skip: true }]);
    expect(result).toMatchObject({ reviews: 0, added: 0 });
  });

  it("se pueden crear, cambiar y borrar a mano", async () => {
    const pavo = await byName("Pechuga de pavo");
    const pollo = await byName("Pechuga de pollo");
    await api.setEquivalence("PECHUGA FAMILIAR", pavo.id);
    await api.setEquivalence("pechuga familiar", pollo.id);
    const [saved] = await api.equivalences();
    expect(saved).toMatchObject({ alias: "PECHUGA FAMILIAR", productName: "Pechuga de pollo" });
    await api.removeEquivalence(saved.id);
    expect(await api.equivalences()).toEqual([]);
    await expect(api.setEquivalence("  ", pollo.id)).rejects.toThrow("texto");
  });
});

describe("del ticket a las recetas", () => {
  it("lo que entra por el ticket con su equivalencia cuenta como ingrediente", async () => {
    const { scoreRecipes } = await import("../domain/recipes");
    await api.saveTicket({
      image: null,
      merchant: "Mercadona",
      purchasedAt: "2026-09-28",
      totalCents: 1260,
      rawText: "",
      items: [
        { description: "PECHUGA FAMILIAR", quantity: 1, lineTotalCents: 735 },
        { description: "24 HUEVOS FRESCOS", quantity: 1, lineTotalCents: 525 },
      ],
    });
    const stock = (await api.products())
      .filter((product) => product.currentStock > 0)
      .map((product) => ({ name: product.name, category: product.category, quantity: product.currentStock }));
    expect(stock.map((item) => item.name).sort()).toEqual(["Huevos L", "Pechuga de pollo"]);
    const recipes = scoreRecipes(stock);
    const withChicken = recipes.find((recipe) => recipe.ingredients.includes("pollo"));
    const withEgg = recipes.find((recipe) => recipe.ingredients.includes("huevo"));
    expect(withChicken?.present).toContain("pollo");
    expect(withEgg?.present).toContain("huevo");
  });
});

describe("arreglar equivalencias antiguas", () => {
  /** Como en un hogar real: un producto creado con el texto del ticket y su equivalencia repetida. */
  async function legacy(name: string, alias = name, stock = 3) {
    const product = await api.createProduct({ name, category: "Carne y pescado" });
    await api.updateProduct(product.id, { currentStock: stock });
    const rows = [1, 2, 3].map((n) => ({
      id: `alias-${name}-${n}`,
      householdId: "hogar-test",
      alias,
      productId: product.id,
      createdAt: `2026-09-0${n}T10:00:00.000Z`,
    }));
    await db.insert("name_aliases", rows);
    await db.insert("prices", [
      {
        id: `t1:${product.id}`,
        householdId: "hogar-test",
        productId: product.id,
        productName: product.name,
        category: product.category,
        priceCents: 735,
        merchant: "Mercadona",
        source: "ticket",
        observedAt: "2026-09-28T12:00:00.000Z",
      },
    ]);
    await api.addLot({ productId: product.id, productName: product.name, quantity: stock, expiryDate: "2026-10-30" });
    return product;
  }

  it("quita las equivalencias repetidas y señala las que apuntan a un producto creado desde el ticket", async () => {
    await legacy("PECHUGA FAMILIAR");
    const list = await api.equivalences();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ alias: "PECHUGA FAMILIAR", productName: "PECHUGA FAMILIAR", fromTicket: true });
    expect(await db.list("name_aliases")).toHaveLength(1);
  });

  it("al cambiarla, mueve existencias, caducidades y precios al producto elegido y borra el viejo", async () => {
    const old = await legacy("PECHUGA FAMILIAR");
    const pollo = await byName("Pechuga de pollo");
    const result = await api.setEquivalence("PECHUGA FAMILIAR", pollo.id);
    expect(result).toEqual({ merged: "PECHUGA FAMILIAR", moved: 3 });
    expect((await byName("Pechuga de pollo")).currentStock).toBe(3);
    expect((await api.products()).some((product) => product.id === old.id)).toBe(false);
    expect((await api.lots()).map((lot) => [lot.productId, lot.productName])).toEqual([[pollo.id, "Pechuga de pollo"]]);
    expect((await db.list("prices")).map((price) => price.productName)).toEqual(["Pechuga de pollo"]);
    expect(await api.equivalences()).toMatchObject([{ alias: "PECHUGA FAMILIAR", productName: "Pechuga de pollo" }]);
  });

  it("no fusiona un producto que alguien creó con otro nombre a propósito", async () => {
    const own = await legacy("NAPOLITANA CHOCOLATE", "NAPO CHOCO 35%", 2);
    const napolitanas = await byName("Napolitanas");
    expect((await api.equivalences())[0].fromTicket).toBe(false);
    expect(await api.setEquivalence("NAPO CHOCO 35%", napolitanas.id)).toEqual({ merged: null, moved: 0 });
    expect((await api.products()).find((product) => product.id === own.id)?.currentStock).toBe(2);
  });

  it("al resolver una línea dudosa usa las equivalencias de serie en vez de crear un producto", async () => {
    await api.saveTicket({
      image: null,
      merchant: "Mercadona",
      purchasedAt: "2026-09-28",
      totalCents: 735,
      rawText: "",
      items: [{ description: "XQZ LINEA RARA", quantity: 1, lineTotalCents: 735 }],
    });
    const [review] = (await api.tickets()).reviews;
    await api.resolveReview(review.id, "PECHUGA FAMILIAR");
    expect((await byName("Pechuga de pollo")).currentStock).toBe(1);
    expect((await api.products()).some((product) => product.name === "PECHUGA FAMILIAR")).toBe(false);
  });
});

describe("sugerencias para equivalencias antiguas", () => {
  it("propone el producto del catálogo que corresponde", async () => {
    const product = await api.createProduct({ name: "24 HUEVOS FRESCOS", category: "Refrigerados" });
    await db.insert("name_aliases", [
      {
        id: "a1",
        householdId: "hogar-test",
        alias: "24 HUEVOS FRESCOS",
        productId: product.id,
        createdAt: "2026-09-01",
      },
    ]);
    const [item] = await api.equivalences();
    expect(item).toMatchObject({ fromTicket: true, suggestion: { productName: "Huevos L" } });
  });
});
