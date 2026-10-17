import type { Category } from "../../domain/categories";
import type { ListItem } from "../../data/types";

/** Una lista agrupada por categoría, en el orden en que se muestra. */
export type Grouped = { category: Category; items: ListItem[] }[];
