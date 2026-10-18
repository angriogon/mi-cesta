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
