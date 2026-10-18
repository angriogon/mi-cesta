import { cleanProductName, findProduct, type Matchable } from "./matching";

/**
 * Equivalencias de serie: cómo escriben los supermercados (sobre todo Mercadona) productos que en
 * Cesta tienen otro nombre. Clave = palabras del ticket (sin acentos ni mayúsculas); valor = nombre
 * del catálogo base. Cada hogar puede cambiarlas o añadir las suyas en Menú → Equivalencias.
 */
export const DEFAULT_EQUIVALENCES: Record<string, string> = {
  "pechuga familiar": "Pechuga de pollo",
  "pechuga pollo": "Pechuga de pollo",
  "pechuga pavo": "Pechuga de pavo",
  "huevos frescos": "Huevos L",
  huevos: "Huevos L",
  "lomo trozo": "Lomo de cerdo",
  "esp verde": "Espárragos trigueros",
  "ensal pimiento": "Pimientos del piquillo",
  "pimiento rojo": "Pimientos",
  "pimiento verde": "Pimientos",
  "griego ligero": "Yogur griego",
  griego: "Yogur griego",
  prote: "Yogur proteico",
  pota: "Calamar",
  panec: "Panecillos",
  "salteado de verduras": "Verduras congeladas",
  "limon malla": "Limones",
  "zanahoria bolsa": "Zanahorias",
  "tomate pera": "Tomate ensalada",
  "queso rallado": "Queso mozzarella",
  limpiamueble: "Limpiador multiusos",
  regana: "Regañás",
  "tortillas mexicanas": "Tortillas de trigo",
  "cocktail tostado": "Mix de frutos secos",
  "calabacin verde": "Calabacín",
  "leche desn": "Leche desnatada",
  "leche semi": "Leche semidesnatada",
  "leche entera": "Leche entera",
  ketchup: "Kétchup",
  banana: "Plátanos",
  "t cherry": "Tomates cherry",
  cherry: "Tomates cherry",
  "tomate malla": "Tomate ensalada",
  "tomate anhel": "Tomate ensalada",
  "coca cola": "Refrescos de cola",
  limonada: "Refrescos de limón",
  champinon: "Champiñones",
  "ajo granulado": "Ajo en polvo",
  cap: "Café en cápsulas",
  burger: "Hamburguesas",
  coquina: "Almejas",
  aceituna: "Aceitunas",
  aceitunas: "Aceitunas",
  pepinillo: "Pepinillos",
  pepinillos: "Pepinillos",
  seta: "Setas",
  setas: "Setas",
  cebollino: "Cebollino",
  cayena: "Cayena",
  "frutos rojos": "Frutos rojos",
  "brotes tiernos": "Brotes tiernos",
  caracola: "Caracolas",
  rosquilla: "Rosquillas",
  tea: "Té frío",
  "rec elec": "Recambio de ambientador",
  "recamb amb": "Recambio de ambientador",
  "recambio liquido": "Recambio de ambientador",
  "mini saladas": "Galletas saladas",
  "cacao crunch": "Cereales de chocolate",
  "vainilla praline": "Tarrinas",
  noodles: "Noodles",
  fideo: "Fideos",
  alpro: "Yogur de soja",
  "oil cream": "Crema corporal",
};

export type MatchSource = "alias" | "equivalence" | "similar";

/**
 * Equivalencia de serie para una línea: la clave más larga que aparece en la línea como palabras
 * completas («prote» encaja en «PROTE.MANGO» pero no en «CREMA PROTECTORA»).
 */
export function defaultEquivalence(line: string): string | null {
  const clean = ` ${cleanProductName(line)} `;
  let best: string | null = null;
  for (const key of Object.keys(DEFAULT_EQUIVALENCES))
    if (clean.includes(` ${key} `) && (!best || key.length > best.length)) best = key;
  return best ? DEFAULT_EQUIVALENCES[best] : null;
}

/**
 * Producto del almacén para una línea de ticket, por orden de preferencia:
 * 1. la equivalencia que el hogar ha guardado; 2. la de serie; 3. el nombre más parecido.
 */
export function matchLine<T extends Matchable>(
  line: string,
  products: T[],
  aliases: { alias: string; productId: string }[] = [],
): { product: T; source: MatchSource } | null {
  const key = cleanProductName(line);
  const alias = aliases.find((item) => cleanProductName(item.alias) === key);
  const aliased = alias && products.find((product) => product.id === alias.productId);
  if (aliased) return { product: aliased, source: "alias" };
  const target = defaultEquivalence(line);
  const equivalent = target && products.find((product) => product.name.toLowerCase() === target.toLowerCase());
  if (equivalent) return { product: equivalent, source: "equivalence" };
  const similar = findProduct(line, products);
  return similar ? { product: similar, source: "similar" } : null;
}
