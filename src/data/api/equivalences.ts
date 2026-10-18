import { DEFAULT_EQUIVALENCES, matchLine, type MatchSource } from "../../domain/equivalences";
import { cleanProductName } from "../../domain/matching";
import type { TicketItem } from "../types";
import { TicketsApi } from "./tickets";
import { ApiError } from "./shared";

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

  /** Las equivalencias que ha guardado el hogar. */
  async equivalences(): Promise<Equivalence[]> {
    const [aliases, products] = await Promise.all([this.db.list("name_aliases"), this.db.list("products")]);
    const names = new Map(products.map((product) => [product.id, product.name]));
    return aliases
      .flatMap((alias) => {
        const productName = names.get(alias.productId);
        return productName ? [{ id: alias.id, alias: alias.alias, productId: alias.productId, productName }] : [];
      })
      .sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  }

  /** Las equivalencias de serie (se pueden sustituir guardando otra con el mismo texto). */
  defaultEquivalences(): { alias: string; productName: string }[] {
    return Object.entries(DEFAULT_EQUIVALENCES)
      .map(([alias, productName]) => ({ alias: alias.toUpperCase(), productName }))
      .sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  }

  /** Crea o cambia la equivalencia de un texto de ticket. */
  async setEquivalence(alias: string, productId: string): Promise<void> {
    if (!cleanProductName(alias)) throw new ApiError("Escribe el texto tal como sale en el ticket.");
    if (!(await this.db.get("products", productId))) throw new ApiError("Ese producto ya no existe.", 404);
    await this.rememberEquivalence(alias, productId, await this.db.list("name_aliases"));
  }

  async removeEquivalence(id: string): Promise<void> {
    await this.db.remove("name_aliases", [id]);
  }
}
