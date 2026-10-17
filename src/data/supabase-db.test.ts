// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("SupabaseDb.applyBatch", () => {
  it("envía el lote a apply_batch con los nombres de columna de la base de datos", async () => {
    const rpc = vi.spyOn(client, "rpc").mockResolvedValue({ data: null, error: null });
    const db = new SupabaseDb(client, "hogar-1");
    await db.applyBatch([
      { kind: "update", table: "products", id: "p1", patch: { currentStock: 2, confirmedAt: "2026-10-17" } },
      { kind: "remove", table: "inventory_lots", ids: ["l1"] },
    ]);
    expect(rpc).toHaveBeenCalledWith("apply_batch", {
      p_household_id: "hogar-1",
      p_ops: [
        { kind: "update", table: "products", id: "p1", patch: { current_stock: 2, confirmed_at: "2026-10-17" } },
        { kind: "remove", table: "inventory_lots", ids: ["l1"] },
      ],
    });
    rpc.mockRestore();
  });

  it("no llama al servidor si no hay nada que guardar", async () => {
    const rpc = vi.spyOn(client, "rpc");
    await new SupabaseDb(client, "hogar-1").applyBatch([]);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRestore();
  });
});
