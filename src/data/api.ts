import { buildOverview, predictions, type Overview, type Prediction } from "../domain/autocesta";
import { asCategory, guessCategory, PERISHABLE, type Category } from "../domain/categories";
import { cleanProductName, findProduct, similarNames } from "../domain/matching";
import { productForIngredient } from "../domain/recipes";
import { addDaysIso, normalize, todayIso, uid } from "../lib/text";
import type { Db } from "./db";
import { lookupOpenFoodFacts } from "./openfoodfacts";
import type {
  BarcodeProduct,
  DogItem,
  DogReminder,
  Household,
  HouseholdEvent,
  InventoryLot,
  InverseStep,
  ListItem,
  Lists,
  LotState,
  Mode,
  Operation,
  Preferences,
  PriceMeta,
  PriceRef,
  Product,
  QuickItem,
  QuickSession,
  StockEvent,
  StockReason,
  Ticket,
  TicketItem,
  TicketReview,
} from "./types";
import { logError } from "../lib/errors";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();

function slug(value: string): string {
  return cleanProductName(value).replace(/\s+/g, "-").slice(0, 60) || "producto";
}

export interface ExternalPrices {
  /** Consulta precios de referencia externos (Mercadona). Devuelve null si no hay conexión. */
  fetch(postalCode: string, names: string[]): Promise<{ name: string; priceCents: number }[] | null>;
}

/**
 * Equivale a las rutas de servidor de la versión original (/api/*), pero trabaja
 * directamente sobre la base de datos del hogar.
 */
export class CestaApi {
  constructor(
    readonly db: Db,
    private readonly externalPrices?: ExternalPrices,
  ) {}

  // ---------- Productos y existencias ----------

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
  private async ensureProduct(products: Product[], name: string, category?: Category): Promise<Product> {
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
    const product = (await this.db.list("products")).find((item) => item.id === id);
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
    await this.db.remove("products", [id]);
    const lots = (await this.db.list("inventory_lots")).filter((lot) => lot.productId === id);
    await this.db.remove(
      "inventory_lots",
      lots.map((lot) => lot.id),
    );
  }

  private async logStock(productId: string, delta: number, reason: StockReason) {
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

  private async changeStock(product: Product, delta: number, reason: StockReason, inverse: InverseStep[]) {
    const currentStock = Math.max(0, Math.round((product.currentStock + delta) * 1000) / 1000);
    const applied = currentStock - product.currentStock;
    if (!applied) return;
    product.currentStock = currentStock;
    await this.db.update("products", product.id, { currentStock, confirmedAt: now(), updatedAt: now() });
    await this.logStock(product.id, applied, reason);
    inverse.push({ kind: "stock", productId: product.id, delta: -applied });
  }

  // ---------- Lotes (caducidades y estados) ----------

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
  private async consumeLots(productId: string, units: number, inverse: InverseStep[]) {
    let left = units;
    const lots = (await this.db.list("inventory_lots"))
      .filter((lot) => lot.productId === productId && lot.quantity > 0)
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

  // ---------- Listas compartidas ----------

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
    return { products: await this.products(), stored };
  }

  // ---------- AutoCesta ----------

  async overview(shopping: ListItem[]): Promise<Overview> {
    const [household, products, lots, stockEvents, tickets, prices, events, operations, activity] = await Promise.all([
      this.db.getHousehold(),
      this.db.list("products"),
      this.lots(),
      this.db.list("stock_events"),
      this.db.list("tickets"),
      this.db.list("prices"),
      this.db.list("household_events"),
      this.db.list("operations"),
      this.db.list("activity"),
    ]);
    return buildOverview({
      mode: household.mode,
      products,
      lots,
      stockEvents,
      tickets,
      prices,
      shopping,
      events,
      operations,
      activity,
    });
  }

  async insights(): Promise<Prediction[]> {
    const [products, events] = await Promise.all([this.db.list("products"), this.db.list("stock_events")]);
    return predictions(products, events);
  }

  async setMode(mode: Mode): Promise<void> {
    await this.db.updateHousehold({ mode });
  }

  async answer(productId: string, answer: "yes" | "little" | "no" | "unknown"): Promise<void> {
    const product = (await this.db.list("products")).find((item) => item.id === productId);
    if (!product) return;
    if (answer === "unknown") {
      await this.logEvent("question-skip", productId, {});
      return;
    }
    const inverse: InverseStep[] = [
      {
        kind: "setProduct",
        productId,
        patch: { currentStock: product.currentStock, confirmedAt: product.confirmedAt },
      },
    ];
    const target =
      answer === "yes"
        ? Math.max(1, product.currentStock)
        : answer === "little"
          ? Math.max(1, Math.min(product.currentStock, Math.floor(product.minimumStock / 2) || 1))
          : 0;
    if (target !== product.currentStock) await this.logStock(productId, target - product.currentStock, "answer");
    await this.db.update("products", productId, { currentStock: target, confirmedAt: now(), updatedAt: now() });
    const summary =
      answer === "yes"
        ? `Queda ${product.name}`
        : answer === "little"
          ? `Queda poco ${product.name}`
          : `No queda ${product.name}`;
    await this.recordOperation("answer", summary, inverse);
  }

  async suppress(productId: string): Promise<void> {
    await this.db.update("products", productId, { suppressed: true, updatedAt: now() });
  }

  async unsuppress(productId: string): Promise<void> {
    await this.db.update("products", productId, { suppressed: false, updatedAt: now() });
  }

  async planned(productId: string): Promise<void> {
    await this.db.update("products", productId, { plannedUntil: addDaysIso(todayIso(), 14), updatedAt: now() });
  }

  async avoided(): Promise<void> {
    await this.logEvent("avoided", null, {});
  }

  async substitution(requestedName: string, substituteProductId: string, decision: "accept" | "reject"): Promise<void> {
    await this.logEvent("substitution", substituteProductId, { requestedName, decision });
  }

  async recipeSkip(recipeId: string): Promise<void> {
    await this.logEvent("recipe-skip", recipeId, {});
  }

  async skippedRecipes(): Promise<Set<string>> {
    const events = await this.db.list("household_events");
    return new Set(events.filter((event) => event.kind === "recipe-skip" && event.ref).map((event) => event.ref!));
  }

  async rejectedSubstitutions(): Promise<{ requestedName: string; productId: string }[]> {
    const events = await this.db.list("household_events");
    return events
      .filter((event) => event.kind === "substitution" && event.data.decision === "reject" && event.ref)
      .map((event) => ({
        requestedName: typeof event.data.requestedName === "string" ? event.data.requestedName : "",
        productId: event.ref!,
      }));
  }

  async activity(deviceId: string, deviceName: string, detail: string): Promise<void> {
    await this.db.insert("activity", [
      { id: deviceId, householdId: this.db.householdId, deviceId, deviceName, detail, updatedAt: now() },
    ]);
  }

  private async logEvent(kind: HouseholdEvent["kind"], ref: string | null, data: Record<string, unknown>) {
    await this.db.insert("household_events", [
      { id: uid(), householdId: this.db.householdId, kind, ref, data, createdAt: now() },
    ]);
  }

  private async recordOperation(operationType: Operation["operationType"], summary: string, inverse: InverseStep[]) {
    if (!inverse.length) return;
    await this.db.insert("operations", [
      { id: uid(), householdId: this.db.householdId, operationType, summary, inverse, undone: false, createdAt: now() },
    ]);
  }

  /** Deshace la última operación reversible (ticket, compra, cocinado, respuesta o inventario). */
  async undo(): Promise<string | null> {
    const operations = await this.db.list("operations");
    const last = operations
      .filter((operation) => !operation.undone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!last) return null;
    const products = await this.db.list("products");
    for (const step of [...last.inverse].reverse()) {
      if (step.kind === "stock") {
        const product = products.find((item) => item.id === step.productId);
        if (!product) continue;
        product.currentStock = Math.max(0, product.currentStock + step.delta);
        await this.db.update("products", product.id, { currentStock: product.currentStock, updatedAt: now() });
        await this.logStock(product.id, step.delta, "adjust");
      } else if (step.kind === "deleteLot") await this.db.remove("inventory_lots", [step.lotId]);
      else if (step.kind === "restoreLot") await this.db.insert("inventory_lots", [step.lot]);
      else if (step.kind === "deleteTicket") {
        const ticket = (await this.db.list("tickets")).find((item) => item.id === step.ticketId);
        if (ticket?.imagePath)
          await this.db.removeTicketImages([ticket.imagePath]).catch(logError("borrar foto de ticket"));
        await this.db.remove("tickets", [step.ticketId]);
        const reviews = (await this.db.list("ticket_reviews")).filter((review) => review.ticketId === step.ticketId);
        await this.db.remove(
          "ticket_reviews",
          reviews.map((review) => review.id),
        );
        const prices = (await this.db.list("prices")).filter(
          (price) => price.source === "ticket" && price.id.startsWith(`${step.ticketId}:`),
        );
        await this.db.remove(
          "prices",
          prices.map((price) => price.id),
        );
      } else if (step.kind === "setProduct")
        await this.db.update("products", step.productId, { ...step.patch, updatedAt: now() });
    }
    await this.db.update("operations", last.id, { undone: true });
    return last.summary;
  }

  // ---------- Recetas ----------

  /** Descuenta una unidad de cada ingrediente usado y guarda las raciones sobrantes como cocinadas. */
  async cook(recipeTitle: string, ingredients: string[], servings: number): Promise<void> {
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

  // ---------- Precios ----------

  async prices(): Promise<{ prices: PriceRef[]; meta: PriceMeta }> {
    const [prices, household] = await Promise.all([this.db.list("prices"), this.db.getHousehold()]);
    // Último precio conocido por producto.
    const latest = new Map<string, PriceRef>();
    for (const price of prices.sort((a, b) => a.observedAt.localeCompare(b.observedAt)))
      latest.set(normalize(price.productName), price);
    return { prices: [...latest.values()], meta: household.priceMeta };
  }

  /** Actualiza precios: aprende de los tickets y consulta Mercadona para fruta y verdura. */
  async refreshPrices(): Promise<{
    prices: PriceRef[];
    meta: PriceMeta;
    learned: number;
    externalUpdated: number;
    online: boolean;
  }> {
    const household = await this.db.getHousehold();
    const tickets = await this.db.list("tickets");
    const learned = new Set(
      tickets
        .filter((ticket) => Date.now() - new Date(ticket.createdAt).getTime() <= 30 * 864e5)
        .flatMap((ticket) => ticket.items.filter((item) => item.productId).map((item) => item.productId)),
    ).size;
    let externalUpdated = 0;
    let online = false;
    const attemptedAt = now();
    if (this.externalPrices && household.postalCode) {
      const products = (await this.db.list("products")).filter((product) => product.category === "Fruta y verdura");
      const result = await this.externalPrices
        .fetch(
          household.postalCode,
          products.map((product) => product.name),
        )
        .catch((error: unknown) => {
          logError("precios externos")(error);
          return null;
        });
      if (result) {
        online = true;
        const rows: PriceRef[] = [];
        for (const item of result) {
          const product = products.find((candidate) => normalize(candidate.name) === normalize(item.name));
          if (!product || !item.priceCents) continue;
          rows.push({
            id: `mercadona:${product.id}`,
            householdId: this.db.householdId,
            productId: product.id,
            productName: product.name,
            category: product.category,
            priceCents: item.priceCents,
            merchant: "Mercadona",
            source: "mercadona",
            observedAt: attemptedAt,
          });
        }
        await this.db.insert("prices", rows);
        externalUpdated = rows.length;
      }
    }
    const meta: PriceMeta = {
      postalCode: household.postalCode,
      lastAttemptedAt: attemptedAt,
      lastSuccessfulAt: online || learned ? attemptedAt : household.priceMeta.lastSuccessfulAt,
      updatedCount: learned + externalUpdated,
    };
    await this.db.updateHousehold({ priceMeta: meta });
    const { prices } = await this.prices();
    return { prices, meta, learned, externalUpdated, online };
  }

  // ---------- Tickets ----------

  async tickets(): Promise<{ tickets: Ticket[]; reviews: TicketReview[] }> {
    const [tickets, reviews] = await Promise.all([this.db.list("tickets"), this.db.list("ticket_reviews")]);
    return {
      tickets: tickets.sort(
        (a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt),
      ),
      reviews: reviews.filter((review) => !review.resolved).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  /**
   * Guarda un ticket: suma al almacén lo que no se guardó ya como compra provisional,
   * aprende precios y deja para revisar solo lo dudoso.
   */
  async saveTicket(input: {
    image: Blob | null;
    merchant: string;
    purchasedAt: string;
    totalCents: number;
    rawText: string;
    items: TicketItem[];
  }): Promise<{ ticket: Ticket; reviews: number; added: number }> {
    const merchant = input.merchant.trim() || "Ticket";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchasedAt)) throw new ApiError("La fecha no es válida.");
    if (!Number.isFinite(input.totalCents) || input.totalCents <= 0) throw new ApiError("Indica el total del ticket.");
    const ticketId = uid();
    const imagePath = input.image ? await this.db.uploadTicketImage(ticketId, input.image) : null;
    const [products, aliases, prices, provisional] = await Promise.all([
      this.db.list("products"),
      this.db.list("name_aliases"),
      this.db.list("prices"),
      this.db.list("provisional_purchases"),
    ]);
    const recentProvisional = provisional.filter(
      (purchase) => Date.now() - new Date(purchase.createdAt).getTime() <= 4 * 864e5,
    );
    const inverse: InverseStep[] = [{ kind: "deleteTicket", ticketId }];
    const reviews: TicketReview[] = [];
    const newPrices: PriceRef[] = [];
    const seen = new Set<string>();
    const items: TicketItem[] = [];
    let added = 0;

    for (const raw of input.items) {
      const item: TicketItem = {
        description: raw.description.trim(),
        quantity: Math.max(0, Number(raw.quantity) || 0),
        lineTotalCents: Math.max(0, Math.round(raw.lineTotalCents)),
      };
      if (!item.description) continue;
      const key = cleanProductName(item.description);
      const product = findProduct(item.description, products, aliases);
      if (!product) {
        reviews.push(this.review(ticketId, item, "unidentified", null, { proposedName: item.description }));
        items.push({ ...item, productId: null });
        continue;
      }
      items.push({ ...item, productId: product.id });
      if (seen.has(key)) reviews.push(this.review(ticketId, item, "possible_duplicate", product.id, {}));
      seen.add(key);

      const unitCents = item.quantity ? Math.round(item.lineTotalCents / item.quantity) : 0;
      const previous = prices
        .filter((price) => price.productId === product.id)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
      if (previous && unitCents && Math.abs(unitCents - previous.priceCents) / previous.priceCents >= 0.6)
        reviews.push(
          this.review(ticketId, item, "price_change", product.id, { previousPriceCents: previous.priceCents }),
        );
      if (unitCents)
        newPrices.push({
          id: `${ticketId}:${product.id}`,
          householdId: this.db.householdId,
          productId: product.id,
          productName: product.name,
          category: product.category,
          priceCents: unitCents,
          merchant,
          source: "ticket",
          observedAt: `${input.purchasedAt}T12:00:00.000Z`,
        });

      // Unidades ya guardadas desde "En tienda": no se vuelven a sumar.
      let units = Number.isInteger(item.quantity) ? item.quantity : 1;
      for (const purchase of recentProvisional) {
        for (const line of purchase.items) {
          if (units <= 0) break;
          const matches = line.productId === product.id || similarNames(line.name, product.name);
          const available = line.quantity - line.reconciled;
          if (!matches || available <= 0) continue;
          const used = Math.min(available, units);
          line.reconciled += used;
          units -= used;
        }
      }
      if (units > 0) {
        await this.changeStock(product, units, "ticket", inverse);
        added += units;
        if (PERISHABLE.includes(product.category)) {
          const lot = await this.addLot({
            productId: product.id,
            productName: product.name,
            quantity: units,
            expiryDate: null,
          });
          inverse.push({ kind: "deleteLot", lotId: lot.id });
        }
      }
    }

    for (const purchase of recentProvisional)
      await this.db.update("provisional_purchases", purchase.id, { items: purchase.items });

    const ticket: Ticket = {
      id: ticketId,
      householdId: this.db.householdId,
      merchant,
      purchasedAt: input.purchasedAt,
      totalCents: Math.round(input.totalCents),
      rawText: input.rawText.slice(0, 20000),
      items,
      imagePath,
      createdAt: now(),
    };
    await this.db.insert("tickets", [ticket]);
    await this.db.insert("ticket_reviews", reviews);
    await this.db.insert("prices", newPrices);
    await this.recordOperation("ticket", `Ticket · ${merchant}`, inverse);
    return { ticket, reviews: reviews.length, added };
  }

  private review(
    ticketId: string,
    item: TicketItem,
    issueType: TicketReview["issueType"],
    productId: string | null,
    suggestion: TicketReview["suggestion"],
  ): TicketReview {
    return {
      id: uid(),
      householdId: this.db.householdId,
      ticketId,
      description: item.description,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      issueType,
      productId,
      suggestion,
      resolved: false,
      createdAt: now(),
    };
  }

  async updateTicket(ticket: Pick<Ticket, "id" | "merchant" | "purchasedAt" | "totalCents" | "items">): Promise<void> {
    if (!ticket.merchant.trim()) throw new ApiError("Indica el supermercado.");
    if (ticket.totalCents <= 0) throw new ApiError("El total debe ser mayor que cero.");
    await this.db.update("tickets", ticket.id, {
      merchant: ticket.merchant.trim(),
      purchasedAt: ticket.purchasedAt,
      totalCents: Math.round(ticket.totalCents),
      items: ticket.items.filter((item) => item.description.trim()),
    });
  }

  async deleteTicket(id: string): Promise<void> {
    const ticket = (await this.db.list("tickets")).find((item) => item.id === id);
    if (ticket?.imagePath)
      await this.db.removeTicketImages([ticket.imagePath]).catch(logError("borrar foto de ticket"));
    await this.db.remove("tickets", [id]);
    const reviews = (await this.db.list("ticket_reviews")).filter((review) => review.ticketId === id);
    await this.db.remove(
      "ticket_reviews",
      reviews.map((review) => review.id),
    );
  }

  /** Resuelve una línea dudosa. Si se corrige el nombre, se recuerda para los próximos tickets. */
  async resolveReview(reviewId: string, correctedName: string): Promise<void> {
    const review = (await this.db.list("ticket_reviews")).find((item) => item.id === reviewId);
    if (!review) return;
    if (review.issueType === "unidentified") {
      const name = correctedName.trim() || review.description;
      const products = await this.db.list("products");
      const product = findProduct(name, products) ?? (await this.ensureProduct(products, name));
      await this.db.insert("name_aliases", [
        {
          id: uid(),
          householdId: this.db.householdId,
          alias: review.description,
          productId: product.id,
          createdAt: now(),
        },
      ]);
      const units = Number.isInteger(review.quantity) && review.quantity > 0 ? review.quantity : 1;
      const inverse: InverseStep[] = [];
      await this.changeStock(product, units, "ticket", inverse);
      if (review.quantity && review.lineTotalCents) {
        const ticket = (await this.db.list("tickets")).find((item) => item.id === review.ticketId);
        await this.db.insert("prices", [
          {
            id: `${review.ticketId}:${product.id}`,
            householdId: this.db.householdId,
            productId: product.id,
            productName: product.name,
            category: product.category,
            priceCents: Math.round(review.lineTotalCents / review.quantity),
            merchant: ticket?.merchant ?? "Ticket",
            source: "ticket",
            observedAt: ticket ? `${ticket.purchasedAt}T12:00:00.000Z` : now(),
          },
        ]);
        if (ticket)
          await this.db.update("tickets", ticket.id, {
            items: ticket.items.map((item) =>
              item.description === review.description && !item.productId ? { ...item, productId: product.id } : item,
            ),
          });
      }
    }
    await this.db.update("ticket_reviews", reviewId, { resolved: true });
  }

  async ticketImageUrl(path: string): Promise<string | null> {
    return this.db.ticketImageUrl(path);
  }

  // ---------- Inventario rápido ----------

  async quickInventory(): Promise<{
    sessions: QuickSession[];
    recentTicketItems: Omit<QuickItem, "id" | "source" | "confidence">[];
  }> {
    const [sessions, tickets, products] = await Promise.all([
      this.db.list("quick_sessions"),
      this.db.list("tickets"),
      this.db.list("products"),
    ]);
    const recent = new Map<string, Omit<QuickItem, "id" | "source" | "confidence">>();
    for (const ticket of tickets.filter(
      (item) => Date.now() - new Date(`${item.purchasedAt}T12:00:00`).getTime() <= 14 * 864e5,
    )) {
      for (const line of ticket.items) {
        const product = line.productId ? products.find((item) => item.id === line.productId) : null;
        const name = product?.name ?? line.description;
        const key = normalize(name);
        const previous = recent.get(key);
        const quantity = Number.isInteger(line.quantity) ? line.quantity : 1;
        recent.set(key, {
          name,
          quantity: (previous?.quantity ?? 0) + quantity,
          category: product?.category ?? guessCategory(name),
          unit: "unidad",
        });
      }
    }
    return {
      sessions: sessions.filter((session) => !session.committed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      recentTicketItems: [...recent.values()],
    };
  }

  async saveQuickSession(id: string | null, location: string, items: QuickItem[]): Promise<string> {
    const sessionId = id || uid();
    await this.db.insert("quick_sessions", [
      { id: sessionId, householdId: this.db.householdId, location, items, committed: false, updatedAt: now() },
    ]);
    return sessionId;
  }

  /** Incorpora el recuento al almacén: fija las existencias contadas en esa zona. */
  async commitQuickSession(id: string | null, location: string, items: QuickItem[]): Promise<number> {
    const products = await this.db.list("products");
    const inverse: InverseStep[] = [];
    let count = 0;
    for (const item of items) {
      const name = item.name.trim();
      if (name.length < 2 || item.quantity <= 0) continue;
      const product = await this.ensureProduct(products, name, item.category);
      const units = Math.max(1, Math.round(item.quantity));
      await this.changeStock(product, units, "inventory", inverse);
      const lot = await this.addLot({
        productId: product.id,
        productName: product.name,
        quantity: units,
        expiryDate: null,
        state: location === "Congelador" ? "frozen" : "closed",
        location,
      });
      inverse.push({ kind: "deleteLot", lotId: lot.id });
      count += 1;
    }
    if (id) await this.db.remove("quick_sessions", [id]);
    await this.recordOperation("inventory", `Inventario · ${location}`, inverse);
    return count;
  }

  // ---------- Código de barras ----------

  async lookupBarcode(code: string): Promise<BarcodeProduct | null> {
    const clean = code.replace(/\D/g, "").slice(0, 18);
    if (clean.length < 8) throw new ApiError("El código debe tener al menos 8 números.");
    const saved = (await this.db.list("barcodes")).find((item) => item.code === clean);
    if (saved) return saved;
    return lookupOpenFoodFacts(clean);
  }

  async saveBarcode(code: string, name: string): Promise<BarcodeProduct> {
    const clean = code.replace(/\D/g, "");
    if (clean.length < 8) throw new ApiError("El código no es válido.");
    if (name.trim().length < 2) throw new ApiError("Escribe el nombre del producto.");
    const product = {
      id: uid(),
      householdId: this.db.householdId,
      code: clean,
      name: name.trim(),
      brand: "",
      quantity: "",
      image: null,
      allergens: [],
      nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      source: "Guardado por tu hogar",
      createdAt: now(),
    };
    const existing = (await this.db.list("barcodes")).filter((item) => item.code === clean);
    await this.db.remove(
      "barcodes",
      existing.map((item) => item.id),
    );
    await this.db.insert("barcodes", [product]);
    return product;
  }

  // ---------- Serranito ----------

  async dogItems(): Promise<{ items: DogItem[]; petName: string }> {
    const [items, household] = await Promise.all([this.db.list("dog_items"), this.db.getHousehold()]);
    return { items: items.sort((a, b) => a.name.localeCompare(b.name, "es")), petName: household.petName };
  }

  async addDogItem(name: string): Promise<DogItem> {
    const clean = name.trim();
    if (clean.length < 2) throw new ApiError("Escribe un nombre de al menos 2 caracteres.");
    const items = await this.db.list("dog_items");
    if (items.some((item) => normalize(item.name) === normalize(clean)))
      throw new ApiError("Ese artículo ya existe.", 409);
    const item: DogItem = {
      id: uid(),
      householdId: this.db.householdId,
      name: clean,
      currentStock: 0,
      minimumStock: 1,
      updatedAt: now(),
    };
    await this.db.insert("dog_items", [item]);
    return item;
  }

  async updateDogItem(item: Pick<DogItem, "id" | "currentStock" | "minimumStock">): Promise<void> {
    await this.db.update("dog_items", item.id, {
      currentStock: Math.max(0, Math.round(item.currentStock)),
      minimumStock: Math.max(0, Math.round(item.minimumStock)),
      updatedAt: now(),
    });
  }

  async deleteDogItem(id: string): Promise<void> {
    await this.db.remove("dog_items", [id]);
  }

  async setPetName(name: string): Promise<string> {
    const clean = name.trim().slice(0, 40);
    if (!clean) throw new ApiError("Escribe un nombre.");
    const household = await this.db.updateHousehold({ petName: clean });
    return household.petName;
  }

  async reminders(): Promise<DogReminder[]> {
    return (await this.db.list("dog_reminders")).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
  }

  async addReminder(title: string, reminderTime: string): Promise<DogReminder[]> {
    if (!title.trim()) throw new ApiError("Escribe el aviso.");
    if (!/^\d{2}:\d{2}$/.test(reminderTime)) throw new ApiError("La hora no es válida.");
    await this.db.insert("dog_reminders", [
      {
        id: uid(),
        householdId: this.db.householdId,
        title: title.trim().slice(0, 80),
        reminderTime,
        enabled: true,
        createdAt: now(),
      },
    ]);
    return this.reminders();
  }

  async updateReminder(
    id: string,
    patch: Partial<Pick<DogReminder, "title" | "reminderTime" | "enabled">>,
  ): Promise<DogReminder[]> {
    if (patch.title !== undefined && !patch.title.trim()) throw new ApiError("Escribe el aviso.");
    if (patch.reminderTime !== undefined && !/^\d{2}:\d{2}$/.test(patch.reminderTime))
      throw new ApiError("La hora no es válida.");
    await this.db.update("dog_reminders", id, { ...patch, ...(patch.title ? { title: patch.title.trim() } : {}) });
    return this.reminders();
  }

  async deleteReminder(id: string): Promise<DogReminder[]> {
    await this.db.remove("dog_reminders", [id]);
    return this.reminders();
  }

  // ---------- Hogar y preferencias ----------

  async household(): Promise<Household> {
    return this.db.getHousehold();
  }

  async preferences(): Promise<Preferences> {
    return (await this.db.getHousehold()).preferences;
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    const clean = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 30);
    await this.db.updateHousehold({
      preferences: {
        specialDietEnabled: preferences.specialDietEnabled,
        allergens: clean(preferences.allergens),
        avoided: clean(preferences.avoided),
      },
    });
  }

  async setPostalCode(postalCode: string): Promise<void> {
    const clean = postalCode.trim();
    if (clean && !/^\d{5}$/.test(clean)) throw new ApiError("El código postal debe tener 5 números.");
    const household = await this.db.getHousehold();
    await this.db.updateHousehold({ postalCode: clean, priceMeta: { ...household.priceMeta, postalCode: clean } });
  }

  async renameHousehold(name: string): Promise<void> {
    const clean = name.trim().slice(0, 50);
    if (!clean) throw new ApiError("Escribe un nombre para el hogar.");
    await this.db.updateHousehold({ name: clean });
  }

  /** Borra todos los datos del hogar y deja el catálogo con existencias a cero. */
  async resetHousehold(): Promise<void> {
    const tables = [
      "inventory_lots",
      "purchase_sessions",
      "provisional_purchases",
      "prices",
      "tickets",
      "ticket_reviews",
      "name_aliases",
      "dog_items",
      "dog_reminders",
      "stock_events",
      "operations",
      "household_events",
      "activity",
      "quick_sessions",
      "barcodes",
    ] as const;
    const images = (await this.db.list("tickets")).flatMap((ticket) => (ticket.imagePath ? [ticket.imagePath] : []));
    await this.db.removeTicketImages(images).catch(logError("borrar fotos del hogar"));
    for (const table of tables) await this.db.removeAll(table);
    const products = await this.db.list("products");
    const custom = products.filter((product) => product.sku.startsWith("custom-"));
    await this.db.remove(
      "products",
      custom.map((product) => product.id),
    );
    for (const product of products.filter((item) => !item.sku.startsWith("custom-"))) {
      if (product.currentStock || product.minimumStock || product.suppressed)
        await this.db.update("products", product.id, {
          currentStock: 0,
          minimumStock: 0,
          suppressed: false,
          plannedUntil: null,
          updatedAt: now(),
        });
    }
    const lists = await this.db.getLists();
    await this.db.casLists([], [], lists.revision);
    const household = await this.db.getHousehold();
    await this.db.updateHousehold({
      mode: "normal",
      priceMeta: { postalCode: household.postalCode, lastAttemptedAt: null, lastSuccessfulAt: null, updatedCount: 0 },
    });
  }
}
