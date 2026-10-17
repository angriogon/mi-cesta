import type { InventoryLot, Preferences } from "../data/types";
import { daysUntil, normalizeWords } from "../lib/text";
import type { Category } from "./categories";
import { RECIPES } from "./recipes-data";
import { type Nutrients, recipeNutrients, recipeMinutes } from "./recipe-details";

// Nutrientes, pasos y tiempos viven en recipe-details.ts; se reexportan para quien ya los importa desde aquí.
export { recipeMinutes, recipeNutrients, recipeSteps } from "./recipe-details";
export type { Nutrients } from "./recipe-details";

export interface Recipe {
  id: string;
  week: number;
  day: number;
  meal: "Comida" | "Cena";
  title: string;
  ingredients: string[];
}

export interface ScoredRecipe extends Recipe {
  present: string[];
  missing: string[];
  score: number;
  nutrients: Nutrients;
  minutes: number;
}

export type RecipeGoal = "all" | "expiry" | "no-shop" | "quick" | "tomorrow" | "clean" | "opened" | "freeze" | "cheap";
export type RecipeFilter = "all" | "ready" | "near" | "low";

export interface StockForRecipes {
  name: string;
  category: Category;
  quantity: number;
}

const NON_FOOD = new Set<Category>(["Higiene y hogar", "Mascotas", "Bebidas"]);

/** Productos que sirven como cada ingrediente genérico de las recetas. */
const SYNONYMS: Record<string, string[]> = {
  "pescado blanco": ["pescado", "merluza", "bacalao", "lubina"],
  "pescado en conserva": ["atún", "atun", "bonito", "sardinas", "caballa"],
  "carne picada": ["carne", "ternera"],
  "carne de hamburguesa": ["hamburguesa", "carne picada", "carne"],
  "carne de hamburguesa de pollo": ["hamburguesa de pollo", "pollo"],
  pollo: ["pollo", "pavo"],
  pavo: ["pavo", "pollo"],
  "fajitas de trigo": ["fajitas", "tortilla de trigo", "wrap"],
  "fajitas integrales": ["fajitas", "tortilla de trigo", "wrap"],
  "tortilla de trigo": ["tortilla de trigo", "fajitas", "wrap"],
  "cogollos de lechuga": ["cogollos", "lechuga"],
  "tomates cherry": ["tomate cherry", "tomate"],
  "espárragos trigueros": ["trigueros", "espárragos", "esparragos"],
  "espárragos blancos": ["espárragos", "esparragos"],
  "crema de verduras": ["crema de verduras", "verduras"],
  "menestra de verduras": ["menestra", "verduras"],
  "sofrito de verduras": ["sofrito", "verduras"],
  "pisto de verduras": ["pisto", "verduras"],
  "caldo de verduras": ["caldo", "verduras"],
  "noodles de arroz": ["noodles", "fideos de arroz"],
  "pan de hamburguesa": ["pan", "pan de hamburguesa"],
  "queso cottage": ["cottage", "queso fresco"],
  "queso feta": ["feta", "queso"],
  "queso de cabra": ["queso de cabra", "queso"],
  "queso parmesano": ["parmesano", "queso"],
  mozzarella: ["mozzarella", "queso"],
  "jamón cocido": ["jamón", "jamon"],
  "tomate triturado": ["tomate triturado", "tomate frito", "tomate"],
  "cinta de lomo": ["lomo", "cerdo"],
  huevo: ["huevo", "huevos"],
};

/** Palabras demasiado cortas o genéricas que darían falsos positivos al comparar. */
function matchesWord(productName: string, candidate: string): boolean {
  if (candidate.length < 3 || productName.length < 3) return productName === candidate;
  return productName.includes(candidate) || (candidate.includes(productName) && productName.length >= 4);
}

export function hasIngredient(ingredient: string, stock: StockForRecipes[]): boolean {
  const key = normalizeWords(ingredient);
  if (key === "verduras") return stock.filter((item) => item.category === "Fruta y verdura").length >= 2;
  const candidates = [ingredient, ...(SYNONYMS[ingredient] ?? [])].map(normalizeWords);
  return stock.some((item) => {
    const name = normalizeWords(item.name);
    return candidates.some((candidate) => matchesWord(name, candidate));
  });
}

/** Encuentra en el almacén el producto que se usaría para un ingrediente. */
export function productForIngredient<T extends { name: string }>(ingredient: string, stock: T[]): T | null {
  const candidates = [ingredient, ...(SYNONYMS[ingredient] ?? [])].map(normalizeWords);
  for (const candidate of candidates) {
    const found = stock.find((item) => matchesWord(normalizeWords(item.name), candidate));
    if (found) return found;
  }
  return null;
}

export function scoreRecipes(stock: StockForRecipes[], recipes: Recipe[] = RECIPES): ScoredRecipe[] {
  const food = stock.filter((item) => item.quantity > 0 && !NON_FOOD.has(item.category));
  return recipes
    .map((recipe) => {
      const present = recipe.ingredients.filter((ingredient) => hasIngredient(ingredient, food));
      const missing = recipe.ingredients.filter((ingredient) => !present.includes(ingredient));
      return {
        ...recipe,
        present,
        missing,
        score: Math.round((present.length / recipe.ingredients.length) * 100),
        nutrients: recipeNutrients(recipe.ingredients),
        minutes: recipeMinutes(recipe),
      };
    })
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
}

export function goalReason(goal: RecipeGoal, recipe: ScoredRecipe): string {
  switch (goal) {
    case "expiry":
      return "Aprovecha productos próximos a caducar.";
    case "no-shop":
      return "Puedes hacerla sin comprar nada.";
    case "quick":
      return "Pocos ingredientes: pensada para unos 15 minutos.";
    case "tomorrow":
      return "Permite preparar dos raciones y guardar una.";
    case "clean":
      return "Preparación sencilla y poca limpieza.";
    case "opened":
      return "Aprovecha productos que ya están abiertos.";
    case "freeze":
      return "Puedes guardar una ración en el congelador.";
    case "cheap":
      return recipe.missing.length === 1
        ? "Solo falta 1 ingrediente."
        : `Solo faltan ${recipe.missing.length} ingredientes.`;
    case "all":
      if (recipe.missing.length === 0) return "Ya tienes todos los ingredientes.";
      if (recipe.present.length === 0) return "Aún no tienes ninguno de sus ingredientes en casa.";
      return recipe.present.length === 1
        ? "Aprovecha 1 producto de tu almacén."
        : `Aprovecha ${recipe.present.length} productos de tu almacén.`;
  }
}

function overlaps(names: string[], ingredients: string[]): boolean {
  return ingredients.some((ingredient) => names.some((name) => name.includes(ingredient) || ingredient.includes(name)));
}

export function filterRecipes(
  scored: ScoredRecipe[],
  options: {
    filter: RecipeFilter;
    goal: RecipeGoal;
    query: string;
    skipped: Set<string>;
    lots: InventoryLot[];
    now?: Date;
  },
): ScoredRecipe[] {
  const now = options.now ?? new Date();
  const expiring = options.lots
    .filter((lot) => lot.expiryDate && daysUntil(lot.expiryDate, now) <= 5)
    .map((lot) => normalizeWords(lot.productName));
  const opened = options.lots.filter((lot) => lot.state === "opened").map((lot) => normalizeWords(lot.productName));
  const query = normalizeWords(options.query);
  return scored.filter((recipe) => {
    const ingredients = recipe.ingredients.map(normalizeWords);
    const byFilter =
      options.filter === "ready"
        ? !recipe.missing.length
        : options.filter === "near"
          ? recipe.score >= 50 && recipe.score < 100
          : options.filter === "low"
            ? recipe.score < 50
            : true;
    const byGoal =
      options.goal === "all" ||
      (options.goal === "expiry" && overlaps(expiring, ingredients)) ||
      (options.goal === "no-shop" && !recipe.missing.length) ||
      (options.goal === "quick" && recipe.minutes <= 20) ||
      (options.goal === "tomorrow" && recipe.missing.length <= 1) ||
      (options.goal === "clean" && recipe.ingredients.length <= 3) ||
      (options.goal === "opened" && overlaps(opened, ingredients)) ||
      (options.goal === "freeze" && /pollo|carne|pescado|guiso|crema|sopa/i.test(recipe.title)) ||
      (options.goal === "cheap" && recipe.missing.length <= 1);
    const byQuery = !query || normalizeWords(`${recipe.title} ${recipe.ingredients.join(" ")}`).includes(query);
    return !options.skipped.has(recipe.id) && byFilter && byGoal && byQuery;
  });
}

/** Propone dos comidas que comparten ingrediente: se abre hoy y se termina mañana. */
export function chainedPlan(scored: ScoredRecipe[], skipped: Set<string>) {
  const candidates = scored.filter((recipe) => recipe.score >= 50 && !skipped.has(recipe.id)).slice(0, 18);
  for (const first of candidates) {
    for (const second of scored
      .filter((other) => other.id !== first.id && other.meal !== first.meal && !skipped.has(other.id))
      .slice(0, 24)) {
      const shared = first.ingredients.filter((ingredient) =>
        second.ingredients.some((other) => normalizeWords(other) === normalizeWords(ingredient)),
      );
      if (shared.length) return { first, second, shared, missing: [...new Set([...first.missing, ...second.missing])] };
    }
  }
  return null;
}

/** Ingredientes que chocan con el perfil alimentario activo. */
export function dietConflicts(ingredients: string[], preferences: Preferences): string[] {
  if (!preferences.specialDietEnabled) return [];
  const blocked = [...preferences.allergens, ...preferences.avoided].map(normalizeWords).filter(Boolean);
  return ingredients.filter((ingredient) => {
    const key = normalizeWords(ingredient);
    return blocked.some((word) => key.includes(word) || word.includes(key));
  });
}
