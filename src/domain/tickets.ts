import type { PriceRef, TicketItem } from "../data/types";
import { todayIso } from "../lib/text";
import { cleanProductName, similarNames } from "./matching";

const AMOUNT = /(\d{1,4}[.,]\d{2})\s*€?\s*[AB]?\s*$/;
const NOT_A_PRODUCT =
  /\b(total|subtotal|iva|base imponible|cuota|tarjeta|efectivo|cambio|importe|a pagar|entregado|descuento total|n\.?\s*operaci|factura|nif|cif|tel[eé]fono|gracias)\b/i;

export interface ParsedTicket {
  purchasedAt: string;
  total: string;
  merchant: string | null;
  items: TicketItem[];
}

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

/**
 * Interpreta el texto reconocido por OCR. Soporta el formato de Mercadona
 * ("2 LECHE ENTERA 1,79 3,58"), el de importe por línea y líneas de peso ("0,754 kg x 1,99 €/kg 1,50").
 */
export function parseTicketText(text: string, now = new Date()): ParsedTicket {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const totalLine =
    [...lines]
      .reverse()
      .find((line) => /\b(total|importe|a pagar)\b/i.test(line) && !/subtotal/i.test(line) && AMOUNT.test(line)) ??
    [...lines].reverse().find((line) => AMOUNT.test(line));
  const totalMatch = totalLine?.match(AMOUNT);

  const dateMatch = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  let purchasedAt = todayIso(now);
  if (dateMatch) {
    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      purchasedAt = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const merchant = /mercadona/i.test(text)
    ? "Mercadona"
    : /carrefour/i.test(text)
      ? "Carrefour"
      : /\blidl\b/i.test(text)
        ? "Lidl"
        : /\bdia\b/i.test(text)
          ? "Dia"
          : /alcampo/i.test(text)
            ? "Alcampo"
            : /eroski/i.test(text)
              ? "Eroski"
              : null;

  const items: TicketItem[] = [];
  // Mercadona escribe los productos al peso en dos líneas: el nombre sin importe y debajo el peso.
  let pendingName: string | null = null;
  for (const line of lines) {
    if (NOT_A_PRODUCT.test(line)) {
      pendingName = null;
      continue;
    }
    const amount = line.match(AMOUNT);
    if (!amount) {
      const name = line.replace(/^\d{1,3}\s+/, "").trim();
      pendingName = /[a-záéíóúñ]{3}/i.test(name) && !/\d+[.,]\d+\s*kg/i.test(name) ? name : null;
      continue;
    }
    const lineTotalCents = Math.round(parseAmount(amount[1]) * 100);
    let description = line.slice(0, amount.index).trim();
    let quantity = 1;

    // Línea de peso: "0,754 kg 1,99 €/kg 1,50".
    const weight = description.match(/^(\d+[.,]\d+)\s*kg\b/i);
    if (weight) {
      if (pendingName) {
        items.push({
          description: pendingName,
          quantity: Math.round(parseAmount(weight[1]) * 1000) / 1000,
          lineTotalCents,
        });
      }
      pendingName = null;
      continue;
    }
    pendingName = null;

    // "2 LECHE ENTERA 1,79" → cantidad 2 y precio unitario; el importe final es el último número.
    const leadingQty = description.match(/^(\d{1,3})\s*[xX*]?\s+(?=\D)/);
    if (leadingQty) {
      quantity = Number(leadingQty[1]) || 1;
      description = description.slice(leadingQty[0].length);
    }
    description = description.replace(/\s+\d{1,4}[.,]\d{2}\s*€?$/, "").trim();
    if (description.replace(/[^a-záéíóúñ]/gi, "").length < 2) continue;

    items.push({ description, quantity, lineTotalCents });
  }

  return {
    purchasedAt,
    total: totalMatch ? parseAmount(totalMatch[1]).toFixed(2) : "",
    merchant,
    items: items.slice(0, 80),
  };
}

/** Señala posibles duplicados y precios muy distintos a los habituales antes de guardar. */
export function reviewTicketLines(items: TicketItem[], prices: Pick<PriceRef, "productName" | "priceCents">[]) {
  const duplicates = items.filter(
    (item, index) =>
      items.findIndex((other) => cleanProductName(other.description) === cleanProductName(item.description)) !== index,
  );
  const unexpected = items.flatMap((item) => {
    const reference = prices.find((price) => similarNames(price.productName, item.description));
    if (!reference?.priceCents || !item.quantity) return [];
    const unit = item.lineTotalCents / item.quantity;
    return Math.abs(unit - reference.priceCents) / reference.priceCents >= 0.6
      ? [{ name: item.description, current: unit }]
      : [];
  });
  return { duplicates, unexpected };
}

/** Compara la compra planificada con las líneas del ticket. */
export function compareWithPlan(planned: { name: string }[], items: TicketItem[]) {
  if (!planned.length || !items.length) return null;
  const found = planned.filter((plan) => items.some((item) => similarNames(plan.name, item.description)));
  return { planned: planned.length, found: found.length, missing: planned.length - found.length };
}
