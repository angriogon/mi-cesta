import type { BarcodeProduct } from "./types";

interface OffProduct {
  product_name_es?: string;
  product_name?: string;
  generic_name_es?: string;
  generic_name?: string;
  product_name_en?: string;
  product_name_fr?: string;
  product_name_de?: string;
  product_name_it?: string;
  product_name_pt?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  allergens_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

const ALLERGENS: Record<string, string> = {
  gluten: "gluten",
  milk: "leche",
  eggs: "huevo",
  nuts: "frutos secos",
  peanuts: "cacahuete",
  soybeans: "soja",
  fish: "pescado",
  crustaceans: "crustáceos",
  molluscs: "moluscos",
  celery: "apio",
  mustard: "mostaza",
  "sesame-seeds": "sésamo",
  "sulphur-dioxide-and-sulphites": "sulfitos",
  lupin: "altramuces",
};

const number = (value: number | string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Bases abiertas del proyecto Open Food Facts (sin clave): alimentación y, para lo que no es comida,
 * limpieza y hogar, cosmética e higiene y comida de mascotas. Todas comparten el mismo formato.
 */
export const OPEN_FACTS = [
  { host: "world.openfoodfacts.org", source: "Open Food Facts · valores por 100 g" },
  { host: "world.openproductsfacts.org", source: "Open Products Facts" },
  { host: "world.openbeautyfacts.org", source: "Open Beauty Facts" },
  { host: "world.openpetfoodfacts.org", source: "Open Pet Food Facts" },
] as const;

const FIELDS = [
  "product_name_es",
  "product_name",
  "generic_name_es",
  "generic_name",
  "product_name_en",
  "product_name_fr",
  "product_name_de",
  "product_name_it",
  "product_name_pt",
  "brands",
  "quantity",
  "image_front_small_url",
  "image_small_url",
  "allergens_tags",
  "nutriments",
].join(",");

/** El nombre en español si lo hay; si no, el de la etiqueta en otro idioma (marcas de Lidl o Aldi). */
const productName = (product: OffProduct) =>
  product.product_name_es ||
  product.product_name ||
  product.generic_name_es ||
  product.generic_name ||
  product.product_name_en ||
  product.product_name_fr ||
  product.product_name_de ||
  product.product_name_it ||
  product.product_name_pt;

/** Consulta Open Food Facts (u otra de sus bases). Devuelve null si no lo conoce. */
export async function lookupOpenFoodFacts(
  code: string,
  fetcher: typeof fetch = fetch,
  database: (typeof OPEN_FACTS)[number] = OPEN_FACTS[0],
): Promise<BarcodeProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`https://${database.host}/api/v2/product/${code}.json?fields=${FIELDS}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: number; product?: OffProduct };
    const product = body.product;
    const name = product && productName(product);
    if (!body.status || !product || !name) return null;
    const n = product.nutriments ?? {};
    return {
      code,
      name: name.trim(),
      brand: (product.brands ?? "").split(",")[0]?.trim() ?? "",
      quantity: product.quantity ?? "",
      image: product.image_front_small_url || product.image_small_url || null,
      allergens: (product.allergens_tags ?? [])
        .map((tag) => ALLERGENS[tag.replace(/^en:/, "")] ?? null)
        .filter((value): value is string => Boolean(value)),
      nutrients: {
        kcal: number(n["energy-kcal_100g"]),
        protein: number(n.proteins_100g),
        carbs: number(n.carbohydrates_100g),
        fat: number(n.fat_100g),
        fiber: number(n.fiber_100g),
      },
      source: database.source,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca el producto con cada forma de su código: primero en Open Food Facts y, si no lo conoce,
 * en las otras bases a la vez (limpieza, cosmética, mascotas). Devuelve el primero que aparezca.
 */
export async function lookupOpenFacts(codes: string[], fetcher: typeof fetch = fetch): Promise<BarcodeProduct | null> {
  for (const code of codes) {
    const food = await lookupOpenFoodFacts(code, fetcher);
    if (food) return food;
  }
  const others = await Promise.all(
    OPEN_FACTS.slice(1).flatMap((database) => codes.map((code) => lookupOpenFoodFacts(code, fetcher, database))),
  );
  return others.find(Boolean) ?? null;
}
