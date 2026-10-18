import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CestaApi } from "../data/api";
import { LocalDb, memoryPersistence } from "../data/local-db";
import { outboxFor } from "../data/outbox";
import { seedIfEmpty } from "../data/seed";
import { resetErrorsForTests, setErrorNotifier } from "../lib/errors";
import { OFFLINE_SAVED, useOfflineQueue } from "./useOfflineQueue";
import { usePet } from "./usePet";
import { useTickets } from "./useTickets";
import { useProducts } from "./useProducts";

let api: CestaApi;
let household = 0;

beforeEach(async () => {
  resetErrorsForTests();
  household++;
  const db = new LocalDb(`hogar-sin-red-${household}`, memoryPersistence());
  await seedIfEmpty(db);
  api = new CestaApi(db);
});

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("sin conexión", () => {
  it("un cambio de existencias sin red se mantiene, espera en la cola y se guarda al volver", async () => {
    const notices: string[] = [];
    setErrorNotifier((message) => notices.push(message));
    const products = renderHook(() => useProducts(api, vi.fn()));
    await act(() => products.result.current.refreshProducts());
    const leche = products.result.current.products.find((product) => product.name === "Leche entera")!;

    const spy = vi.spyOn(api, "updateProduct").mockImplementationOnce(offline);
    await act(() => products.result.current.updateStock(leche.id, (item) => ({ ...item, quantity: 3 })));
    expect(products.result.current.products.find((product) => product.id === leche.id)?.currentStock).toBe(3);
    expect(notices).toContain(OFFLINE_SAVED);
    expect(await outboxFor(api.db.householdId).pending()).toBe(1);
    expect((await api.products()).find((product) => product.id === leche.id)?.currentStock).toBe(0);

    // Vuelve la red: al montar la cola se envía y la API ya tiene el cambio.
    spy.mockRestore();
    const onSynced = vi.fn();
    const queue = renderHook(() => useOfflineQueue(api, onSynced));
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(queue.result.current).toBe(0);
    expect((await api.products()).find((product) => product.id === leche.id)?.currentStock).toBe(3);
  });

  it("contar artículos de la mascota sin red no se deshace: espera en la cola", async () => {
    const item = await api.addDogItem("Pienso para perros");
    const pet = renderHook(() => usePet(api, true));
    await waitFor(() => expect(pet.result.current.items.length).toBe(1));
    vi.spyOn(api, "updateDogItem").mockImplementationOnce(offline);
    await act(() => pet.result.current.updateItem(item, { ...item, currentStock: 4 }));
    expect(pet.result.current.items[0].currentStock).toBe(4);
    expect(await outboxFor(api.db.householdId).pending()).toBe(1);
  });

  it("un ticket sin red queda en la cola con su foto y se guarda al volver", async () => {
    const tickets = renderHook(() => useTickets(api, vi.fn()));
    const photo = new Blob(["foto"], { type: "image/jpeg" });
    const input = {
      image: photo,
      merchant: "Mercadona",
      purchasedAt: "2026-10-18",
      totalCents: 735,
      rawText: "",
      items: [{ description: "PECHUGA FAMILIAR", quantity: 1, lineTotalCents: 735 }],
    };
    const spy = vi.spyOn(api, "saveTicket").mockImplementationOnce(offline);
    let result: unknown;
    await act(async () => {
      result = await tickets.result.current.save(input);
    });
    expect(result).toBe("queued");
    const outbox = outboxFor(api.db.householdId);
    expect(await outbox.pending()).toBe(1);
    spy.mockRestore();
    await outbox.flush(api);
    expect((await api.tickets()).tickets).toHaveLength(1);
    expect((await api.products()).find((product) => product.name === "Pechuga de pollo")?.currentStock).toBe(1);
  });
});
