import { similarNames } from "../../domain/matching";
import type { ListItem, PriceRef } from "../../data/types";
import { formatCents, normalize } from "../../lib/text";

export function priceFor(item: ListItem, prices: PriceRef[]): PriceRef | undefined {
  return prices
    .filter(
      (price) => normalize(price.productName) === normalize(item.name) || similarNames(price.productName, item.name),
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
}

export function merchantTone(price: PriceRef): string {
  const merchant = normalize(price.merchant);
  if (merchant.includes("carrefour")) return "text-info";
  if (merchant.includes("mercadona") || merchant.includes("hacendado")) return "text-warning";
  return "text-primary";
}

export function merchantBadge(price: PriceRef): string {
  const merchant = normalize(price.merchant);
  if (merchant.includes("carrefour")) return "C";
  if (merchant.includes("mercadona")) return "M";
  return price.merchant.slice(0, 1).toUpperCase() || "€";
}

export function PriceTag({ price, quantity }: { price: PriceRef; quantity: number }) {
  return (
    <span className={`ml-1 text-xs font-semibold ${merchantTone(price)}`} title={`Último precio en ${price.merchant}`}>
      <b className="mr-0.5 rounded bg-current/10 px-1 text-xs">{merchantBadge(price)}</b>≈{" "}
      {formatCents(price.priceCents * quantity)}
    </span>
  );
}
