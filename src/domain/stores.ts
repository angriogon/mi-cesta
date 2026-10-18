import { normalizeWords } from "../lib/text";

/** Marcas propias de cada cadena, para indicar de qué supermercado es un producto escaneado. */
const STORE_BRANDS: Record<string, string[]> = {
  Mercadona: ["hacendado", "deliplus", "bosque verde", "compy", "solcare"],
  DIA: ["dia", "delicious dia", "bonte"],
  Lidl: [
    "lidl",
    "milbona",
    "pilos",
    "solevita",
    "freeway",
    "crownfield",
    "cien",
    "w5",
    "deluxe",
    "chef select",
    "alesto",
    "fin carre",
    "snack day",
    "vitasia",
    "italiamo",
    "belbake",
    "combino",
    "baresa",
    "dulano",
    "lupilu",
  ],
  Aldi: ["aldi", "milsani", "gutbio", "moser roth", "choceur", "golden bridge", "tandil", "lacura", "mamia", "lyttos"],
  Eroski: ["eroski", "eroski basic", "seleqtia", "belle"],
  Consum: ["consum"],
  "Carrefour o Supeco": ["carrefour", "carrefour bio", "carrefour classic", "carrefour extra", "carrefour discount"],
  Alcampo: ["auchan", "alcampo", "producto alcampo"],
};

const BY_BRAND = new Map(
  Object.entries(STORE_BRANDS).flatMap(([store, brands]) =>
    brands.map((brand) => [normalizeWords(brand), store] as const),
  ),
);

/** Cadena a la que pertenece una marca propia («Hacendado» → Mercadona), o null si no es de ninguna. */
export function storeForBrand(brand: string): string | null {
  const key = normalizeWords(brand);
  if (!key) return null;
  return BY_BRAND.get(key) ?? BY_BRAND.get(key.split(" ")[0]) ?? null;
}

/** Supermercados que se pueden elegir para ver sus precios en la compra. */
export const STORES = [
  "Mercadona",
  "DIA",
  "Lidl",
  "Aldi",
  "Eroski",
  "Consum",
  "Carrefour",
  "Supeco",
  "Jurado",
  "Alcampo",
] as const;
export type StoreName = (typeof STORES)[number];

/** Cómo aparece cada cadena en un ticket o en el comercio guardado. Supeco antes que Carrefour (es del grupo). */
const STORE_PATTERNS: [StoreName, RegExp][] = [
  ["Mercadona", /mercadona/],
  ["Supeco", /supeco/],
  ["Carrefour", /carrefour/],
  ["Lidl", /\blidl\b/],
  ["Aldi", /\baldi\b/],
  ["DIA", /\bdia\b/],
  ["Alcampo", /alcampo|auchan/],
  ["Eroski", /eroski/],
  ["Consum", /\bconsum\b/],
  ["Jurado", /jurado/],
];

/** Cadena de un comercio («MERCADONA S.A.» → Mercadona, «Dia» → DIA), o null si no es ninguna conocida. */
export function canonicalStore(merchant: string): StoreName | null {
  const text = normalizeWords(merchant);
  return STORE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
