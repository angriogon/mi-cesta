import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CestaApi } from "../data/api";
import { LocalDb, memoryPersistence } from "../data/local-db";
import { seedIfEmpty } from "../data/seed";
import { resetErrorsForTests } from "../lib/errors";
import { usePet } from "./usePet";
import { useTickets } from "./useTickets";

let api: CestaApi;

beforeEach(async () => {
  resetErrorsForTests();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const db = new LocalDb("hogar-mascota", memoryPersistence());
  await seedIfEmpty(db);
  api = new CestaApi(db);
});

describe("usePet", () => {
  async function mount() {
    const hook = renderHook(({ active }) => usePet(api, active), { initialProps: { active: true } });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it("no carga nada hasta que la app está lista", async () => {
    const dogItems = vi.spyOn(api, "dogItems");
    renderHook(() => usePet(api, false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dogItems).not.toHaveBeenCalled();
  });

  it("añade artículos, cambia el nombre y gestiona avisos en un único estado", async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem("Pienso");
      await result.current.rename("Serranito");
      await result.current.addReminder("Paseo", "21:00");
    });
    expect(result.current.items.map((item) => item.name)).toContain("Pienso");
    expect(result.current.petName).toBe("Serranito");
    expect(result.current.reminders.map((reminder) => reminder.title)).toEqual(["Paseo"]);
    const paseo = result.current.reminders[0];
    await act(() => result.current.updateReminder(paseo.id, { enabled: false }));
    expect(result.current.reminders[0].enabled).toBe(false);
    await act(() => result.current.deleteReminder(paseo.id));
    expect(result.current.reminders).toEqual([]);
  });

  it("si no se puede guardar un artículo, vuelve al valor anterior y avisa a la pantalla", async () => {
    const { result } = await mount();
    let item = result.current.items[0];
    if (!item) {
      await act(async () => {
        item = await result.current.addItem("Pienso");
      });
    }
    vi.spyOn(api, "updateDogItem").mockRejectedValueOnce(new Error("sin red"));
    await act(async () => {
      await expect(result.current.updateItem(item, { ...item, currentStock: 9 })).rejects.toThrow("sin red");
    });
    expect(result.current.items.find((entry) => entry.id === item.id)?.currentStock).toBe(item.currentStock);
  });

  it("rechaza nombres vacíos con el mensaje de la API", async () => {
    const { result } = await mount();
    await act(async () => {
      await expect(result.current.rename("  ")).rejects.toThrow("Escribe un nombre.");
    });
  });
});

describe("useTickets", () => {
  it("guarda un ticket, avisa de que cambian las existencias y lo suma a su mes", async () => {
    const onStockChanged = vi.fn();
    const { result } = renderHook(() => useTickets(api, onStockChanged));
    await act(async () => {
      await result.current.save({
        image: null,
        merchant: "Mercadona",
        purchasedAt: "2026-10-17",
        totalCents: 1234,
        rawText: "",
        items: [{ description: "Leche entera", quantity: 2, lineTotalCents: 190 }],
      });
    });
    expect(onStockChanged).toHaveBeenCalled();
    expect(result.current.tickets).toHaveLength(1);
    expect(result.current.months).toEqual([["2026-10", 1234]]);
  });

  it("edita y borra tickets", async () => {
    const { result } = renderHook(() => useTickets(api, () => undefined));
    await act(async () => {
      await result.current.save({
        image: null,
        merchant: "Mercadona",
        purchasedAt: "2026-10-17",
        totalCents: 500,
        rawText: "",
        items: [],
      });
    });
    const ticket = result.current.tickets[0];
    await act(() => result.current.update({ ...ticket, merchant: "Lidl" }));
    expect(result.current.tickets[0].merchant).toBe("Lidl");
    await act(() => result.current.remove(ticket.id));
    expect(result.current.tickets).toEqual([]);
  });

  it("propaga el mensaje de la API si el ticket no es válido", async () => {
    const { result } = renderHook(() => useTickets(api, () => undefined));
    await act(async () => {
      await expect(
        result.current.save({
          image: null,
          merchant: "Mercadona",
          purchasedAt: "2026-10-17",
          totalCents: 0,
          rawText: "",
          items: [],
        }),
      ).rejects.toThrow("Indica el total del ticket.");
    });
  });
});
