import type { Category } from "../domain/categories";

export type LotState = "closed" | "opened" | "reserved" | "cooked" | "frozen";
export type Mode = "normal" | "autocesta";

/** Producto del catálogo del hogar, con sus existencias y mínimo. */
export interface Product {
  id: string;
  householdId: string;
  sku: string;
  name: string;
  category: Category;
  currentStock: number;
  minimumStock: number;
  suppressed: boolean;
  /** Última vez que alguien confirmó cuánto queda (respuesta, compra o ajuste manual). */
  confirmedAt: string | null;
  /** Hasta esta fecha no se avisa de que se está comprando de más. */
  plannedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lote de un producto en casa, con caducidad y estado. */
export interface InventoryLot {
  id: string;
  householdId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  expiryDate: string | null;
  estimated: boolean;
  state: LotState;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  name: string;
  quantity: number;
  category: Category;
  done: boolean;
  isNew?: boolean;
}

/** Lista compartida del hogar: "Preparar" (shopping) y "En tienda" (checklist). */
export interface Lists {
  householdId: string;
  shopping: ListItem[];
  checklist: ListItem[];
  revision: number;
  updatedAt: string;
}

export interface PurchaseSession {
  id: string;
  householdId: string;
  planned: { name: string; quantity: number }[];
  createdAt: string;
}

/** Compra guardada en el almacén antes de tener el ticket; se concilia con él para no duplicar. */
export interface ProvisionalPurchase {
  id: string;
  householdId: string;
  items: { productId: string | null; name: string; quantity: number; reconciled: number }[];
  createdAt: string;
}

export interface PriceRef {
  id: string;
  householdId: string;
  productId: string | null;
  productName: string;
  category: Category;
  priceCents: number;
  merchant: string;
  source: "ticket" | "mercadona" | "manual";
  observedAt: string;
}

export interface PriceMeta {
  postalCode: string;
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
  updatedCount: number;
  /** Supermercado cuyos precios se ven en la compra (vacío: el último precio pagado en cualquiera). */
  preferredStore?: string;
}

export interface TicketItem {
  description: string;
  quantity: number;
  lineTotalCents: number;
  /** Producto del almacén al que va la línea (lo elige Cesta y se puede cambiar antes de guardar). */
  productId?: string | null;
  /** No es un producto del almacén (bolsa, descuento…): no se suma ni queda para revisar. */
  skip?: boolean;
}

export interface Ticket {
  id: string;
  householdId: string;
  merchant: string;
  purchasedAt: string;
  totalCents: number;
  rawText: string;
  items: TicketItem[];
  imagePath: string | null;
  createdAt: string;
}

export type ReviewIssue = "unidentified" | "possible_duplicate" | "price_change";

export interface TicketReview {
  id: string;
  householdId: string;
  ticketId: string;
  description: string;
  quantity: number;
  lineTotalCents: number;
  issueType: ReviewIssue;
  productId: string | null;
  suggestion: { proposedName?: string; previousPriceCents?: number };
  resolved: boolean;
  createdAt: string;
}

export interface NameAlias {
  id: string;
  householdId: string;
  alias: string;
  productId: string;
  createdAt: string;
}

export interface DogItem {
  id: string;
  householdId: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  updatedAt: string;
}

export interface DogReminder {
  id: string;
  householdId: string;
  title: string;
  reminderTime: string;
  enabled: boolean;
  createdAt: string;
}

export interface Preferences {
  specialDietEnabled: boolean;
  allergens: string[];
  avoided: string[];
  /** Cuándo se dio el consentimiento explícito para guardar alergias y dieta (datos de salud). */
  healthConsentAt?: string | null;
}

export type StockReason = "purchase" | "ticket" | "consume" | "adjust" | "answer" | "cook" | "inventory";

/** Movimiento de existencias: base para predecir el consumo. */
export interface StockEvent {
  id: string;
  householdId: string;
  productId: string;
  delta: number;
  reason: StockReason;
  createdAt: string;
}

/** Operación reversible: guarda cómo deshacerla. */
export interface Operation {
  id: string;
  householdId: string;
  operationType: "ticket" | "purchase" | "cook" | "answer" | "inventory";
  summary: string;
  inverse: InverseStep[];
  undone: boolean;
  createdAt: string;
}

export type InverseStep =
  | { kind: "stock"; productId: string; delta: number }
  | { kind: "deleteLot"; lotId: string }
  | { kind: "restoreLot"; lot: InventoryLot }
  | { kind: "deleteTicket"; ticketId: string }
  | { kind: "setProduct"; productId: string; patch: Partial<Product> };

export interface HouseholdEvent {
  id: string;
  householdId: string;
  kind: "avoided" | "recipe-skip" | "recipe-favorite" | "substitution" | "question-skip" | "week-plan";
  ref: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

/** Plan de la semana del hogar: el día en que empieza y la receta de cada hueco (comida y cena). */
export interface WeekPlanRecord {
  start: string;
  ids: string[];
  updatedAt: string;
}

export interface Activity {
  id: string;
  householdId: string;
  deviceId: string;
  deviceName: string;
  detail: string;
  updatedAt: string;
}

export interface QuickItem {
  id: string;
  name: string;
  quantity: number;
  category: Category;
  unit: string;
  confidence: number;
  source: string;
}

export interface QuickSession {
  id: string;
  householdId: string;
  location: string;
  items: QuickItem[];
  committed: boolean;
  updatedAt: string;
}

export interface BarcodeProduct {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  image: string | null;
  allergens: string[];
  nutrients: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  source: string;
}

export interface SavedBarcode extends BarcodeProduct {
  id: string;
  householdId: string;
  createdAt: string;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  mode: Mode;
  petName: string;
  postalCode: string;
  priceMeta: PriceMeta;
  preferences: Preferences;
  createdAt: string;
}

/** Tablas que guarda cada hogar. */
export interface Tables {
  products: Product;
  inventory_lots: InventoryLot;
  purchase_sessions: PurchaseSession;
  provisional_purchases: ProvisionalPurchase;
  prices: PriceRef;
  tickets: Ticket;
  ticket_reviews: TicketReview;
  name_aliases: NameAlias;
  dog_items: DogItem;
  dog_reminders: DogReminder;
  stock_events: StockEvent;
  operations: Operation;
  household_events: HouseholdEvent;
  activity: Activity;
  quick_sessions: QuickSession;
  barcodes: SavedBarcode;
}

export type TableName = keyof Tables;
