import { asCategory, guessCategory, type Category } from "../../domain/categories";
import { normalize, uid } from "../../lib/text";
import type { Db } from "../db";
import { BatchDb } from "../batch-db";
import type {
  HouseholdEvent,
  InventoryLot,
  InverseStep,
  LotState,
  Operation,
  Product,
  StockEvent,
  StockReason,
} from "../types";

import { ApiError, now, slug } from "./shared";

/** Base de la API: productos, existencias, lotes y el registro de operaciones. */
export class ApiBase {
  constructor(readonly db: Db) {}

  /**
   * Ejecuta una operación de varios pasos como una sola transacción: sus escrituras se acumulan
   * y se aplican juntas al final, o ninguna si algo falla. Usa una copia de la API para que las
   * escrituras de otras acciones simultáneas no se mezclen en el lote.
   */
  protected async atomically<T>(work: (tx: this) => Promise<T>): Promise<T> {
    const batch = new BatchDb(this.db);
    const Api = this.constructor as new (db: Db) => this;
    const result = await work(new Api(batch));
    await batch.commit();
    return result;
  }

  async products(): Promise<Product[]> {
    const products = await this.db.list("products");
    return products.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async createProduct(input: {
    name: string;
    category: Category;
    currentStock?: number;
    minimumStock?: number;
  }): Promise<Product> {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) throw new ApiError("Escribe un nombre de al menos 2 caracteres.");
    if (name.length > 80) throw new ApiError("El nombre es demasiado largo.");
    const products = await this.db.list("products");
    if (products.some((product) => normalize(product.name) === normalize(name)))
      throw new ApiError("Ese producto ya existe.", 409);
    const product: Product = {
      id: uid(),
      householdId: this.db.householdId,
      sku: `custom-${slug(name)}`,
      name,
      category: asCategory(input.category),
      currentStock: Math.max(0, input.currentStock ?? 0),
      minimumStock: Math.max(0, input.minimumStock ?? 0),
      suppressed: false,
      confirmedAt: now(),
      plannedUntil: null,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.db.insert("products", [product]);
    return product;
  }

  /** Busca un producto por nombre o lo crea (usado por tickets, inventario rápido y compras). */
  protected async ensureProduct(products: Product[], name: string, category?: Category): Promise<Product> {
    const exact = products.find((product) => normalize(product.name) === normalize(name));
    if (exact) return exact;
    const product = await this.createProduct({ name, category: category ?? guessCategory(name) });
    products.push(product);
    return product;
  }

  async updateProduct(
    id: string,
    patch: Partial<Pick<Product, "category" | "currentStock" | "minimumStock" | "name">>,
    reason: StockReason = "adjust",
  ): Promise<void> {
    const product = await this.db.get("products", id);
    if (!product) throw new ApiError("Ese producto ya no existe.", 404);
    const next: Partial<Product> = { ...patch, updatedAt: now() };
    if (patch.currentStock !== undefined) {
      next.currentStock = Math.max(0, Math.round(patch.currentStock * 1000) / 1000);
      next.confirmedAt = now();
      const delta = next.currentStock - product.currentStock;
      if (delta) await this.logStock(product.id, delta, reason);
    }
    if (patch.minimumStock !== undefined) next.minimumStock = Math.max(0, Math.round(patch.minimumStock));
    if (patch.category !== undefined) next.category = asCategory(patch.category);
    await this.db.update("products", id, next);
  }

  async deleteProduct(id: string): Promise<void> {
    const lots = await this.db.listBy("inventory_lots", "productId", id);
    await this.atomically(async (tx) => {
      await tx.db.remove("products", [id]);
      await tx.db.remove(
        "inventory_lots",
        lots.map((lot) => lot.id),
      );
    });
  }

  protected async logStock(productId: string, delta: number, reason: StockReason) {
    const event: StockEvent = {
      id: uid(),
      householdId: this.db.householdId,
      productId,
      delta,
      reason,
      createdAt: now(),
    };
    await this.db.insert("stock_events", [event]);
  }

  protected async changeStock(product: Product, delta: number, reason: StockReason, inverse: InverseStep[]) {
    const currentStock = Math.max(0, Math.round((product.currentStock + delta) * 1000) / 1000);
    const applied = currentStock - product.currentStock;
    if (!applied) return;
    product.currentStock = currentStock;
    await this.db.update("products", product.id, { currentStock, confirmedAt: now(), updatedAt: now() });
    await this.logStock(product.id, applied, reason);
    inverse.push({ kind: "stock", productId: product.id, delta: -applied });
  }

  async lots(): Promise<InventoryLot[]> {
    return (await this.db.list("inventory_lots")).filter((lot) => lot.quantity > 0);
  }

  async addLot(input: {
    productId: string | null;
    productName: string;
    quantity: number;
    expiryDate: string | null;
    state?: LotState;
    location?: string | null;
  }): Promise<InventoryLot> {
    const lot: InventoryLot = {
      id: uid(),
      householdId: this.db.householdId,
      productId: input.productId,
      productName: input.productName,
      quantity: Math.max(0, input.quantity),
      expiryDate: input.expiryDate || null,
      estimated: false,
      state: input.state ?? "closed",
      location: input.location ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.db.insert("inventory_lots", [lot]);
    return lot;
  }

  async setLotState(id: string, state: LotState): Promise<void> {
    await this.db.update("inventory_lots", id, { state, updatedAt: now() });
  }

  async setLotExpiry(id: string, expiryDate: string | null): Promise<void> {
    await this.db.update("inventory_lots", id, { expiryDate, estimated: false, updatedAt: now() });
  }

  async removeLot(id: string): Promise<void> {
    await this.db.remove("inventory_lots", [id]);
  }

  /** Consume unidades de los lotes de un producto, empezando por los que antes caducan. */
  protected async consumeLots(productId: string, units: number, inverse: InverseStep[]) {
    let left = units;
    const lots = (await this.db.listBy("inventory_lots", "productId", productId))
      .filter((lot) => lot.quantity > 0)
      .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
    for (const lot of lots) {
      if (left <= 0) break;
      const used = Math.min(lot.quantity, left);
      left -= used;
      inverse.push({ kind: "restoreLot", lot: { ...lot } });
      if (lot.quantity - used <= 0) await this.db.remove("inventory_lots", [lot.id]);
      else await this.db.update("inventory_lots", lot.id, { quantity: lot.quantity - used, updatedAt: now() });
    }
  }

  protected async logEvent(kind: HouseholdEvent["kind"], ref: string | null, data: Record<string, unknown>) {
    await this.db.insert("household_events", [
      { id: uid(), householdId: this.db.householdId, kind, ref, data, createdAt: now() },
    ]);
  }

  protected async recordOperation(operationType: Operation["operationType"], summary: string, inverse: InverseStep[]) {
    if (!inverse.length) return;
    await this.db.insert("operations", [
      { id: uid(), householdId: this.db.householdId, operationType, summary, inverse, undone: false, createdAt: now() },
    ]);
  }
}
