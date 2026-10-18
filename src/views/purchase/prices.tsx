import { similarNames } from "../../domain/matching";
import { canonicalStore, type StoreName } from "../../domain/stores";
import type { ListItem, PriceRef } from "../../data/types";
import { formatCents, normalize } from "../../lib/text";

/**
 * Último precio pagado de un artículo. Con un supermercado elegido (Menú → Precios), primero el de
 * ese súper; si allí aún no se ha comprado, el último pagado en cualquier otro.
 */
export function priceFor(item: ListItem, prices: PriceRef[], preferredStore = ""): PriceRef | undefined {
  const atPreferred = (price: PriceRef) => Boolean(preferredStore) && canonicalStore(price.merchant) === preferredStore;
  return prices
    .filter(
      (price) => normalize(price.productName) === normalize(item.name) || similarNames(price.productName, item.name),
    )
    .sort((a, b) => Number(atPreferred(b)) - Number(atPreferred(a)) || b.observedAt.localeCompare(a.observedAt))[0];
}

const BADGES: Record<StoreName, string> = {
  Mercadona: "M",
  DIA: "D",
  Lidl: "L",
  Aldi: "A",
  Eroski: "E",
  Consum: "Co",
  Carrefour: "C",
  Supeco: "S",
  Jurado: "J",
  Alcampo: "Al",
};

export function merchantBadge(price: PriceRef): string {
  const store = canonicalStore(price.merchant);
  return store ? BADGES[store] : price.merchant.slice(0, 1).toUpperCase() || "€";
}

/** El precio del súper elegido se ve destacado; el de otro súper, más apagado. */
export function PriceTag({
  price,
  quantity,
  preferredStore = "",
}: {
  price: PriceRef;
  quantity: number;
  preferredStore?: string;
}) {
  const other = Boolean(preferredStore) && canonicalStore(price.merchant) !== preferredStore;
  return (
    <span
      className={`ml-1 text-xs font-semibold ${other ? "text-muted-foreground" : "text-primary"}`}
      title={`Último precio en ${price.merchant}`}
    >
      <b className="mr-0.5 rounded bg-current/10 px-1 text-xs">{merchantBadge(price)}</b>≈{" "}
      {formatCents(price.priceCents * quantity)}
    </span>
  );
}
