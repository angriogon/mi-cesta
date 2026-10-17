import type { QuickItem } from "../data/types";
import { normalize, uid } from "../lib/text";
import { guessCategory, type Category } from "./categories";

export const LOCATIONS = [
  "Despensa · Estantería 1",
  "Despensa · Estantería 2",
  "Frigorífico",
  "Congelador",
  "Limpieza y hogar",
  "Otra ubicación",
] as const;

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
};

const LEADING_QUANTITY =
  /^\s*(\d+(?:[.,]\d+)?|un(?:a|o)?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\b\s*(?:x\s+)?/i;

/** Categoría según el nombre; si no se reconoce, la deduce de la zona que se está revisando. */
export function categoryForLocation(name: string, location: string): Category {
  const guessed = guessCategory(name);
  if (guessed !== "Despensa") return guessed;
  if (location === "Congelador") return "Congelados";
  if (location === "Limpieza y hogar") return "Higiene y hogar";
  return "Despensa";
}

export function stripQuantity(text: string): string {
  return text
    .replace(LEADING_QUANTITY, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function leadingQuantity(text: string): number {
  const match = text.trim().toLocaleLowerCase("es").match(LEADING_QUANTITY);
  if (!match) return 1;
  return Number(match[1].replace(",", ".")) || NUMBER_WORDS[match[1]] || 1;
}

/** "2 leches, tres yogures y pan" → tres productos con su cantidad. */
export function parseSpokenList(text: string, location: string, source: string, confidence: number): QuickItem[] {
  return text
    .split(/\s*(?:,|;|\by\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      id: uid(),
      name: stripQuantity(part),
      quantity: leadingQuantity(part),
      category: categoryForLocation(part, location),
      unit: "unidad",
      confidence,
      source,
    }))
    .filter((item) => item.name.length > 1);
}

/** Etiquetas legibles de una foto de balda. */
export function labelsFromOcr(text: string, location: string): QuickItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\p{L}\p{N} .,'-]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 48 && /[a-záéíóúñ]{3}/i.test(line))
    .slice(0, 30)
    .map((line) => ({
      id: uid(),
      name: stripQuantity(line),
      quantity: leadingQuantity(line),
      category: categoryForLocation(line, location),
      unit: "unidad",
      confidence: 0.55,
      source: "foto",
    }));
}

const key = (value: string) => normalize(value).replace(/[^a-z0-9]/g, "");

/** Suma cantidades si el producto ya estaba en la revisión. */
export function mergeQuickItems(current: QuickItem[], incoming: Omit<QuickItem, "id">[] | QuickItem[]): QuickItem[] {
  const next = current.map((item) => ({ ...item }));
  for (const item of incoming) {
    const existing = next.find((other) => key(other.name) === key(item.name));
    if (existing) {
      existing.quantity += item.quantity;
      existing.confidence = Math.max(existing.confidence, item.confidence);
    } else next.push({ ...item, id: "id" in item && item.id ? item.id : uid() });
  }
  return next;
}
