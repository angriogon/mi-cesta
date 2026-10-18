import type { Product } from "../data/types";

/**
 * Lo que en casi cualquier casa no debería faltar, con un mínimo razonable para empezar.
 * Los nombres son los del catálogo base; los que no estén en el hogar no se proponen.
 */
export const STARTER_BASICS: { name: string; minimum: number }[] = [
  { name: "Leche semidesnatada", minimum: 2 },
  { name: "Huevos L", minimum: 1 },
  { name: "Pan de molde", minimum: 1 },
  { name: "Aceite de oliva", minimum: 1 },
  { name: "Café molido", minimum: 1 },
  { name: "Arroz", minimum: 1 },
  { name: "Macarrones", minimum: 1 },
  { name: "Tomate frito", minimum: 1 },
  { name: "Atún", minimum: 1 },
  { name: "Yogur natural", minimum: 1 },
  { name: "Patatas", minimum: 1 },
  { name: "Cebollas", minimum: 1 },
  { name: "Plátanos", minimum: 1 },
  { name: "Papel higiénico", minimum: 1 },
  { name: "Detergente lavadora", minimum: 1 },
  { name: "Lavavajillas", minimum: 1 },
  { name: "Gel de ducha", minimum: 1 },
  { name: "Pasta de dientes", minimum: 1 },
];

/** El hogar aún no ha dicho qué no puede faltar: sin mínimos, Necesidades y AutoCesta no tienen con qué trabajar. */
export function needsStarter(products: Pick<Product, "minimumStock">[]) {
  return products.length > 0 && !products.some((product) => product.minimumStock > 0);
}

/** Básicos disponibles en el catálogo de este hogar, con su producto. */
export function starterChoices(products: Product[]) {
  const byName = new Map(products.map((product) => [product.name.toLowerCase(), product]));
  return STARTER_BASICS.flatMap(({ name, minimum }) => {
    const product = byName.get(name.toLowerCase());
    return product ? [{ product, minimum }] : [];
  });
}
