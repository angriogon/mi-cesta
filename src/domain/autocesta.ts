import type {
  Activity,
  HouseholdEvent,
  InventoryLot,
  ListItem,
  LotState,
  Mode,
  Operation,
  PriceRef,
  Product,
  StockEvent,
  Ticket,
} from "../data/types";
import { daysUntil, normalize, todayIso } from "../lib/text";
import { similarNames } from "./matching";
import { DAY, type Certainty, type ExpiringLot, predictions, certaintyFor, expiringLots } from "./forecast";

// Las previsiones viven en forecast.ts; se reexportan para quien ya las importa desde aquí.
export { certaintyFor, expiringLots, predictions } from "./forecast";
export type { Certainty, ExpiringLot, Prediction } from "./forecast";

export interface Suggestion {
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  confidence: number;
}

export interface Overview {
  mode: Mode;
  tranquility: { score: number; label: string };
  mainRecommendation: { type: string; title: string; reason: string };
  questions: { productId: string; productName: string; prompt: string; reason: string }[];
  expiring: ExpiringLot[];
  suggestions: Suggestion[];
  pendingSuggestions: Suggestion[];
  certainty: Certainty[];
  stateSummary: Record<LotState, number>;
  weekly: {
    spendCents: number;
    estimatedBudgetCents: number;
    savingsCents: number;
    potentialWasteCount: number;
    expiringCount: number;
    avoidedPurchases: number;
    nextPurchaseDays: number;
    details: { spend: string; budget: string; savings: string; waste: string };
  };
  undo: { id: string; summary: string; operationType: string; createdAt: string } | null;
  activity: Activity[];
}

export interface OverviewInput {
  mode: Mode;
  products: Product[];
  lots: InventoryLot[];
  stockEvents: StockEvent[];
  tickets: Ticket[];
  prices: PriceRef[];
  shopping: ListItem[];
  events: HouseholdEvent[];
  operations: Operation[];
  activity: Activity[];
  now?: Date;
}

export function tranquility(score: number): string {
  if (score >= 85) return "Todo en calma";
  if (score >= 65) return "Casi todo bajo control";
  if (score >= 40) return "Algunas cosas por revisar";
  return "Tu hogar necesita atención";
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLocaleLowerCase("es") + value.slice(1);
}

export function buildOverview(input: OverviewInput): Overview {
  const now = input.now ?? new Date();
  const products = input.products;
  const certainty = products.map((product) => certaintyFor(product, input.stockEvents, now));
  const certaintyById = new Map(certainty.map((item) => [item.id, item]));
  const expiring = expiringLots(input.lots, products, now);
  const expired = expiring.filter((lot) => lot.daysUntil < 0);
  const soon = expiring.filter((lot) => lot.daysUntil >= 0 && lot.daysUntil <= 2);
  const needs = products.filter((product) => product.currentStock < product.minimumStock);
  const doubtful = certainty.filter((item) => item.minimumStock > 0 && item.currentStock > 0 && item.confidence < 0.55);

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        Math.min(36, expired.length * 12) -
        Math.min(24, soon.length * 6) -
        Math.min(30, needs.length * 5) -
        Math.min(15, doubtful.length * 3),
    ),
  );

  // Preguntas: solo productos con existencias cuya cantidad real es dudosa.
  const twoDaysAgo = now.getTime() - 2 * DAY;
  const skipped = new Set(
    input.events
      .filter((event) => event.kind === "question-skip" && new Date(event.createdAt).getTime() > twoDaysAgo)
      .map((event) => event.ref),
  );
  const questions =
    input.mode === "autocesta"
      ? certainty
          .filter((item) => item.currentStock > 0 && item.confidence < 0.6 && !item.suppressed && !skipped.has(item.id))
          .sort((a, b) => Number(b.minimumStock > 0) - Number(a.minimumStock > 0) || a.confidence - b.confidence)
          .slice(0, 3)
          .map((item) => ({
            productId: item.id,
            productName: item.name,
            prompt: `¿Sigue quedando ${lowerFirst(item.name)}?`,
            reason: "Tu respuesta puede cambiar la próxima compra.",
          }))
      : [];

  // Sugerencias de AutoCesta.
  const predicted = predictions(products, input.stockEvents, now);
  const inShopping = new Set(input.shopping.filter((item) => !item.done).map((item) => normalize(item.name)));
  const tickets = [...input.tickets].sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  let nextPurchaseDays = 7;
  if (tickets.length >= 2) {
    const span =
      (new Date(tickets[tickets.length - 1].purchasedAt).getTime() - new Date(tickets[0].purchasedAt).getTime()) / DAY;
    const interval = Math.max(2, Math.round(span / (tickets.length - 1)));
    nextPurchaseDays = Math.max(0, interval - Math.max(0, -daysUntil(tickets[tickets.length - 1].purchasedAt, now)));
  }
  const suggestions: Suggestion[] = [];
  const pendingSuggestions: Suggestion[] = [];
  if (input.mode === "autocesta") {
    for (const product of products) {
      if (product.suppressed || inShopping.has(normalize(product.name))) continue;
      const info = certaintyById.get(product.id)!;
      const prediction = predicted.find((item) => item.productId === product.id);
      if (product.currentStock < product.minimumStock) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          quantity: Math.max(1, product.minimumStock - product.currentStock),
          reason: `Por debajo del mínimo (${product.currentStock} de ${product.minimumStock}).`,
          confidence: 1,
        });
      } else if (product.minimumStock > 0 && info.estimatedQuantity < product.minimumStock && info.confidence < 0.6) {
        pendingSuggestions.push({
          productId: product.id,
          productName: product.name,
          quantity: Math.max(1, Math.ceil(product.minimumStock - info.estimatedQuantity)),
          reason: "Stock dudoso: confirma antes de añadirlo.",
          confidence: info.confidence,
        });
      } else if (
        prediction &&
        prediction.daysUntil <= nextPurchaseDays &&
        product.currentStock <= Math.max(1, product.minimumStock)
      ) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          quantity: 1,
          reason:
            prediction.daysUntil <= 0
              ? `Sueles reponerlo cada ${prediction.averageDays} días y ya toca.`
              : `Sueles reponerlo cada ${prediction.averageDays} días; se acabará en unos ${prediction.daysUntil}.`,
          confidence: Math.max(0.6, info.confidence),
        });
      }
    }
  }

  const weekAgo = now.getTime() - 7 * DAY;
  const weekTickets = input.tickets.filter((ticket) => new Date(`${ticket.purchasedAt}T12:00:00`).getTime() >= weekAgo);
  const priceFor = (name: string) =>
    input.prices
      .filter((price) => similarNames(price.productName, name))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  const estimatedBudgetCents = input.shopping
    .filter((item) => !item.done)
    .reduce((sum, item) => sum + (priceFor(item.name)?.priceCents ?? 0) * item.quantity, 0);
  const avoided = input.events.filter(
    (event) => event.kind === "avoided" && new Date(event.createdAt).getTime() >= weekAgo,
  );
  const averagePrice = input.prices.length
    ? Math.round(input.prices.reduce((sum, price) => sum + price.priceCents, 0) / input.prices.length)
    : 0;
  const waste = expiring.filter((lot) => lot.daysUntil >= 0 && lot.daysUntil <= 3);

  const stateSummary: Record<LotState, number> = { closed: 0, opened: 0, reserved: 0, cooked: 0, frozen: 0 };
  for (const lot of input.lots) stateSummary[lot.state] += lot.quantity;

  let mainRecommendation = { type: "calm", title: "Todo bajo control", reason: "No hay decisiones urgentes." };
  if (expired.length)
    mainRecommendation = {
      type: "expired",
      title: `Revisa ${lowerFirst(expired[0].productName)}`,
      reason:
        expired.length === 1
          ? "Ha pasado su fecha de caducidad: decide si se aprovecha o se retira."
          : `Hay ${expired.length} productos con la fecha pasada.`,
    };
  else if (soon.length)
    mainRecommendation = {
      type: "expiry",
      title: `Consume ${lowerFirst(soon[0].productName)}`,
      reason: soon[0].estimated
        ? "Según la fecha estimada, conviene gastarlo pronto."
        : "Su fecha de caducidad está próxima.",
    };
  else if (needs.length)
    mainRecommendation = {
      type: "needs",
      title: needs.length === 1 ? `Repón ${lowerFirst(needs[0].name)}` : `Repón ${needs.length} productos`,
      reason: "Están por debajo del mínimo que has definido.",
    };

  const lastOperation = [...input.operations]
    .filter((operation) => !operation.undone && now.getTime() - new Date(operation.createdAt).getTime() <= DAY)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    mode: input.mode,
    tranquility: { score, label: tranquility(score) },
    mainRecommendation,
    questions,
    expiring,
    suggestions: suggestions.sort((a, b) => a.productName.localeCompare(b.productName, "es")),
    pendingSuggestions: pendingSuggestions.sort((a, b) => a.confidence - b.confidence),
    certainty,
    stateSummary,
    weekly: {
      spendCents: weekTickets.reduce((sum, ticket) => sum + ticket.totalCents, 0),
      estimatedBudgetCents,
      savingsCents: avoided.length * averagePrice,
      potentialWasteCount: waste.length,
      expiringCount: waste.length,
      avoidedPurchases: avoided.length,
      nextPurchaseDays,
      details: {
        spend: "Suma de los tickets guardados en los últimos siete días.",
        budget: "Últimos precios conocidos de los productos en Preparar.",
        savings: "Compras evitadas multiplicadas por el precio medio aprendido.",
        waste: "Productos con caducidad confirmada o estimada en tres días.",
      },
    },
    undo: lastOperation
      ? {
          id: lastOperation.id,
          summary: lastOperation.summary,
          operationType: lastOperation.operationType,
          createdAt: lastOperation.createdAt,
        }
      : null,
    activity: input.activity.filter((item) => now.getTime() - new Date(item.updatedAt).getTime() <= 60_000),
  };
}

export function todayKey(now = new Date()): string {
  return todayIso(now);
}
