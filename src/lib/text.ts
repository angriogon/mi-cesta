/** Normaliza un nombre para comparar: minúsculas, sin acentos y sin espacios sobrantes. */
export function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Como `normalize`, pero además elimina signos y colapsa espacios. */
export function normalizeWords(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatCents(cents: number): string {
  return euro.format((Number.isFinite(cents) ? cents : 0) / 100);
}

/** Convierte "3,45" o "3.45" en céntimos. Devuelve null si no es un importe válido. */
export function parseEuroToCents(value: string): number | null {
  const clean = value.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

/** Días naturales hasta una fecha ISO (negativo si ya pasó, 0 si es hoy). */
export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  const today = new Date(`${todayIso(now)}T00:00:00`).getTime();
  return Math.round((target - today) / 864e5);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
