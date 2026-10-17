import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../data/database.types";
import type { ExternalPrices } from "../data/api";

export const APP_VERSION = "5.0.0";
/** Fecha y hora de esta compilación, para distinguir versiones publicadas el mismo día. */
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** Clave pública del proyecto: la nueva «publishable» (sb_publishable_…) o, si no hay, la antigua «anon». */
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  string | undefined;

const forceLocal = import.meta.env.VITE_FORCE_LOCAL === "true";

/**
 * Para usar Cesta hace falta cuenta. El modo local (datos solo en este dispositivo) es solo para
 * pruebas: se activa con `VITE_FORCE_LOCAL=true` o en desarrollo sin Supabase configurado.
 * Una versión publicada sin Supabase no arranca en local: muestra que falta la configuración.
 */
export const backendMode: "supabase" | "local" | "unconfigured" = forceLocal
  ? "local"
  : url && anonKey
    ? "supabase"
    : import.meta.env.DEV
      ? "local"
      : "unconfigured";

export type CestaSupabase = SupabaseClient<Database>;

let client: CestaSupabase | null = null;

export function supabase(): CestaSupabase {
  if (!url || !anonKey) throw new Error("Supabase no está configurado.");
  client ??= createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}

/** Precios de Mercadona a través de la Edge Function `mercadona-prices` (solo con Supabase). */
export function externalPrices(): ExternalPrices | undefined {
  if (backendMode !== "supabase") return undefined;
  return {
    async fetch(postalCode, names) {
      const response = await supabase().functions.invoke<{ prices?: { name: string; priceCents: number }[] }>(
        "mercadona-prices",
        { body: { postalCode, names } },
      );
      const error: unknown = response.error;
      if (error) throw error instanceof Error ? error : new Error("No se pudieron consultar los precios.");
      const prices = response.data?.prices;
      return Array.isArray(prices) ? prices : null;
    },
  };
}
