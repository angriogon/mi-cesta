import { asCategory } from "../domain/categories";
import seedCatalog from "../domain/seed-catalog.json";
import type { Db } from "./db";
import type { Product } from "./types";

/** Catálogo inicial con existencias a cero (lo mismo que hace `create_household` en Supabase). */
export function catalogProducts(householdId: string, createdAt = new Date().toISOString()): Product[] {
  return (seedCatalog as { sku: string; name: string; category: string }[]).map((item) => ({
    id: crypto.randomUUID(),
    householdId,
    sku: item.sku,
    name: item.name,
    category: asCategory(item.category),
    currentStock: 0,
    minimumStock: 0,
    suppressed: false,
    confirmedAt: null,
    plannedUntil: null,
    createdAt,
    updatedAt: createdAt,
  }));
}

export async function seedIfEmpty(db: Db): Promise<void> {
  const products = await db.list("products");
  if (products.length) return;
  await db.insert("products", catalogProducts(db.householdId));
}
