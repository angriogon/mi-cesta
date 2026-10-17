import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../data/database.types";
import type { ExternalPrices } from "../data/api";

export const APP_VERSION = "5.0.0";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sin Supabase configurado la app funciona en modo local (datos solo en este dispositivo). */
export const backendMode: "supabase" | "local" =
  url && anonKey && import.meta.env.VITE_FORCE_LOCAL !== "true" ? "supabase" : "local";

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
