import type { ListItem } from "../data/types";
import { normalize, uid } from "../lib/text";
import { CATEGORIES, guessCategory, type Category } from "./categories";

export interface StockLike {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  minimum: number;
}

/** Une dos listas por nombre: gana la versión local (la del usuario) ante conflicto. */
export function mergeByName(remote: ListItem[], local: ListItem[]): ListItem[] {
  const map = new Map<string, ListItem>();
  for (const item of remote) map.set(normalize(item.name), item);
  for (const item of local) map.set(normalize(item.name), item);
  return [...map.values()];
}

export function groupByCategory(items: ListItem[]): { category: Category; items: ListItem[] }[] {
  return CATEGORIES.map((category) => ({ category, items: items.filter((item) => item.category === category) })).filter(
    (group) => group.items.length > 0,
  );
}

export function duplicateCount(items: ListItem[]): number {
  return items.length - new Set(items.map((item) => normalize(item.name))).size;
}

export function mergeDuplicates(items: ListItem[]): ListItem[] {
  const map = new Map<string, ListItem>();
  for (const item of items) {
    const key = normalize(item.name);
    const previous = map.get(key);
    map.set(
      key,
      previous ? { ...previous, quantity: previous.quantity + item.quantity, done: previous.done && item.done } : item,
    );
  }
  return [...map.values()];
}

/** Añade un producto a "Preparar"; si ya está pendiente, suma una unidad. */
export function addToShopping(
  items: ListItem[],
  rawName: string,
  stock: StockLike[],
  memory: Record<string, string>,
): ListItem[] {
  const name = rawName.trim();
  if (!name) return items;
  const key = normalize(name);
  const known = stock.find((product) => normalize(product.name) === key);
  const existing = items.find((item) => normalize(item.name) === key && !item.done);
  if (existing) return items.map((item) => (item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item));
  return [
    ...items,
    {
      id: uid(),
      name: known?.name ?? name,
      quantity: 1,
      category: known?.category ?? guessCategory(name, memory),
      done: false,
      isNew: !known,
    },
  ];
}

/** Pasa lo preparado a "En tienda", sumando cantidades a lo que ya estuviera. */
export function moveToChecklist(shopping: ListItem[], checklist: ListItem[]): ListItem[] {
  const next = checklist.map((item) => ({ ...item }));
  for (const item of shopping) {
    const index = next.findIndex((other) => normalize(other.name) === normalize(item.name));
    if (index >= 0) {
      next[index] = {
        ...next[index],
        quantity: next[index].quantity + item.quantity,
        done: false,
        category: item.category,
        isNew: next[index].isNew || item.isNew,
      };
    } else next.push({ ...item, id: uid(), done: false });
  }
  return next;
}

/** Añade a "En tienda" lo que falta para llegar al mínimo de cada producto. */
export function addNeeds(checklist: ListItem[], needs: StockLike[]): ListItem[] {
  const next = [...checklist];
  for (const need of needs) {
    const missing = need.minimum - need.quantity;
    const index = next.findIndex((item) => normalize(item.name) === normalize(need.name));
    if (index >= 0)
      next[index] = { ...next[index], quantity: Math.max(next[index].quantity, missing), category: need.category, done: false };
    else next.push({ id: uid(), name: need.name, quantity: missing, category: need.category, done: false });
  }
  return next;
}

/** Añade nombres sueltos a "En tienda" (ingredientes de una receta, por ejemplo). */
export function addNamesToChecklist(
  checklist: ListItem[],
  names: string[],
  stock: StockLike[],
  memory: Record<string, string>,
): ListItem[] {
  const next = [...checklist];
  for (const name of names) {
    const index = next.findIndex((item) => normalize(item.name) === normalize(name));
    if (index >= 0) next[index] = { ...next[index], quantity: next[index].quantity + 1, done: false };
    else
      next.push({
        id: uid(),
        name,
        quantity: 1,
        category: guessCategory(name, memory),
        done: false,
        isNew: !stock.some((product) => normalize(product.name) === normalize(name)),
      });
  }
  return next;
}

/** Añade sugerencias a "Preparar" sin bajar cantidades ya anotadas. */
export function addSuggestions(
  shopping: ListItem[],
  suggestions: { productId: string; productName: string; quantity: number }[],
  stock: StockLike[],
): ListItem[] {
  const next = [...shopping];
  for (const suggestion of suggestions) {
    const product = stock.find((item) => item.id === suggestion.productId);
    const index = next.findIndex((item) => normalize(item.name) === normalize(suggestion.productName));
    if (index >= 0) next[index] = { ...next[index], quantity: Math.max(next[index].quantity, suggestion.quantity), done: false };
    else
      next.push({
        id: uid(),
        name: suggestion.productName,
        quantity: suggestion.quantity,
        category: product?.category ?? "Despensa",
        done: false,
      });
  }
  return next;
}
