import { canonicalStore } from "../../domain/stores";
import { normalize } from "../../lib/text";
import type { PriceMeta, PriceRef } from "../types";

import { ListsApi } from "./lists";
import { now } from "./shared";

/** Precios: solo los que el hogar ha pagado, aprendidos de sus tickets. */
export class PricesApi extends ListsApi {
  async prices(): Promise<{ prices: PriceRef[]; meta: PriceMeta }> {
    const [prices, household] = await Promise.all([this.db.list("prices"), this.db.getHousehold()]);
    // Último precio conocido de cada producto en cada supermercado (para ver los del súper elegido).
    // Los de la tienda online de Mercadona (versiones anteriores) ya no se usan: sin API oficial,
    // no son una fuente fiable.
    const latest = new Map<string, PriceRef>();
    for (const price of prices
      .filter((price) => price.source !== "mercadona")
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))) {
      const store = canonicalStore(price.merchant) ?? normalize(price.merchant);
      latest.set(`${normalize(price.productName)}|${store}`, price);
    }
    return { prices: [...latest.values()], meta: household.priceMeta };
  }

  /** Supermercado cuyos precios se ven en la compra; vacío para el último precio pagado en cualquiera. */
  async setPreferredStore(store: string): Promise<PriceMeta> {
    const household = await this.db.getHousehold();
    const meta: PriceMeta = { ...household.priceMeta, preferredStore: store };
    await this.db.updateHousehold({ priceMeta: meta });
    return meta;
  }

  /** Repasa los precios aprendidos de los tickets de los últimos 30 días. */
  async refreshPrices(): Promise<{ prices: PriceRef[]; meta: PriceMeta; learned: number }> {
    const [household, tickets] = await Promise.all([this.db.getHousehold(), this.db.list("tickets")]);
    const learned = new Set(
      tickets
        .filter((ticket) => Date.now() - new Date(ticket.createdAt).getTime() <= 30 * 864e5)
        .flatMap((ticket) => ticket.items.filter((item) => item.productId).map((item) => item.productId)),
    ).size;
    const attemptedAt = now();
    const meta: PriceMeta = {
      ...household.priceMeta,
      postalCode: household.postalCode,
      lastAttemptedAt: attemptedAt,
      lastSuccessfulAt: learned ? attemptedAt : household.priceMeta.lastSuccessfulAt,
      updatedCount: learned,
    };
    await this.db.updateHousehold({ priceMeta: meta });
    const { prices } = await this.prices();
    return { prices, meta, learned };
  }
}
