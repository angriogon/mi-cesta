import { normalize } from "../../lib/text";
import type { PriceMeta, PriceRef } from "../types";
import { logError } from "../../lib/errors";

import { ListsApi } from "./lists";
import { now } from "./shared";

/** Precios aprendidos de los tickets y de referencia externa. */
export class PricesApi extends ListsApi {
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
}
