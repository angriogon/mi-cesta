// Edge Function: precios de referencia de fruta y verdura de Mercadona segun el codigo postal.
// Usa la tienda online publica de Mercadona (sin API oficial): si cambia su formato, responde
// { prices: [] } y la app sigue funcionando con los precios aprendidos de los tickets.
// Despliegue: supabase functions deploy mercadona-prices

const BASE = "https://tienda.mercadona.es/api";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MercadonaProduct {
  display_name?: string;
  price_instructions?: {
    unit_price?: string;
    bulk_price?: string;
    reference_price?: string;
    reference_format?: string;
  };
}

interface MercadonaCategory {
  id: number;
  name: string;
  categories?: MercadonaCategory[];
  products?: MercadonaProduct[];
}

// Solo caracteres ASCII en el codigo: el despliegue no siempre conserva bien los literales acentuados.
function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

/** El almacen (wh) que abastece a un codigo postal determina los precios. */
async function warehouseFor(postalCode: string): Promise<string | null> {
  const response = await fetch(`${BASE}/postal-codes/actions/change-pc/`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new_postal_code: postalCode }),
    signal: AbortSignal.timeout(8000),
  });
  return response.headers.get("x-customer-wh");
}

function centsOf(product: MercadonaProduct): number {
  const price = product.price_instructions;
  const value = Number(price?.unit_price ?? price?.bulk_price ?? "");
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!request.headers.get("authorization"))
      return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
    const { postalCode, names } = (await request.json()) as { postalCode?: string; names?: string[] };
    if (!postalCode || !/^\d{5}$/.test(postalCode) || !Array.isArray(names)) {
      return Response.json({ error: "bad request" }, { status: 400, headers: CORS });
    }
    const wanted = names.slice(0, 200).map((name) => ({ name, key: normalize(name) }));
    const warehouse = await warehouseFor(postalCode).catch(() => null);
    const query = `?lang=es${warehouse ? `&wh=${encodeURIComponent(warehouse)}` : ""}`;
    const tree = await getJson<{ results: MercadonaCategory[] }>(`${BASE}/categories/${query}`);
    const fruitAndVeg = tree.results.find((category) => normalize(category.name).includes("fruta y verdura"));
    if (!fruitAndVeg) return Response.json({ prices: [] }, { headers: CORS });

    const catalog: { key: string; cents: number }[] = [];
    for (const child of fruitAndVeg.categories ?? []) {
      const detail = await getJson<MercadonaCategory>(`${BASE}/categories/${child.id}/${query}`).catch(() => null);
      for (const group of detail?.categories ?? []) {
        for (const product of group.products ?? []) {
          const cents = centsOf(product);
          if (product.display_name && cents) catalog.push({ key: normalize(product.display_name), cents });
        }
      }
    }

    // Para cada producto del hogar, el articulo de Mercadona cuyo nombre empieza igual (o lo contiene).
    const prices = wanted.flatMap(({ name, key }) => {
      // "Platanos" debe encontrar "Platano de Canarias": se prueba tambien en singular.
      const singular = key.replace(/(?:es|s)\b/g, "");
      const match =
        catalog.find((item) => item.key === key) ??
        catalog.find((item) => item.key.startsWith(`${key} `)) ??
        catalog.find((item) => item.key.includes(key)) ??
        (singular.length >= 4
          ? catalog.find((item) => item.key.startsWith(singular) || item.key.includes(` ${singular}`))
          : undefined);
      return match ? [{ name, priceCents: match.cents }] : [];
    });
    return Response.json({ prices, warehouse }, { headers: { ...CORS, "cache-control": "private, max-age=3600" } });
  } catch (error) {
    console.error(error);
    return Response.json({ prices: [] }, { headers: CORS });
  }
});
