import type { InventoryLot } from "../data/types";
import { daysUntil, normalizeWords, todayIso } from "../lib/text";
import { RECIPES } from "./recipes-data";
import { foodStock, productForIngredient, type Recipe, type StockForRecipes } from "./recipes";

export interface PlanSlot {
  /** Día del plan (0 = hoy) y su fecha AAAA-MM-DD. */
  day: number;
  date: string;
  meal: Recipe["meal"];
  recipe: Recipe | null;
  /** Productos del almacén que gasta (en el orden de sus ingredientes). */
  uses: string[];
  /** Ingredientes que habría que comprar. */
  missing: string[];
  /** Productos que gasta antes de que caduquen. */
  saves: string[];
}

export interface WeekPlan {
  slots: PlanSlot[];
  /** Lo que falta para toda la semana, sin repetir. */
  missing: string[];
  /** Comidas que se pueden hacer sin comprar nada. */
  ready: number;
  /** Productos distintos del almacén que se aprovechan. */
  used: number;
}

export interface PlanOptions {
  stock: StockForRecipes[];
  lots?: InventoryLot[];
  recipes?: Recipe[];
  /** Recetas descartadas («No me apetece») o cambiadas en el plan: no se proponen. */
  exclude?: Set<string>;
  /** Recetas que no encajan con el perfil alimentario. */
  blocked?: (recipe: Recipe) => boolean;
  /** Huecos ya decididos (índice del hueco → id de receta): se respetan y gastan su stock. */
  fixed?: Record<number, string>;
  days?: number;
  now?: Date;
}

type Pantry = (StockForRecipes & { key: string; left: number })[];

/** Qué haría falta para una receta con lo que queda en el almacén. */
function evaluate(recipe: Recipe, pantry: Pantry) {
  const available = pantry.filter((item) => item.left > 0);
  const uses: Pantry = [];
  const missing: string[] = [];
  for (const ingredient of recipe.ingredients) {
    const free = available.filter((item) => !uses.includes(item));
    // «verduras» vale cualquier fruta o verdura que haya.
    const product =
      normalizeWords(ingredient) === "verduras"
        ? (free.find((item) => item.category === "Fruta y verdura") ?? null)
        : productForIngredient(ingredient, free);
    if (product) uses.push(product);
    else missing.push(ingredient);
  }
  return { uses, missing };
}

/**
 * Planifica la semana (comida y cena de cada día) con lo que hay en casa:
 * - en cada hueco elige la receta que más aprovecha lo que queda del almacén, y lo «gasta» para los
 *   días siguientes, así el stock se reparte por la semana en vez de contarse dos veces;
 * - adelanta lo que caduca antes (un producto que caduca el martes se propone el lunes o el martes);
 * - evita repetir receta y que dos comidas seguidas compartan ingrediente principal.
 * Es determinista: con el mismo almacén da el mismo plan.
 */
export function planWeek(options: PlanOptions): WeekPlan {
  const now = options.now ?? new Date();
  const recipes = options.recipes ?? RECIPES;
  const exclude = options.exclude ?? new Set<string>();
  const days = options.days ?? 7;
  const pantry: Pantry = foodStock(options.stock).map((item) => ({
    ...item,
    key: normalizeWords(item.name),
    left: item.quantity,
  }));
  // Días hasta la caducidad más próxima de cada producto con fecha.
  const expiry = new Map<string, number>();
  for (const lot of options.lots ?? []) {
    if (!lot.expiryDate || lot.quantity <= 0) continue;
    const key = normalizeWords(lot.productName);
    const left = daysUntil(lot.expiryDate, now);
    if (left >= 0) expiry.set(key, Math.min(left, expiry.get(key) ?? Infinity));
  }

  const used = new Set<string>();
  const slots: PlanSlot[] = [];
  for (let index = 0; index < days * 2; index++) {
    const day = Math.floor(index / 2);
    const meal: Recipe["meal"] = index % 2 === 0 ? "Comida" : "Cena";
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    const previous = slots.at(-1)?.recipe;
    const previousIngredients = new Set(previous?.ingredients.map(normalizeWords) ?? []);

    const fixedId = options.fixed?.[index];
    const fixed = fixedId ? recipes.find((recipe) => recipe.id === fixedId) : undefined;
    let best: { recipe: Recipe; uses: Pantry; missing: string[]; score: number } | null = null;
    for (const recipe of fixed ? [fixed] : recipes) {
      if (!fixed && (recipe.meal !== meal || used.has(recipe.id) || exclude.has(recipe.id))) continue;
      if (!fixed && options.blocked?.(recipe)) continue;
      const { uses, missing } = evaluate(recipe, pantry);
      const coverage = uses.length / recipe.ingredients.length;
      // Lo que caduca pronto pesa más cuanto antes caduque; lo que caducaría antes de ese día no cuenta.
      const urgency = uses.reduce((sum, item) => {
        const left = expiry.get(item.key);
        return left === undefined || left < day ? sum : sum + Math.max(0, 6 - (left - day)) * 6;
      }, 0);
      const repeats = recipe.ingredients.some((ingredient) => previousIngredients.has(normalizeWords(ingredient)));
      const score = coverage * 100 + urgency - (repeats ? 15 : 0) - missing.length * 4;
      if (
        !best ||
        score > best.score ||
        (score === best.score && recipe.title.localeCompare(best.recipe.title, "es") < 0)
      )
        best = { recipe, uses, missing, score };
    }

    if (!best) {
      slots.push({ day, date: todayIso(date), meal, recipe: null, uses: [], missing: [], saves: [] });
      continue;
    }
    used.add(best.recipe.id);
    for (const item of best.uses) item.left -= 1;
    slots.push({
      day,
      date: todayIso(date),
      meal,
      recipe: best.recipe,
      uses: best.uses.map((item) => item.name),
      missing: best.missing,
      saves: best.uses
        .filter((item) => {
          const left = expiry.get(item.key);
          return left !== undefined && left >= day && left <= day + 2;
        })
        .map((item) => item.name),
    });
  }

  const missing = new Map<string, string>();
  for (const slot of slots) for (const name of slot.missing) missing.set(normalizeWords(name), name);
  return {
    slots,
    missing: [...missing.values()],
    ready: slots.filter((slot) => slot.recipe && !slot.missing.length).length,
    used: new Set(slots.flatMap((slot) => slot.uses.map(normalizeWords))).size,
  };
}
