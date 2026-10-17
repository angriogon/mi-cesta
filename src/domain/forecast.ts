import type { InventoryLot, LotState, Product, StockEvent } from "../data/types";
import { addDaysIso, daysUntil } from "../lib/text";
import { ESTIMATED_SHELF_LIFE, PERISHABLE, type Category } from "./categories";

export const DAY = 864e5;

export interface Prediction {
  productId: string;
  productName: string;
  averageDays: number;
  lastPurchaseAt: string;
  daysUntil: number;
  lowNow: boolean;
}

export interface Certainty {
  id: string;
  name: string;
  category: Category;
  currentStock: number;
  minimumStock: number;
  estimatedQuantity: number;
  confidence: number;
  label: string;
  suppressed: boolean;
}

export interface ExpiringLot {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  expiryDate: string;
  daysUntil: number;
  estimated: boolean;
  state: LotState;
}

export const POSITIVE_REASONS = new Set(["purchase", "ticket", "inventory"]);

/** Fechas (días distintos) en que se repuso cada producto. */
export function purchaseDays(events: StockEvent[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.delta <= 0 || !POSITIVE_REASONS.has(event.reason)) continue;
    const day = event.createdAt.slice(0, 10);
    const set = map.get(event.productId) ?? new Set<string>();
    set.add(day);
    map.set(event.productId, set);
  }
  return new Map([...map].map(([id, set]) => [id, [...set].sort()]));
}

export function predictions(products: Product[], events: StockEvent[], now = new Date()): Prediction[] {
  const days = purchaseDays(events);
  const result: Prediction[] = [];
  for (const product of products) {
    const dates = days.get(product.id);
    if (!dates || dates.length < 2) continue;
    const span = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / DAY;
    const averageDays = Math.max(1, Math.round(span / (dates.length - 1)));
    const last = dates[dates.length - 1];
    result.push({
      productId: product.id,
      productName: product.name,
      averageDays,
      lastPurchaseAt: last,
      daysUntil: daysUntil(addDaysIso(last, averageDays), now),
      lowNow: product.currentStock < product.minimumStock,
    });
  }
  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Unidades consumidas al día según el histórico; 0 si no hay datos suficientes. */
export function dailyRate(productId: string, events: StockEvent[], now: Date): number {
  const recent = events.filter(
    (event) => event.productId === productId && now.getTime() - new Date(event.createdAt).getTime() <= 90 * DAY,
  );
  const bought = recent.filter((event) => event.delta > 0 && POSITIVE_REASONS.has(event.reason));
  if (bought.length < 2) return 0;
  const first = Math.min(...bought.map((event) => new Date(event.createdAt).getTime()));
  const spanDays = Math.max(7, (now.getTime() - first) / DAY);
  const units = bought.reduce((sum, event) => sum + event.delta, 0);
  return units / spanDays;
}

export function certaintyFor(product: Product, events: StockEvent[], now = new Date()): Certainty {
  const since = product.confirmedAt ?? product.updatedAt ?? product.createdAt;
  const age = Math.max(0, (now.getTime() - new Date(since).getTime()) / DAY);
  const halfLife = PERISHABLE.includes(product.category) ? 7 : 30;
  const rate = dailyRate(product.id, events, now);
  const estimatedQuantity = Math.max(0, Math.round((product.currentStock - rate * age) * 10) / 10);
  let confidence = Math.exp((-age * Math.LN2) / halfLife);
  if (product.currentStock > 0 && rate > 0 && estimatedQuantity <= 0) confidence = Math.min(confidence, 0.3);
  confidence = Math.max(0.05, Math.min(1, confidence));
  const label =
    product.currentStock <= 0
      ? "Agotado"
      : estimatedQuantity <= 0 && rate > 0
        ? "Posiblemente agotado"
        : confidence >= 0.82
          ? "Confirmado"
          : confidence >= 0.55
            ? "Revisar pronto"
            : "Stock dudoso";
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    currentStock: product.currentStock,
    minimumStock: product.minimumStock,
    estimatedQuantity,
    confidence,
    label,
    suppressed: product.suppressed,
  };
}

/** Lotes con fecha real o estimada (perecederos sin fecha), del más urgente al menos. */
export function expiringLots(lots: InventoryLot[], products: Product[], now = new Date()): ExpiringLot[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const result: ExpiringLot[] = [];
  for (const lot of lots) {
    if (lot.quantity <= 0) continue;
    let expiryDate = lot.expiryDate;
    let estimated = lot.estimated;
    if (!expiryDate && lot.state !== "frozen") {
      const category = lot.productId ? byId.get(lot.productId)?.category : undefined;
      const shelfLife = lot.state === "cooked" ? 3 : category ? ESTIMATED_SHELF_LIFE[category] : undefined;
      if (shelfLife) {
        expiryDate = addDaysIso(lot.createdAt.slice(0, 10), shelfLife);
        estimated = true;
      }
    }
    if (!expiryDate) continue;
    result.push({
      id: lot.id,
      productId: lot.productId,
      productName: lot.productName,
      quantity: lot.quantity,
      expiryDate,
      daysUntil: daysUntil(expiryDate, now),
      estimated,
      state: lot.state,
    });
  }
  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}
