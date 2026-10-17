import { ApiError } from "../data/api";

/** Texto para el usuario: el de la API si lo trae, uno de conexión si no hay red, o el genérico de la acción. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (!navigator.onLine) return "Sin conexión. Los cambios se guardarán cuando vuelva internet.";
  return fallback;
}
