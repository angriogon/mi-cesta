import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExternalPrices } from "../data/api";

export const APP_VERSION = "5.0.0";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sin Supabase configurado la app funciona en modo local (datos solo en este dispositivo). */
export const backendMode: "supabase" | "local" =
  url && anonKey && import.meta.env.VITE_FORCE_LOCAL !== "true" ? "supabase" : "local";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase no está configurado.");
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}

/** Precios de Mercadona a través de la Edge Function `mercadona-prices` (solo con Supabase). */
export function externalPrices(): ExternalPrices | undefined {
  if (backendMode !== "supabase") return undefined;
  return {
    async fetch(postalCode, names) {
      const { data, error } = await supabase().functions.invoke("mercadona-prices", { body: { postalCode, names } });
      if (error || !data || !Array.isArray(data.prices)) return null;
      return data.prices as { name: string; priceCents: number }[];
    },
  };
}
