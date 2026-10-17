// @vitest-environment node
/**
 * Prueba contra un proyecto Supabase real (no se ejecuta por defecto).
 * Necesita tres usuarios de prueba ya confirmados:
 *   CESTA_IT_URL, CESTA_IT_KEY, CESTA_IT_EMAILS="a@x,b@x,c@x", CESTA_IT_PASSWORD
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { mergeByName } from "../domain/lists";
import { CestaApi } from "./api";
import { SupabaseDb } from "./supabase-db";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const url = env.CESTA_IT_URL;
const key = env.CESTA_IT_KEY;
const emails = (env.CESTA_IT_EMAILS ?? "").split(",").filter(Boolean);
const password = env.CESTA_IT_PASSWORD ?? "";
const enabled = Boolean(url && key && emails.length === 3 && password);

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe.skipIf(!enabled)("Supabase real", () => {
  let clients: SupabaseClient[] = [];
  let householdId = "";

  afterAll(async () => {
    for (const client of clients) {
      if (householdId) await client.rpc("leave_household", { p_household_id: householdId });
      await client.removeAllChannels();
    }
  });

  it("dos personas comparten hogar, lista, almacén y tickets; una tercera no ve nada", { timeout: 60_000 }, async () => {
    clients = await Promise.all(emails.map(signIn));
    const [ana, luis, eva] = clients;

    const { data: created, error } = await ana.rpc("create_household", { p_name: "Hogar de prueba" });
    expect(error).toBeNull();
    householdId = created as string;
    const anaApi = new CestaApi(new SupabaseDb(ana, householdId));
    expect((await anaApi.products()).length).toBe(349);

    const household = await anaApi.household();
    const { error: joinError } = await luis.rpc("join_household", { p_code: household.inviteCode.toLowerCase() });
    expect(joinError).toBeNull();
    const luisDb = new SupabaseDb(luis, householdId);
    const luisApi = new CestaApi(luisDb);

    // Tiempo real: Luis recibe el cambio de lista que hace Ana.
    const received = new Promise<string>((resolve) => {
      const stop = luisDb.subscribe((table) => {
        if (table === "lists") {
          stop();
          resolve(table);
        }
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const saved = await anaApi.saveLists([{ id: "1", name: "Pan", quantity: 1, category: "Panadería", done: false }], [], 0, (remote) => remote);
    expect(saved.revision).toBe(1);
    await expect(Promise.race([received, new Promise((_, reject) => setTimeout(() => reject(new Error("sin tiempo real")), 15_000))])).resolves.toBe("lists");

    // Luis con revisión antigua no pisa: se mezcla.
    const mixed = await luisApi.saveLists(
      [{ id: "2", name: "Leche", quantity: 1, category: "Refrigerados", done: false }],
      [],
      0,
      (remote) => ({ ...remote, shopping: mergeByName(remote.shopping, [{ id: "2", name: "Leche", quantity: 1, category: "Refrigerados", done: false }]) }),
    );
    expect(mixed.shopping.map((item) => item.name).sort()).toEqual(["Leche", "Pan"]);

    // Compra guardada por Ana visible para Luis.
    await anaApi.storePurchased([{ id: "x", name: "Leche entera", quantity: 2, category: "Refrigerados", done: true }]);
    expect((await luisApi.products()).find((product) => product.name === "Leche entera")?.currentStock).toBe(2);

    // Ticket con foto: Luis puede verla.
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
    const result = await anaApi.saveTicket({
      image: new Blob([png], { type: "image/png" }),
      merchant: "Mercadona",
      purchasedAt: "2026-10-17",
      totalCents: 180,
      rawText: "",
      items: [{ description: "LECHE ENTERA", quantity: 2, lineTotalCents: 180 }],
    });
    expect(result.ticket.imagePath).toMatch(new RegExp(`^${householdId}/`));
    const signed = await luisApi.ticketImageUrl(result.ticket.imagePath!);
    expect(signed).toBeTruthy();
    expect((await fetch(signed!)).status).toBe(200);
    // Ya se había guardado desde la tienda: el ticket no duplica existencias.
    expect((await luisApi.products()).find((product) => product.name === "Leche entera")?.currentStock).toBe(2);

    // Eva, de fuera del hogar, no ve ni puede escribir nada.
    const evaDb = new SupabaseDb(eva, householdId);
    expect(await evaDb.list("products")).toEqual([]);
    await expect(evaDb.insert("dog_items", [{ id: "x", householdId, name: "Intruso", currentStock: 0, minimumStock: 0, updatedAt: new Date().toISOString() }])).rejects.toThrow();
    const { data: evaUrl } = await eva.storage.from("ticket-images").createSignedUrl(result.ticket.imagePath!, 60);
    expect(evaUrl?.signedUrl ?? null).toBeNull();

    // Deshacer el ticket y restablecer funcionan con permisos reales.
    expect(await anaApi.undo()).toBe("Ticket · Mercadona");
    // Al deshacer el ticket su foto también desaparece.
    const { data: afterUndo } = await ana.storage.from("ticket-images").list(householdId);
    expect(afterUndo ?? []).toEqual([]);
    await anaApi.resetHousehold();
    expect((await luisApi.lists()).shopping).toEqual([]);
  });
});
