import { cleanProductName } from "../../domain/matching";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const now = () => new Date().toISOString();

export function slug(value: string): string {
  return cleanProductName(value).replace(/\s+/g, "-").slice(0, 60) || "producto";
}

export interface ExternalPrices {
  /** Consulta precios de referencia externos (Mercadona). Devuelve null si no hay conexión. */
  fetch(postalCode: string, names: string[]): Promise<{ name: string; priceCents: number }[] | null>;
}
