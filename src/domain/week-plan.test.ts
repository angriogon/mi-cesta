import { describe, expect, it } from "vitest";
import type { InventoryLot } from "../data/types";
import type { StockForRecipes } from "./recipes";
import { filterRecipes, scoreRecipes } from "./recipes";
import { planWeek } from "./week-plan";

const now = new Date("2026-10-19T09:00:00");
const stock: StockForRecipes[] = [
  { name: "Merluza", category: "Carne y pescado", quantity: 1 },
  { name: "Pechuga de pollo", category: "Carne y pescado", quantity: 3 },
  { name: "Huevos L", category: "Refrigerados", quantity: 2 },
  { name: "Berenjena", category: "Fruta y verdura", quantity: 1 },
  { name: "Calabacín", category: "Fruta y verdura", quantity: 2 },
  { name: "Tomate", category: "Fruta y verdura", quantity: 4 },
  { name: "Cebolla", category: "Fruta y verdura", quantity: 3 },
  { name: "Arroz largo", category: "Despensa", quantity: 2 },
  { name: "Garbanzos", category: "Despensa", quantity: 2 },
  { name: "Gel de ducha", category: "Higiene y hogar", quantity: 5 },
];
const lot = (productName: string, expiryDate: string): InventoryLot => ({
  id: productName,
  householdId: "h",
  productId: null,
  productName,
  quantity: 1,
  expiryDate,
  estimated: false,
  state: "closed",
  location: null,
  createdAt: "",
  updatedAt: "",
});

describe("planificador de la semana", () => {
  const plan = planWeek({ stock, now });

  it("propone comida y cena para los 7 días, sin repetir receta", () => {
    expect(plan.slots).toHaveLength(14);
    expect(plan.slots.map((slot) => slot.meal).slice(0, 4)).toEqual(["Comida", "Cena", "Comida", "Cena"]);
    expect(plan.slots[0].date).toBe("2026-10-19");
    expect(plan.slots[13].date).toBe("2026-10-25");
    const ids = plan.slots.map((slot) => slot.recipe?.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("reparte el stock: lo que solo hay una vez se usa una vez", () => {
    const uses = plan.slots.flatMap((slot) => slot.uses);
    expect(uses.filter((name) => name === "Merluza").length).toBeLessThanOrEqual(1);
    expect(uses.filter((name) => name === "Berenjena").length).toBeLessThanOrEqual(1);
    expect(uses.filter((name) => name === "Pechuga de pollo").length).toBeLessThanOrEqual(3);
    expect(uses).not.toContain("Gel de ducha");
    expect(plan.used).toBeGreaterThan(5);
  });

  it("lo que falta se junta sin repetir para añadirlo a la lista", () => {
    const all = plan.slots.flatMap((slot) => slot.missing);
    expect(plan.missing.length).toBe(new Set(all.map((name) => name.toLowerCase())).size);
  });

  it("adelanta lo que caduca pronto", () => {
    const withExpiry = planWeek({ stock, now, lots: [lot("Merluza", "2026-10-20")] });
    const merluza = withExpiry.slots.findIndex((slot) => slot.uses.includes("Merluza"));
    expect(merluza).toBeGreaterThanOrEqual(0);
    expect(withExpiry.slots[merluza].day).toBeLessThanOrEqual(1);
    expect(withExpiry.slots[merluza].saves).toContain("Merluza");
  });

  it("respeta lo descartado, el perfil alimentario y los huecos ya elegidos", () => {
    const first = plan.slots[0].recipe!;
    const without = planWeek({ stock, now, exclude: new Set([first.id]) });
    expect(without.slots.map((slot) => slot.recipe?.id)).not.toContain(first.id);

    const noPollo = planWeek({ stock, now, blocked: (recipe) => recipe.ingredients.includes("pollo") });
    expect(noPollo.slots.some((slot) => slot.recipe?.ingredients.includes("pollo"))).toBe(false);

    const kept = planWeek({ stock, now, fixed: { 0: first.id }, exclude: new Set([plan.slots[1].recipe!.id]) });
    expect(kept.slots[0].recipe?.id).toBe(first.id);
    expect(kept.slots[1].recipe?.id).not.toBe(plan.slots[1].recipe!.id);
  });

  it("es determinista y no rompe con el almacén vacío", () => {
    expect(planWeek({ stock, now }).slots.map((slot) => slot.recipe?.id)).toEqual(
      plan.slots.map((slot) => slot.recipe?.id),
    );
    const empty = planWeek({ stock: [], now });
    expect(empty.slots.every((slot) => slot.recipe)).toBe(true);
    expect(empty.ready).toBe(0);
  });
});

describe("orden de las recetas", () => {
  it("alfabético, con las favoritas primero", () => {
    const scored = scoreRecipes(stock);
    const visible = filterRecipes(scored, {
      filter: "all",
      goal: "all",
      query: "",
      skipped: new Set(),
      lots: [],
      favorites: new Set([scored.at(-1)!.id]),
    });
    expect(visible[0].id).toBe(scored.at(-1)!.id);
    const rest = visible.slice(1).map((recipe) => recipe.title);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
  });
});
