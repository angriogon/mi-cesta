import type { PriceRef, TicketItem } from "../data/types";
import { todayIso } from "../lib/text";
import { cleanProductName, similarNames } from "./matching";

/** Importe al final de la línea; tolera restos del borde que añade el lector («2,65 E», «1,70 |», «0,755»). */
const AMOUNT = /(\d{1,4}[.,]\d{2})\d?\s*[^\d\s]{0,3}\s*$/;
/** Importe sin coma, separado en la columna de importes («LIMPIAMUEBLE PARQUET      200»). */
const AMOUNT_NO_COMMA = /\s{3,}(\d{3})\s*[^\d\s]{0,3}\s*$/;
const AMOUNTS = /\d{1,4}[.,]\d{2}/g;
const WEIGHT = /(\d{1,3}[.,]\d{3})\s*kg\s+(\d{1,3}[.,]\d{2})\s*€?\s*\/\s*kg(?:\s+(\d{1,4}[.,]\d{1,2}))?/i;
const NOT_A_PRODUCT =
  /\b(total|subtotal|iva|base imponible|cuota|tarjeta|efectivo|cambio|importe|a pagar|entregado|descuento total|n\.?\s*operaci|factura|nif|cif|tel[eé]fono|gracias|descripci[oó]n|p\.?\s*unit)\b/i;
/** A partir de aquí ya no hay productos: totales, forma de pago e impuestos. */
const END_OF_ITEMS = /^\W*(total\b|tarjeta|efectivo|iva\b|base imponible|entregado|a pagar)/i;
const TOTAL_HINT = /\b(total|importe|a pagar|tarjeta)\b/i;
/** Un «1» leído como barra, ele o i mayúscula al principio de la línea. */
const ONE_LOOKALIKE = /^[|lI!]$/;

export interface ParsedTicket {
  purchasedAt: string;
  total: string;
  merchant: string | null;
  items: TicketItem[];
}

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

const cents = (value: number) => Math.round(value * 100);

/**
 * Quita los restos que el lector suele añadir en los bordes del papel: símbolos o letras sueltas
 * al principio («$ 1 JAMÓN», «Y 1 PECHUGA», «9 | PECHUGA») y al final («MANGO N», «Pota :»).
 * Devuelve la cantidad inicial si la hay (un «|» inicial cuenta como 1).
 */
function splitQuantity(text: string): { quantity: number | null; name: string } {
  const tokens = text.split(" ").filter(Boolean);
  // Restos al final: tokens de 1–2 caracteres que no son letras de palabra («N», «:», «|», «e»).
  while (tokens.length > 1 && /^[^\p{L}\d%]{1,2}$|^\p{L}$/u.test(tokens[tokens.length - 1])) tokens.pop();
  let quantity: number | null = null;
  // Símbolos o letras sueltas delante («E 1 24 HUEVOS»), salvo un «|» que hace de «1» («| PECHUGA»).
  while (
    tokens.length > 2 &&
    /^([^\p{L}\d]{1,2}|\p{L})$/u.test(tokens[0]) &&
    !(ONE_LOOKALIKE.test(tokens[0]) && /\p{L}{2}/u.test(tokens[1]))
  )
    tokens.shift();
  // «1 24 HUEVOS»: el primer número es la cantidad y el segundo, parte del nombre; en «2 1 REGAÑA» el «2» es ruido.
  if (
    /^\d{1,2}$/.test(tokens[0] ?? "") &&
    /^\d{1,3}$/.test(tokens[1] ?? "") &&
    tokens[1] !== "1" &&
    /\p{L}/u.test(tokens[2] ?? "")
  ) {
    quantity = Number(tokens[0]);
    tokens.shift();
    return { quantity, name: tokens.join(" ").replace(/[\s.,:;]+$/, "") };
  }
  // Busca una cantidad entre los dos primeros tokens; lo anterior es ruido del borde.
  for (let i = 0; i < Math.min(3, tokens.length - 1); i++) {
    const token = tokens[i];
    if (/^\d{1,3}$/.test(token) && /\p{L}/u.test(tokens[i + 1] ?? "")) {
      quantity = Number(token);
      tokens.splice(0, i + 1);
      break;
    }
    if (ONE_LOOKALIKE.test(token) && /\p{L}{2}/u.test(tokens[i + 1] ?? "")) {
      quantity = 1;
      tokens.splice(0, i + 1);
      break;
    }
    // Solo se salta ruido: símbolos, una letra suelta o un número pegado a un punto («1.»).
    if (!/^([^\p{L}\d]{1,2}|\p{L}|\d{1,2}\.?)$/u.test(token)) break;
  }
  if (quantity === null) {
    while (tokens.length > 1 && /^([^\p{L}\d]{1,2}|\p{L})$/u.test(tokens[0])) tokens.shift();
  }
  return { quantity, name: tokens.join(" ").replace(/[\s.,:;]+$/, "") };
}

function looksLikeName(name: string) {
  return (name.match(/\p{L}/gu) ?? []).length >= 3;
}

function findDate(text: string, now: Date) {
  const match = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!match) return todayIso(now);
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return todayIso(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findMerchant(text: string) {
  if (/mercadona/i.test(text)) return "Mercadona";
  if (/carrefour/i.test(text)) return "Carrefour";
  if (/\blidl\b/i.test(text)) return "Lidl";
  if (/\bdia\b/i.test(text)) return "Dia";
  if (/alcampo/i.test(text)) return "Alcampo";
  if (/eroski/i.test(text)) return "Eroski";
  return null;
}

/**
 * El total: de las líneas que lo parecen («TOTAL», «TARJETA», «Importe»), el importe que más se acerca a la
 * suma de las líneas; el lector a veces confunde un dígito en una de ellas pero no en todas.
 * Se ignoran las líneas de impuestos, que llevan varias cantidades.
 */
function findTotal(lines: string[], itemsCents: number): string {
  const candidates = lines
    .filter((line) => TOTAL_HINT.test(line) && !/subtotal|base|cuota|iva/i.test(line))
    .filter((line) => (line.match(AMOUNTS) ?? []).length === 1)
    .map((line) => cents(parseAmount(line.match(AMOUNTS)![0])));
  if (candidates.length) {
    const best = itemsCents
      ? candidates.reduce((a, b) => (Math.abs(b - itemsCents) < Math.abs(a - itemsCents) ? b : a))
      : candidates[candidates.length - 1];
    return (best / 100).toFixed(2);
  }
  if (itemsCents) return (itemsCents / 100).toFixed(2);
  const last = [...lines].reverse().find((line) => AMOUNT.test(line));
  return last ? parseAmount(last.match(AMOUNT)![1]).toFixed(2) : "";
}

/**
 * Interpreta el texto reconocido por OCR. Soporta el formato de Mercadona
 * ("2 LECHE ENTERA 1,79 3,58"), el de importe por línea y líneas de peso ("0,754 kg 1,99 €/kg 1,50"),
 * con el ruido típico de una foto (restos del borde, un «1» leído como «|», importes sin coma).
 */
export function parseTicketText(text: string, now = new Date()): ParsedTicket {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Para los importes sin coma importa la separación de columnas, que se pierde al juntar espacios.
  const rawLines = text.split(/\r?\n/).filter((line) => line.trim());

  const items: TicketItem[] = [];
  // Mercadona escribe los productos al peso en dos líneas: el nombre sin importe y debajo el peso.
  let pendingName: string | null = null;
  for (const [index, line] of lines.entries()) {
    if (items.length && END_OF_ITEMS.test(line)) break;

    const weight = line.match(WEIGHT);
    if (weight) {
      const kg = parseAmount(weight[1]);
      const computed = cents(kg * parseAmount(weight[2]));
      const printed = weight[3] && /[.,]\d{2}$/.test(weight[3]) ? cents(parseAmount(weight[3])) : null;
      // Manda el importe impreso; peso × precio solo cubre un importe ilegible («6,9»).
      const lineTotalCents = printed ?? computed;
      if (pendingName) items.push({ description: pendingName, quantity: Math.round(kg * 1000) / 1000, lineTotalCents });
      pendingName = null;
      continue;
    }

    if (NOT_A_PRODUCT.test(line)) {
      pendingName = null;
      continue;
    }

    const amount = line.match(AMOUNT);
    const noComma = amount ? null : rawLines[index]?.match(AMOUNT_NO_COMMA);
    if (!amount && !noComma) {
      const { name } = splitQuantity(line);
      pendingName = looksLikeName(name) && !/\d+[.,]\d+\s*kg/i.test(name) ? name : null;
      continue;
    }
    pendingName = null;

    const lineTotalCents = amount ? cents(parseAmount(amount[1])) : Number(noComma![1]);
    const before = amount ? line.slice(0, amount.index).trim() : line.replace(/\s*\d{3}\s*[^\d\s]{0,3}\s*$/, "");
    // Precio unitario, si lo hay: «2 HUEVOS L 12 2,30 4,60».
    const unit = before.match(/\s(\d{1,4}[.,]\d{2})$/);
    const { quantity: read, name } = splitQuantity(unit ? before.slice(0, unit.index) : before);
    if (!looksLikeName(name)) continue;

    let quantity = read ?? 1;
    // Más de una unidad solo si el ticket trae precio unitario y cuadra; si no, es ruido del borde («81 SALTEADO»).
    if (quantity > 1 && !(unit && Math.abs(cents(parseAmount(unit[1])) * quantity - lineTotalCents) <= 2)) quantity = 1;

    items.push({ description: name, quantity, lineTotalCents });
  }

  const itemsCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return {
    purchasedAt: findDate(text, now),
    total: findTotal(lines, itemsCents),
    merchant: findMerchant(text),
    items: items.slice(0, 120),
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
