import { PERISHABLE } from "../../domain/categories";
import { cleanProductName, findProduct, similarNames } from "../../domain/matching";
import { uid } from "../../lib/text";
import type { InverseStep, PriceRef, Ticket, TicketItem, TicketReview } from "../types";
import { logError } from "../../lib/errors";

import { PricesApi } from "./prices";
import { ApiError, now } from "./shared";

/** Tickets: guardado, revisión, edición y borrado. */
export class TicketsApi extends PricesApi {
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
    try {
      return await this.atomically((tx) => tx.saveTicketSteps(input, merchant, ticketId, imagePath));
    } catch (error) {
      // La foto se subió antes de la transacción: si el ticket no se guarda, no debe quedar huérfana.
      if (imagePath) await this.db.removeTicketImages([imagePath]).catch(logError("borrar foto huérfana"));
      throw error;
    }
  }

  protected async saveTicketSteps(
    input: { purchasedAt: string; totalCents: number; rawText: string; items: TicketItem[] },
    merchant: string,
    ticketId: string,
    imagePath: string | null,
  ): Promise<{ ticket: Ticket; reviews: number; added: number }> {
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

  protected review(
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
    const [ticket, reviews] = await Promise.all([
      this.db.get("tickets", id),
      this.db.listBy("ticket_reviews", "ticketId", id),
    ]);
    await this.atomically(async (tx) => {
      await tx.db.remove("tickets", [id]);
      await tx.db.remove(
        "ticket_reviews",
        reviews.map((review) => review.id),
      );
    });
    // La foto se borra después: si el borrado del ticket fallara, la foto seguiría siendo suya.
    if (ticket?.imagePath)
      await this.db.removeTicketImages([ticket.imagePath]).catch(logError("borrar foto de ticket"));
  }

  /** Resuelve una línea dudosa. Si se corrige el nombre, se recuerda para los próximos tickets. */
  async resolveReview(reviewId: string, correctedName: string): Promise<void> {
    await this.atomically((tx) => tx.resolveReviewSteps(reviewId, correctedName));
  }

  protected async resolveReviewSteps(reviewId: string, correctedName: string): Promise<void> {
    const review = await this.db.get("ticket_reviews", reviewId);
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
        const ticket = await this.db.get("tickets", review.ticketId);
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
}
