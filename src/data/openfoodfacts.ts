import type { BarcodeProduct } from "./types";

interface OffProduct {
  product_name_es?: string;
  product_name?: string;
  generic_name_es?: string;
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

/** Consulta Open Food Facts (base de datos abierta, sin clave). Devuelve null si no lo conoce. */
export async function lookupOpenFoodFacts(code: string, fetcher: typeof fetch = fetch): Promise<BarcodeProduct | null> {
  const fields =
    "product_name,product_name_es,generic_name_es,brands,quantity,image_front_small_url,image_small_url,allergens_tags,nutriments";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: number; product?: OffProduct };
    const product = body.product;
    const name = product?.product_name_es || product?.product_name || product?.generic_name_es;
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
      source: "Open Food Facts · valores por 100 g",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
