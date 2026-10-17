import { normalize } from "../lib/text";

/** Limpia una línea de ticket o un nombre de producto para poder compararlos. */
export function cleanProductName(value: string): string {
  return normalize(value)
    .replace(/\b(hacendado|carrefour|classic|bio|extra|pack|envase|bote|lata|deliplus|bosque verde)\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|ud|uds|u)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FAMILIES: Record<string, string[]> = {
  tomate: ["tomate frito", "tomate triturado", "tomate natural", "tomates"],
  atun: ["atun", "bonito", "lata de atun"],
  leche: ["leche entera", "leche semidesnatada", "leche desnatada"],
  pan: ["pan de molde", "barra de pan", "baguette"],
  pollo: ["pechuga de pollo", "muslo de pollo", "pollo asado"],
  yogur: ["yogur", "yogurt"],
};

function family(value: string): string {
  const clean = cleanProductName(value);
  for (const [key, members] of Object.entries(FAMILIES)) {
    if ([key, ...members].some((member) => {
      const m = cleanProductName(member);
      return clean === m || clean.includes(m) || m.includes(clean);
    }))
      return key;
  }
  return clean;
}

/** Comparación flexible usada en tickets y compras planificadas (familia de producto). */
export function similarNames(a: string, b: string): boolean {
  const x = family(a);
  const y = family(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

function tokens(value: string): string[] {
  return cleanProductName(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

/**
 * Puntúa lo bien que una línea encaja con un producto (0-1).
 * Exacto = 1; contenido = 0,9; si no, proporción de palabras compartidas.
 */
export function nameScore(line: string, productName: string): number {
  const a = cleanProductName(line);
  const b = cleanProductName(productName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) return 0.9;
  const ta = tokens(line);
  const tb = new Set(tokens(productName));
  if (!ta.length || !tb.size) return 0;
  const shared = ta.filter((token) => tb.has(token) || [...tb].some((other) => other.startsWith(token) || token.startsWith(other)));
  return shared.length / Math.max(ta.length, tb.size);
}

export interface Matchable {
  id: string;
  name: string;
}

/** Busca el producto que mejor encaja con una línea, teniendo en cuenta los alias aprendidos. */
export function findProduct<T extends Matchable>(
  line: string,
  products: T[],
  aliases: { alias: string; productId: string }[] = [],
  threshold = 0.6,
): T | null {
  const key = cleanProductName(line);
  const alias = aliases.find((item) => cleanProductName(item.alias) === key);
  if (alias) {
    const product = products.find((item) => item.id === alias.productId);
    if (product) return product;
  }
  let best: T | null = null;
  let bestScore = 0;
  for (const product of products) {
    const score = nameScore(line, product.name);
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore >= threshold ? best : null;
}
