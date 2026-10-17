import { describe, expect, it } from "vitest";
import type { InventoryLot, Product, StockEvent } from "../data/types";
import { buildOverview, certaintyFor, expiringLots, predictions } from "./autocesta";
import { guessCategory } from "./categories";
import { addNeeds, addToShopping, duplicateCount, mergeByName, mergeDuplicates, moveToChecklist } from "./lists";
import { findProduct, nameScore, similarNames } from "./matching";
import { labelsFromOcr, leadingQuantity, mergeQuickItems, parseSpokenList, stripQuantity } from "./quick";
import { chainedPlan, dietConflicts, filterRecipes, hasIngredient, scoreRecipes } from "./recipes";
import { compareWithPlan, parseTicketText, reviewTicketLines } from "./tickets";

const NOW = new Date("2026-10-17T10:00:00");

function product(name: string, patch: Partial<Product> = {}): Product {
  return {
    id: name,
    householdId: "h",
    sku: name,
    name,
    category: guessCategory(name),
    currentStock: 0,
    minimumStock: 0,
    suppressed: false,
    confirmedAt: NOW.toISOString(),
    plannedUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: NOW.toISOString(),
    ...patch,
  };
}

function lot(name: string, patch: Partial<InventoryLot> = {}): InventoryLot {
  return {
    id: `lot-${name}`,
    householdId: "h",
    productId: name,
    productName: name,
    quantity: 1,
    expiryDate: null,
    estimated: false,
    state: "closed",
    location: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...patch,
  };
}

describe("categorías", () => {
  it("deduce categorías habituales sin acentos ni mayúsculas", () => {
    expect(guessCategory("Plátanos de Canarias")).toBe("Fruta y verdura");
    expect(guessCategory("LECHE ENTERA")).toBe("Refrigerados");
    expect(guessCategory("Pienso para perros")).toBe("Mascotas");
    expect(guessCategory("Garbanzos")).toBe("Despensa");
  });

  it("respeta la categoría que el usuario corrigió", () => {
    expect(guessCategory("Garbanzos", { garbanzos: "Refrigerados" })).toBe("Refrigerados");
  });
});

describe("listas", () => {
  it("suma una unidad si el producto ya está pendiente y marca NUEVO lo desconocido", () => {
    let items = addToShopping([], "leche", [], {});
    items = addToShopping(items, "Leche", [], {});
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].isNew).toBe(true);
    const known = addToShopping(
      [],
      "tomate",
      [{ id: "t", name: "Tomate", category: "Fruta y verdura", quantity: 0, minimum: 0 }],
      {},
    );
    expect(known[0]).toMatchObject({ name: "Tomate", isNew: false });
  });

  it("une repetidos y los mueve a la lista de tienda sumando cantidades", () => {
    const list = [
      { id: "1", name: "Pan", quantity: 1, category: "Panadería" as const, done: false },
      { id: "2", name: "pan", quantity: 2, category: "Panadería" as const, done: false },
    ];
    expect(duplicateCount(list)).toBe(1);
    expect(mergeDuplicates(list)).toEqual([{ ...list[0], quantity: 3 }]);
    const checklist = moveToChecklist(mergeDuplicates(list), [
      { id: "x", name: "PAN", quantity: 1, category: "Panadería", done: true },
    ]);
    expect(checklist).toHaveLength(1);
    expect(checklist[0]).toMatchObject({ quantity: 4, done: false });
  });

  it("añade necesidades sin bajar cantidades ya anotadas", () => {
    const result = addNeeds(
      [{ id: "1", name: "Huevos", quantity: 6, category: "Refrigerados", done: false }],
      [
        { id: "a", name: "Huevos", category: "Refrigerados", quantity: 2, minimum: 4 },
        { id: "b", name: "Arroz", category: "Despensa", quantity: 0, minimum: 2 },
      ],
    );
    expect(result.find((item) => item.name === "Huevos")?.quantity).toBe(6);
    expect(result.find((item) => item.name === "Arroz")?.quantity).toBe(2);
  });

  it("al mezclar listas gana la versión local", () => {
    const merged = mergeByName(
      [{ id: "r", name: "Pan", quantity: 1, category: "Panadería", done: false }],
      [{ id: "l", name: "pan", quantity: 3, category: "Panadería", done: true }],
    );
    expect(merged).toEqual([{ id: "l", name: "pan", quantity: 3, category: "Panadería", done: true }]);
  });
});

describe("emparejamiento de nombres", () => {
  it("reconoce líneas de ticket abreviadas", () => {
    expect(similarNames("LECHE SEMIDESNATADA", "Leche semidesnatada Hacendado")).toBe(true);
    expect(nameScore("TOMATE ENSALADA", "Tomate ensalada")).toBe(1);
    expect(similarNames("ATUN CLARO", "Lechuga")).toBe(false);
  });

  it("usa los alias aprendidos antes que la similitud", () => {
    const products = [product("Yogur natural"), product("Queso fresco")];
    expect(findProduct("YOG NAT 4X125", products, [{ alias: "YOG NAT 4X125", productId: "Yogur natural" }])?.name).toBe(
      "Yogur natural",
    );
    expect(findProduct("XYZ RARO", products)).toBeNull();
  });
});

describe("lectura de tickets", () => {
  const MERCADONA = `MERCADONA, S.A. A-46103834
C/ EJEMPLO 1 41300
17/10/2026 18:42 OP: 123456
FACTURA SIMPLIFICADA
Descripción P. Unit Importe
1 LECHE SEMIDESNATADA 0,89
2 HUEVOS L 12 2,30 4,60
1 PLATANO
0,830 kg 2,10 €/kg 1,74
1 PAN BAGUETTE 0,45
TOTAL (€) 7,68
TARJETA BANCARIA 7,68
IVA BASE IMPONIBLE CUOTA
4% 7,38 0,30`;

  it("extrae fecha, total, supermercado y líneas (incluido el peso)", () => {
    const parsed = parseTicketText(MERCADONA, NOW);
    expect(parsed.purchasedAt).toBe("2026-10-17");
    expect(parsed.total).toBe("7.68");
    expect(parsed.merchant).toBe("Mercadona");
    expect(parsed.items).toEqual([
      { description: "LECHE SEMIDESNATADA", quantity: 1, lineTotalCents: 89 },
      { description: "HUEVOS L 12", quantity: 2, lineTotalCents: 460 },
      { description: "PLATANO", quantity: 0.83, lineTotalCents: 174 },
      { description: "PAN BAGUETTE", quantity: 1, lineTotalCents: 45 },
    ]);
  });

  it("sin fecha usa hoy y no confunde el total con productos", () => {
    const parsed = parseTicketText("Arroz 1,20\nTotal 1,20", NOW);
    expect(parsed.purchasedAt).toBe("2026-10-17");
    expect(parsed.items).toHaveLength(1);
  });

  it("avisa de duplicados y precios inesperados y compara con la compra planificada", () => {
    const items = [
      { description: "LECHE", quantity: 1, lineTotalCents: 300 },
      { description: "leche", quantity: 1, lineTotalCents: 90 },
    ];
    const review = reviewTicketLines(items, [{ productName: "Leche", priceCents: 90 }]);
    expect(review.duplicates).toHaveLength(1);
    expect(review.unexpected).toEqual([{ name: "LECHE", current: 300 }]);
    expect(compareWithPlan([{ name: "Leche" }, { name: "Pan" }], items)).toEqual({ planned: 2, found: 1, missing: 1 });
  });
});

describe("recetas", () => {
  const stock = [
    { name: "Huevos", category: "Refrigerados" as const, quantity: 6 },
    { name: "Calabacín", category: "Fruta y verdura" as const, quantity: 2 },
    { name: "Cebolla", category: "Fruta y verdura" as const, quantity: 1 },
    { name: "Papel higiénico", category: "Higiene y hogar" as const, quantity: 9 },
  ];

  it("reconoce ingredientes por sinónimos y no cuenta productos de limpieza", () => {
    expect(hasIngredient("huevo", stock)).toBe(true);
    expect(hasIngredient("verduras", stock)).toBe(true);
    expect(hasIngredient("pollo", stock)).toBe(false);
  });

  it("ordena primero las recetas que ya se pueden cocinar", () => {
    const scored = scoreRecipes(stock);
    expect(scored[0].title).toBe("Tortilla francesa de calabacín y cebolla");
    expect(scored[0].missing).toEqual([]);
    const ready = filterRecipes(scored, { filter: "ready", goal: "all", query: "", skipped: new Set(), lots: [] });
    expect(ready.every((recipe) => recipe.missing.length === 0)).toBe(true);
    const skipped = filterRecipes(scored, {
      filter: "ready",
      goal: "all",
      query: "",
      skipped: new Set([scored[0].id]),
      lots: [],
    });
    expect(skipped.some((recipe) => recipe.id === scored[0].id)).toBe(false);
    expect(chainedPlan(scored, new Set())).not.toBeNull();
  });

  it("avisa de alérgenos solo con el perfil activo", () => {
    const prefs = { specialDietEnabled: true, allergens: ["huevo"], avoided: [] };
    expect(dietConflicts(["huevo", "calabacín"], prefs)).toEqual(["huevo"]);
    expect(dietConflicts(["huevo"], { ...prefs, specialDietEnabled: false })).toEqual([]);
  });
});

describe("inventario rápido", () => {
  it("entiende cantidades escritas o dictadas", () => {
    expect(leadingQuantity("tres yogures")).toBe(3);
    expect(leadingQuantity("2,5 kg patatas")).toBe(2.5);
    expect(stripQuantity("dos leches.")).toBe("leches");
    const items = parseSpokenList("2 leches, tres yogures y pan", "Frigorífico", "voz", 0.82);
    expect(items.map((item) => [item.name, item.quantity])).toEqual([
      ["leches", 2],
      ["yogures", 3],
      ["pan", 1],
    ]);
  });

  it("propone etiquetas de una foto y suma repetidos", () => {
    const labels = labelsFromOcr("ARROZ REDONDO\n@@\nGarbanzos cocidos\n12", "Despensa · Estantería 1");
    expect(labels.map((item) => item.name)).toEqual(["ARROZ REDONDO", "Garbanzos cocidos"]);
    const merged = mergeQuickItems(labels, [{ ...labels[0], id: "otro", quantity: 2, confidence: 0.9 }]);
    expect(merged[0]).toMatchObject({ quantity: 3, confidence: 0.9 });
  });
});

describe("AutoCesta", () => {
  it("con el hogar vacío todo está en calma", () => {
    const overview = buildOverview({
      mode: "autocesta",
      products: [product("Arroz")],
      lots: [],
      stockEvents: [],
      tickets: [],
      prices: [],
      shopping: [],
      events: [],
      operations: [],
      activity: [],
      now: NOW,
    });
    expect(overview.tranquility).toEqual({ score: 100, label: "Todo en calma" });
    expect(overview.mainRecommendation.title).toBe("Todo bajo control");
    expect(overview.suggestions).toEqual([]);
    expect(overview.undo).toBeNull();
  });

  it("marca lo caducado como caducado y no como 'hoy'", () => {
    const lots = expiringLots([lot("Yogur", { expiryDate: "2026-10-10" })], [product("Yogur")], NOW);
    expect(lots[0].daysUntil).toBe(-7);
    const overview = buildOverview({
      mode: "normal",
      products: [product("Yogur")],
      lots: [lot("Yogur", { expiryDate: "2026-10-10" })],
      stockEvents: [],
      tickets: [],
      prices: [],
      shopping: [],
      events: [],
      operations: [],
      activity: [],
      now: NOW,
    });
    expect(overview.mainRecommendation.type).toBe("expired");
    expect(overview.tranquility.score).toBeLessThan(100);
  });

  it("estima la caducidad de perecederos sin fecha", () => {
    const lots = expiringLots(
      [lot("Pechuga de pollo", { createdAt: "2026-10-15T10:00:00.000Z" })],
      [product("Pechuga de pollo")],
      NOW,
    );
    expect(lots[0]).toMatchObject({ estimated: true, daysUntil: 1 });
  });

  it("sugiere reponer lo que está bajo mínimos solo en modo AutoCesta", () => {
    const products = [product("Leche", { currentStock: 1, minimumStock: 4 })];
    const base = {
      lots: [],
      stockEvents: [],
      tickets: [],
      prices: [],
      shopping: [],
      events: [],
      operations: [],
      activity: [],
      now: NOW,
    };
    expect(buildOverview({ ...base, mode: "normal", products }).suggestions).toEqual([]);
    const auto = buildOverview({ ...base, mode: "autocesta", products });
    expect(auto.suggestions[0]).toMatchObject({ productName: "Leche", quantity: 3 });
    const inList = buildOverview({
      ...base,
      mode: "autocesta",
      products,
      shopping: [{ id: "1", name: "leche", quantity: 1, category: "Refrigerados", done: false }],
    });
    expect(inList.suggestions).toEqual([]);
  });

  it("predice cada cuántos días se repone un producto y baja la certeza con el tiempo", () => {
    const events: StockEvent[] = ["2026-09-17", "2026-09-27", "2026-10-07"].map((day, index) => ({
      id: String(index),
      householdId: "h",
      productId: "Leche",
      delta: 2,
      reason: "ticket",
      createdAt: `${day}T10:00:00.000Z`,
    }));
    const leche = product("Leche", { currentStock: 2, confirmedAt: "2026-10-07T10:00:00.000Z" });
    const [prediction] = predictions([leche], events, NOW);
    expect(prediction).toMatchObject({ averageDays: 10, daysUntil: 0 });
    const certainty = certaintyFor(leche, events, NOW);
    expect(certainty.confidence).toBeLessThan(0.82);
    expect(certainty.estimatedQuantity).toBeLessThan(2);
  });
});
