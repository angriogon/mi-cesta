/**
 * Interpretación de lo que lee el escáner (o se escribe a mano) en cualquier supermercado:
 * EAN-13/EAN-8 y UPC de los envases, ITF-14 de los packs, etiquetas de la balanza (prefijo 2),
 * GS1 DataBar y GS1-128 con sus datos (peso, precio) y los QR GS1 Digital Link.
 */

export type CodeKind = "producto" | "peso-variable" | "interno";

export interface ParsedCode {
  /** Código con el que se busca el producto (GTIN-13 o GTIN-8 si lo es). */
  code: string;
  /** Otras formas del mismo código: UPC sin el 0, la unidad de un pack ITF-14… */
  alternatives: string[];
  kind: CodeKind;
  /**
   * Etiquetas de la balanza (fruta, carne, charcutería…): el artículo sin el importe ni el peso,
   * para reconocerlo aunque cada etiqueta lleve un precio distinto.
   */
  itemKey?: string;
  /** Datos GS1 que vienen en el propio código (DataBar, GS1-128). */
  weightGrams?: number;
  priceCents?: number;
}

const digitsOnly = (value: string) => /^\d+$/.test(value);

/** Dígito de control GS1 (EAN-8, UPC-A, EAN-13, ITF-14) del cuerpo sin ese dígito. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - i;
    sum += Number(body[i]) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  if (!digitsOnly(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** UPC-E (8 dígitos) a UPC-A (12), según la regla del último dígito del cuerpo. */
export function expandUpcE(code: string): string {
  const [system, d1, d2, d3, d4, d5, last, check] = code.split("");
  const body =
    last <= "2"
      ? `${d1}${d2}${last}0000${d3}${d4}${d5}`
      : last === "3"
        ? `${d1}${d2}${d3}00000${d4}${d5}`
        : last === "4"
          ? `${d1}${d2}${d3}${d4}00000${d5}`
          : `${d1}${d2}${d3}${d4}${d5}0000${last}`;
  return `${system}${body}${check}`;
}

/** GTIN-14 de un pack a GTIN-13 (si el indicador es 0 es el mismo; si no, la unidad que contiene). */
function fromGtin14(code: string): { code: string; alternatives: string[] } {
  if (code.startsWith("0")) return { code: code.slice(1), alternatives: [code] };
  const unitBody = code.slice(1, 13);
  return { code: `${unitBody}${gtinCheckDigit(unitBody)}`, alternatives: [code] };
}

/** Datos de una cadena GS1 en formato legible: «(01)08412345678905(3103)000500». */
function parseGs1(text: string): Map<string, string> | null {
  if (!text.startsWith("(")) return null;
  const fields = new Map<string, string>();
  for (const match of text.matchAll(/\((\d{2,4})\)([^(]*)/g)) fields.set(match[1], match[2]);
  return fields.size ? fields : null;
}

/** Peso (310n, kg con n decimales) y precio (392n, con n decimales) de una cadena GS1. */
function gs1Amounts(fields: Map<string, string>): Pick<ParsedCode, "weightGrams" | "priceCents"> {
  const amounts: Pick<ParsedCode, "weightGrams" | "priceCents"> = {};
  for (const [ai, value] of fields) {
    const decimals = Number(ai[3]);
    if (ai.startsWith("310")) amounts.weightGrams = Math.round((Number(value) / 10 ** decimals) * 1000);
    if (ai.startsWith("392")) amounts.priceCents = Math.round((Number(value) / 10 ** decimals) * 100);
  }
  return amounts;
}

function fromGtin(gtin: string, extra: Pick<ParsedCode, "weightGrams" | "priceCents"> = {}): ParsedCode | null {
  if (!isValidGtin(gtin)) return null;
  if (gtin.length === 14) {
    const { code, alternatives } = fromGtin14(gtin);
    const unit = fromGtin(code, extra);
    return unit && { ...unit, alternatives: [...unit.alternatives, ...alternatives] };
  }
  if (gtin.length === 12) return { code: `0${gtin}`, alternatives: [gtin], kind: "producto", ...extra };
  // Prefijos 20-29 en EAN-13: etiqueta de la balanza o de uso interno del supermercado. El artículo
  // va en los 7 primeros dígitos; los 5 siguientes son el importe o el peso, que cambian cada vez.
  if (gtin.length === 13 && gtin.startsWith("2"))
    return { code: gtin, alternatives: [], kind: "peso-variable", itemKey: `peso:${gtin.slice(0, 7)}`, ...extra };
  // EAN-8 que empiezan por 0 o 2: códigos internos de la cadena (Lidl, Aldi…).
  const kind = gtin.length === 8 && /^[02]/.test(gtin) ? "interno" : "producto";
  // Un UPC leído como EAN-13 («0» delante) también se busca en su forma de 12 dígitos.
  const alternatives = gtin.length === 13 && gtin.startsWith("0") ? [gtin.slice(1)] : [];
  return { code: gtin, alternatives, kind, ...extra };
}

/**
 * Interpreta un código leído (con su formato, si lo da el escáner) o escrito a mano.
 * Devuelve null si no es un código de producto válido (dígito de control incorrecto, QR ajeno…).
 */
export function parseScannedCode(raw: string, format = ""): ParsedCode | null {
  const text = raw.trim();
  if (!text) return null;

  // QR GS1 Digital Link: https://…/01/08412345678905…
  const link = /\/01\/(\d{8,14})(?:[/?#]|$)/.exec(text);
  if (link) return fromGtin(link[1]);
  if (format.startsWith("QR")) return null;

  // GS1 DataBar y GS1-128: (01) GTIN y, a veces, peso o precio.
  const gs1 = parseGs1(text);
  if (gs1) {
    const gtin = gs1.get("01");
    return gtin ? fromGtin(gtin, gs1Amounts(gs1)) : null;
  }

  const digits = text.replace(/[\s-]/g, "");
  if (!digitsOnly(digits)) return null;
  if (format === "UPCE" && digits.length === 8) {
    const upcA = expandUpcE(digits);
    const parsed = fromGtin(upcA);
    return parsed && { ...parsed, alternatives: [...parsed.alternatives, digits] };
  }
  if ([8, 12, 13, 14].includes(digits.length)) return fromGtin(digits);
  // Códigos internos sin dígito de control GS1 (Code 128 de algunas cadenas, o escritos a mano).
  if (digits.length >= 8 && digits.length <= 18 && (!format || format.startsWith("Code128")))
    return { code: digits, alternatives: [], kind: "interno" };
  return null;
}

/** Todas las formas de un código con las que se puede buscar, sin repetir. */
export const lookupCodes = (parsed: ParsedCode) => [...new Set([parsed.code, ...parsed.alternatives])];
