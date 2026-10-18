import type { DogItem } from "../data/types";

/** Artículos de la mascota por debajo (o en) su mínimo; los que no tienen mínimo no avisan. */
export function lowPetItems(items: Pick<DogItem, "id" | "name" | "currentStock" | "minimumStock">[]) {
  return items.filter((item) => item.minimumStock > 0 && item.currentStock <= item.minimumStock);
}

/** Texto del aviso de un artículo bajo mínimos (el mismo en la app y en el aviso push). */
export function lowPetItemText(item: Pick<DogItem, "name" | "currentStock" | "minimumStock">) {
  return `Queda poco: ${item.name} (${item.currentStock} de mínimo ${item.minimumStock}).`;
}
