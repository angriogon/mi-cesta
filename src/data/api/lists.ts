import { type Category } from "../../domain/categories";
import { productForIngredient } from "../../domain/recipes";
import { addDaysIso, todayIso, uid } from "../../lib/text";
import type { InverseStep, ListItem, Lists, Product } from "../types";

import { AutoCestaApi } from "./autocesta";
import { ApiError, now } from "./shared";

/** Listas compartidas, compra y recetas cocinadas. */
export class ListsApi extends AutoCestaApi {
  async lists(): Promise<Lists> {
    return this.db.getLists();
  }

  /** Guarda las listas; si otro dispositivo las cambió antes, mezcla por nombre y reintenta. */
  async saveLists(
    shopping: ListItem[],
    checklist: ListItem[],
    revision: number,
    merge: (remote: Lists) => Lists,
  ): Promise<Lists> {
    let attempt = await this.db.casLists(shopping, checklist, revision);
    for (let tries = 0; !attempt.ok && tries < 3; tries += 1) {
      const merged = merge(attempt.lists);
      attempt = await this.db.casLists(merged.shopping, merged.checklist, attempt.lists.revision);
    }
    if (!attempt.ok) throw new ApiError("No se ha podido sincronizar la lista.", 409);
    return attempt.lists;
  }

  async startPurchase(planned: { name: string; quantity: number }[]): Promise<void> {
    await this.db.removeAll("purchase_sessions");
    await this.db.insert("purchase_sessions", [
      { id: uid(), householdId: this.db.householdId, planned, createdAt: now() },
    ]);
  }

  async purchaseSession() {
    const sessions = await this.db.list("purchase_sessions");
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  /**
   * Guarda en el almacén lo marcado como comprado. La compra queda como "provisional" para
   * que, al guardar el ticket, esos productos no se sumen dos veces.
   */
  async storePurchased(items: ListItem[]): Promise<{
    products: Product[];
    stored: { productId: string; name: string; quantity: number; category: Category }[];
  }> {
    const stored = await this.atomically((tx) => tx.storePurchasedSteps(items));
    return { products: await this.products(), stored };
  }

  protected async storePurchasedSteps(
    items: ListItem[],
  ): Promise<{ productId: string; name: string; quantity: number; category: Category }[]> {
    const products = await this.db.list("products");
    const inverse: InverseStep[] = [];
    const stored: { productId: string; name: string; quantity: number; category: Category }[] = [];
    for (const item of items) {
      const product = await this.ensureProduct(products, item.name, item.category);
      if (product.category !== item.category) await this.db.update("products", product.id, { category: item.category });
      await this.changeStock(product, item.quantity, "purchase", inverse);
      stored.push({ productId: product.id, name: product.name, quantity: item.quantity, category: item.category });
    }
    await this.db.insert("provisional_purchases", [
      {
        id: uid(),
        householdId: this.db.householdId,
        items: stored.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          reconciled: 0,
        })),
        createdAt: now(),
      },
    ]);
    await this.recordOperation(
      "purchase",
      `Compra · ${stored.length} ${stored.length === 1 ? "producto" : "productos"}`,
      inverse,
    );
    return stored;
  }

  /** Descuenta una unidad de cada ingrediente usado y guarda las raciones sobrantes como cocinadas. */
  async cook(recipeTitle: string, ingredients: string[], servings: number): Promise<void> {
    await this.atomically((tx) => tx.cookSteps(recipeTitle, ingredients, servings));
  }

  protected async cookSteps(recipeTitle: string, ingredients: string[], servings: number): Promise<void> {
    const products = (await this.db.list("products")).filter((product) => product.currentStock > 0);
    const inverse: InverseStep[] = [];
    const used = new Set<string>();
    for (const ingredient of ingredients) {
      const product = productForIngredient(ingredient, products);
      if (!product || used.has(product.id)) continue;
      used.add(product.id);
      await this.changeStock(product, -1, "cook", inverse);
      await this.consumeLots(product.id, 1, inverse);
    }
    if (servings > 1) {
      const lot = await this.addLot({
        productId: null,
        productName: `Raciones de ${recipeTitle}`,
        quantity: servings - 1,
        expiryDate: addDaysIso(todayIso(), 3),
        state: "cooked",
        location: "Frigorífico",
      });
      inverse.push({ kind: "deleteLot", lotId: lot.id });
    }
    await this.recordOperation("cook", `Receta · ${recipeTitle}`, inverse);
  }
}
