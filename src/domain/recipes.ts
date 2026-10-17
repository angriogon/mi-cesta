import type { InventoryLot, Preferences } from "../data/types";
import { daysUntil, normalizeWords } from "../lib/text";
import type { Category } from "./categories";
import { RECIPES } from "./recipes-data";

export interface Recipe {
  id: string;
  week: number;
  day: number;
  meal: "Comida" | "Cena";
  title: string;
  ingredients: string[];
}

export interface Nutrients {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  kcal: number;
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

function ingredientNutrients(ingredient: string): Nutrients {
  const t = normalizeWords(ingredient);
  if (/pollo|pavo|merluza|atun|bacalao|lubina|sepia|gamba|sardina|caballa|bonito|pescado/.test(t))
    return { protein: 19, carbs: 0, fat: 3, fiber: 0, kcal: 105 };
  if (/salmon/.test(t)) return { protein: 20, carbs: 0, fat: 11, fiber: 0, kcal: 185 };
  if (/carne|lomo|hamburguesa/.test(t)) return { protein: 21, carbs: 0, fat: 7, fiber: 0, kcal: 150 };
  if (/huevo/.test(t)) return { protein: 7, carbs: 1, fat: 5, fiber: 0, kcal: 75 };
  if (/queso|mozzarella|cottage/.test(t)) return { protein: 7, carbs: 2, fat: 4, fiber: 0, kcal: 75 };
  if (/arroz|pasta|espagueti|quinoa|fideo|noodle/.test(t))
    return { protein: 4, carbs: 26, fat: 1, fiber: 2, kcal: 130 };
  if (/patata|boniato|pan|tortilla|fajita|arepa/.test(t))
    return { protein: 3, carbs: 20, fat: 1.5, fiber: 2, kcal: 105 };
  if (/aguacate|guacamole|anacardo|aceituna/.test(t)) return { protein: 2, carbs: 4, fat: 7, fiber: 4, kcal: 85 };
  return { protein: 1.5, carbs: 5, fat: 0.4, fiber: 2, kcal: 30 };
}

/** Estimación por ración; incluye una cucharadita de aceite de base. */
export function recipeNutrients(ingredients: string[]): Nutrients {
  return ingredients.reduce<Nutrients>(
    (total, ingredient) => {
      const n = ingredientNutrients(ingredient);
      return {
        protein: total.protein + n.protein,
        carbs: total.carbs + n.carbs,
        fat: total.fat + n.fat,
        fiber: total.fiber + n.fiber,
        kcal: total.kcal + n.kcal,
      };
    },
    { protein: 0, carbs: 0, fat: 2, fiber: 0, kcal: 18 },
  );
}

export function recipeSteps(recipe: Pick<Recipe, "title">): string[] {
  const t = normalizeWords(recipe.title);
  if (/pollo.*horno|pollo asado/.test(t))
    return [
      "Precalienta el horno a 200 °C y coloca pollo y verduras sazonados en una fuente.",
      "Hornea 35–45 min, girando el pollo a mitad de cocción; debe quedar bien hecho en el centro.",
      "Deja reposar 5 min y sirve con las verduras y sus jugos.",
    ];
  if (/pescado.*horno|papillote/.test(t))
    return [
      "Precalienta a 190 °C y prepara una cama de verduras finas.",
      "Añade el pescado, sazona y hornea 15–22 min según el grosor.",
      "Comprueba que se separa en lascas y sirve inmediatamente.",
    ];
  if (/ensalada/.test(t))
    return [
      "Lava, seca y corta todos los vegetales.",
      "Cocina la proteína hasta su punto y déjala templar.",
      "Mezcla justo antes de comer y aliña con moderación.",
    ];
  if (/crema|pure|sopa/.test(t))
    return [
      "Trocea de forma uniforme y rehoga 3–4 min con poco aceite.",
      "Cubre con agua o caldo y cuece 18–25 min hasta que esté tierno.",
      "Tritura, ajusta la textura y añade la proteína preparada.",
    ];
  if (/gazpacho|salmorejo/.test(t))
    return [
      "Trocea y tritura los ingredientes fríos hasta obtener una crema fina.",
      "Ajusta agua, sal y vinagre y enfría al menos 20 min.",
      "Prepara el acompañamiento y añádelo al servir.",
    ];
  if (/tortilla|revuelto|crepe/.test(t))
    return [
      "Corta el relleno y cocínalo primero con poco aceite hasta que esté tierno.",
      "Bate el huevo, mezcla y cocina a fuego medio-bajo.",
      "Cuaja por ambos lados o remueve hasta el punto deseado y sirve.",
    ];
  if (/pasta|espagueti|noodle|arroz|quinoa/.test(t))
    return [
      "Cuece el cereal o la pasta según el envase y reserva un poco de agua de cocción.",
      "Cocina verduras y proteína por separado hasta que estén hechas.",
      "Integra todo 2–3 min, ajusta la textura y sirve.",
    ];
  return [
    "Lava, corta y organiza los ingredientes antes de encender el fuego.",
    "Cocina primero la proteína y después las verduras con poco aceite.",
    "Combina, comprueba el punto de cocción, sazona y sirve.",
  ];
}

export function recipeMinutes(recipe: Pick<Recipe, "title">): number {
  const t = normalizeWords(recipe.title);
  if (/pollo.*horno|pollo asado/.test(t)) return 50;
  if (/guiso|paella/.test(t)) return 45;
  if (/pescado.*horno|papillote|berenjena rellena|pizza/.test(t) || /crema|pure|sopa|patata|boniato/.test(t)) return 30;
  if (/pasta|espagueti|arroz|quinoa/.test(t)) return 25;
  if (/tortilla|revuelto|crepe|wok|plancha/.test(t)) return 18;
  if (/ensalada|gazpacho|salmorejo/.test(t)) return 15;
  return 25;
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
