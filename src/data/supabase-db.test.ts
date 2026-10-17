// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { afterEach, describe, expect, it } from "vitest";
import { SupabaseDb } from "./supabase-db";

// Cliente real de supabase-js apuntando a un servidor inexistente: no hace falta red para esta prueba.
const client = createClient<Database>("http://127.0.0.1:9", "clave-de-prueba", { auth: { persistSession: false } });

afterEach(async () => {
  await client.removeAllChannels();
});

describe("SupabaseDb · tiempo real", () => {
  it("varias pantallas pueden suscribirse a la vez al mismo hogar", () => {
    const db = new SupabaseDb(client, "hogar-1");
    const stopApp = db.subscribe(() => undefined);
    // Antes fallaba aquí: Necesidades, Mascota y Tickets se suscriben además de la pantalla principal.
    const stopView = db.subscribe(() => undefined);
    const stopOther = new SupabaseDb(client, "hogar-1").subscribe(() => undefined);
    stopView();
    stopOther();
    expect(() => db.subscribe(() => undefined)()).not.toThrow();
    stopApp();
  });

  it("reparte cada cambio a todas las suscripciones y deja de avisar al darse de baja", () => {
    const db = new SupabaseDb(client, "hogar-2");
    const seen: string[] = [];
    const stopA = db.subscribe((table) => seen.push(`a:${table}`));
    const stopB = db.subscribe((table) => seen.push(`b:${table}`));
    db.notifyForTests("lists");
    stopB();
    db.notifyForTests("products");
    expect(seen).toEqual(["a:lists", "b:lists", "a:products"]);
    stopA();
    expect(client.getChannels()).toHaveLength(0);
  });
});
