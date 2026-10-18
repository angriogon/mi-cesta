import { describe, expect, it } from "vitest";
import catalog from "./seed-catalog.json";
import { hasIngredient, type StockForRecipes } from "./recipes";
import { RECIPES } from "./recipes-data";

describe("recetas y catálogo", () => {
  it("hay 100 recetas sin ids repetidos", () => {
    expect(RECIPES).toHaveLength(100);
    expect(new Set(RECIPES.map((recipe) => recipe.id)).size).toBe(100);
  });

  it("cada ingrediente de cada receta corresponde a algún producto del catálogo", () => {
    const stock = (catalog as { name: string; category: string }[]).map((product) => ({
      name: product.name,
      category: product.category,
      quantity: 1,
    })) as StockForRecipes[];
    const missing = RECIPES.flatMap((recipe) =>
      recipe.ingredients.filter((ingredient) => !hasIngredient(ingredient, stock)).map((i) => `${recipe.id}: ${i}`),
    );
    expect(missing).toEqual([]);
  });
});
