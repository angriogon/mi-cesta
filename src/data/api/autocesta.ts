import { buildOverview, predictions, type Overview, type Prediction } from "../../domain/autocesta";
import { addDaysIso, todayIso } from "../../lib/text";
import type { InverseStep, ListItem, Mode } from "../types";
import { logError } from "../../lib/errors";

import { ApiBase } from "./base";
import { now } from "./shared";

/** AutoCesta: resumen, previsiones, respuestas y deshacer. */
export class AutoCestaApi extends ApiBase {
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

  /** Primer uso: fija de una vez los mínimos de los básicos elegidos (todo o nada). */
  async setStarterMinimums(choices: { productId: string; minimum: number }[]): Promise<void> {
    await this.atomically(async (tx) => {
      for (const choice of choices) await tx.updateProduct(choice.productId, { minimumStock: choice.minimum });
    });
  }

  async setMode(mode: Mode): Promise<void> {
    await this.db.updateHousehold({ mode });
  }

  async answer(productId: string, answer: "yes" | "little" | "no" | "unknown"): Promise<void> {
    const product = await this.db.get("products", productId);
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

  async recipeFavorite(recipeId: string, on: boolean): Promise<void> {
    await this.logEvent("recipe-favorite", recipeId, { on });
  }

  /** Recetas favoritas: manda la última marca de cada receta. */
  async favoriteRecipes(): Promise<Set<string>> {
    const events = (await this.db.list("household_events"))
      .filter((event) => event.kind === "recipe-favorite" && event.ref)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = new Map(events.map((event) => [event.ref!, event.data.on === true]));
    return new Set([...latest].filter(([, on]) => on).map(([id]) => id));
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

  /** Deshace la última operación reversible (ticket, compra, cocinado, respuesta o inventario). */
  async undo(): Promise<string | null> {
    const result = await this.atomically((tx) => tx.undoSteps());
    if (!result) return null;
    // Las fotos de los tickets deshechos se borran solo cuando el deshacer ya está guardado.
    if (result.images.length) await this.db.removeTicketImages(result.images).catch(logError("borrar foto de ticket"));
    return result.summary;
  }

  protected async undoSteps(): Promise<{ summary: string; images: string[] } | null> {
    const images: string[] = [];
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
        const ticket = await this.db.get("tickets", step.ticketId);
        if (ticket?.imagePath) images.push(ticket.imagePath);
        await this.db.remove("tickets", [step.ticketId]);
        const reviews = await this.db.listBy("ticket_reviews", "ticketId", step.ticketId);
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
    return { summary: last.summary, images };
  }
}
