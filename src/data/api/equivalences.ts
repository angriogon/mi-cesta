import { DEFAULT_EQUIVALENCES, matchLine, type MatchSource } from "../../domain/equivalences";
import { cleanProductName } from "../../domain/matching";
import type { Product, TicketItem } from "../types";
import { TicketsApi } from "./tickets";
import { ApiError, now } from "./shared";

export interface MatchedItem extends TicketItem {
  /** Nombre del producto del almacén al que va la línea, o null si no se reconoce. */
  productName: string | null;
  /** De dónde sale: equivalencia del hogar, de serie o por parecido de nombre. */
  source: MatchSource | null;
}

export interface Equivalence {
  id: string;
  alias: string;
  productId: string;
  productName: string;
  /** El producto se creó con el texto del ticket (no es del catálogo): conviene elegir el del almacén. */
  fromTicket: boolean;
  /** Para las creadas desde el ticket: el producto del catálogo que parece corresponder, si lo hay. */
  suggestion: { productId: string; productName: string } | null;
}

/** Resultado de cambiar una equivalencia: el producto integrado (si lo hubo) y las unidades movidas. */
export interface MergeResult {
  merged: string | null;
  moved: number;
}

/**
 * Producto creado al resolver una línea de ticket con su propio texto: no viene del catálogo y se
 * llama como el ticket («PECHUGA FAMILIAR», «CARACOLA PASAS» para «CARACOLA PASAS 10%»). Los que
 * alguien creó con otro nombre a propósito no cuentan y nunca se fusionan.
 */
function isFromTicket(product: Pick<Product, "sku" | "name">, alias: string): boolean {
  if (!product.sku.startsWith("custom-")) return false;
  const name = cleanProductName(product.name);
  const text = cleanProductName(alias);
  return Boolean(name) && (text === name || text.startsWith(`${name} `));
}

/** Equivalencias «texto del ticket → producto del almacén». */
export class EquivalencesApi extends TicketsApi {
  /** A qué producto va cada línea antes de guardar (para revisarlo y cambiarlo). */
  async matchTicketItems(items: TicketItem[]): Promise<MatchedItem[]> {
    const [products, aliases] = await Promise.all([this.db.list("products"), this.db.list("name_aliases")]);
    return items.map((item) => {
      if (item.skip) return { ...item, productId: null, productName: null, source: null };
      const chosen = item.productId ? products.find((product) => product.id === item.productId) : undefined;
      const match = chosen
        ? { product: chosen, source: "alias" as const }
        : matchLine(item.description, products, aliases);
      return {
        ...item,
        productId: match?.product.id ?? null,
        productName: match?.product.name ?? null,
        source: match?.source ?? null,
      };
    });
  }

  /**
   * Las equivalencias que ha guardado el hogar. Si un mismo texto quedó repetido (versiones
   * anteriores), se deja una sola.
   */
  async equivalences(): Promise<Equivalence[]> {
    const [aliases, products] = await Promise.all([this.db.list("name_aliases"), this.db.list("products")]);
    const byId = new Map(products.map((product) => [product.id, product]));
    // Sugerencias solo entre productos del catálogo (no entre los creados desde tickets).
    const catalog = products.filter((product) => !product.sku.startsWith("custom-"));
    const seen = new Set<string>();
    const repeated: string[] = [];
    const result: Equivalence[] = [];
    for (const alias of [...aliases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const key = cleanProductName(alias.alias);
      if (seen.has(key)) {
        repeated.push(alias.id);
        continue;
      }
      seen.add(key);
      const product = byId.get(alias.productId);
      if (!product) continue;
      const fromTicket = isFromTicket(product, alias.alias);
      const suggested = fromTicket ? matchLine(alias.alias, catalog)?.product : undefined;
      result.push({
        id: alias.id,
        alias: alias.alias,
        productId: product.id,
        productName: product.name,
        fromTicket,
        suggestion: suggested ? { productId: suggested.id, productName: suggested.name } : null,
      });
    }
    if (repeated.length) await this.db.remove("name_aliases", repeated);
    return result.sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  }

  /** Las equivalencias de serie (se pueden sustituir guardando otra con el mismo texto). */
  defaultEquivalences(): { alias: string; productName: string }[] {
    return Object.entries(DEFAULT_EQUIVALENCES)
      .map(([alias, productName]) => ({ alias: alias.toUpperCase(), productName }))
      .sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  }

  /**
   * Crea o cambia la equivalencia de un texto de ticket. Si apuntaba a un producto creado con el
   * texto del ticket, ese producto se integra en el elegido (ver mergeProduct).
   */
  async setEquivalence(alias: string, productId: string): Promise<MergeResult> {
    if (!cleanProductName(alias)) throw new ApiError("Escribe el texto tal como sale en el ticket.");
    if (!(await this.db.get("products", productId))) throw new ApiError("Ese producto ya no existe.", 404);
    return this.atomically((tx) => tx.setEquivalenceSteps(alias, productId));
  }

  protected async setEquivalenceSteps(alias: string, productId: string): Promise<MergeResult> {
    const aliases = await this.db.list("name_aliases");
    const key = cleanProductName(alias);
    const previousId = aliases.find((item) => cleanProductName(item.alias) === key)?.productId ?? null;
    await this.rememberEquivalence(alias, productId, aliases);
    if (!previousId || previousId === productId) return { merged: null, moved: 0 };
    const previous = await this.db.get("products", previousId);
    if (!previous || !isFromTicket(previous, alias)) return { merged: null, moved: 0 };
    return this.mergeProduct(previous, productId, aliases);
  }

  /**
   * Integra un producto creado desde un ticket en el producto del almacén elegido: suma sus
   * existencias y pasa sus caducidades, precios, historial (previsiones), revisiones, equivalencias
   * y líneas de tickets; después lo borra. Va dentro de la misma transacción que el cambio.
   */
  protected async mergeProduct(
    old: Product,
    targetId: string,
    aliases: { id: string; productId: string }[],
  ): Promise<MergeResult> {
    const target = await this.db.get("products", targetId);
    if (!target) throw new ApiError("Ese producto ya no existe.", 404);
    const moved = old.currentStock;
    const patch: Partial<Product> = { updatedAt: now() };
    if (moved) {
      patch.currentStock = Math.round((target.currentStock + moved) * 1000) / 1000;
      patch.confirmedAt = now();
    }
    if (old.minimumStock > target.minimumStock) patch.minimumStock = old.minimumStock;
    await this.db.update("products", target.id, patch);

    const [lots, prices, events, reviews, tickets] = await Promise.all([
      this.db.listBy("inventory_lots", "productId", old.id),
      this.db.listBy("prices", "productId", old.id),
      this.db.listBy("stock_events", "productId", old.id),
      this.db.listBy("ticket_reviews", "productId", old.id),
      this.db.list("tickets"),
    ]);
    for (const lot of lots)
      await this.db.update("inventory_lots", lot.id, { productId: target.id, productName: target.name });
    for (const price of prices)
      await this.db.update("prices", price.id, {
        productId: target.id,
        productName: target.name,
        category: target.category,
      });
    for (const event of events) await this.db.update("stock_events", event.id, { productId: target.id });
    for (const review of reviews) await this.db.update("ticket_reviews", review.id, { productId: target.id });
    for (const alias of aliases.filter((item) => item.productId === old.id)) {
      await this.db.update("name_aliases", alias.id, { productId: target.id });
      alias.productId = target.id;
    }
    for (const ticket of tickets.filter((item) => item.items.some((line) => line.productId === old.id)))
      await this.db.update("tickets", ticket.id, {
        items: ticket.items.map((line) => (line.productId === old.id ? { ...line, productId: target.id } : line)),
      });
    await this.db.remove("products", [old.id]);
    return { merged: old.name, moved };
  }

  async removeEquivalence(id: string): Promise<void> {
    await this.db.remove("name_aliases", [id]);
  }
}
