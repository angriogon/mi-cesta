import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CestaApi } from "../data/api";
import { LocalDb, memoryPersistence } from "../data/local-db";
import { seedIfEmpty } from "../data/seed";
import type { Product } from "../data/types";
import { resetErrorsForTests, setErrorNotifier } from "../lib/errors";
import { inventoryChanged } from "./events";
import { useLots } from "./useLots";
import { useProducts } from "./useProducts";

let api: CestaApi;

beforeEach(async () => {
  resetErrorsForTests();
  const db = new LocalDb("hogar-despensa", memoryPersistence());
  await seedIfEmpty(db);
  api = new CestaApi(db);
});

async function mountProducts(onChanged = vi.fn()) {
  const hook = renderHook(() => useProducts(api, onChanged));
  await act(() => hook.result.current.refreshProducts());
  return { ...hook, onChanged };
}

const find = (products: Product[], name: string) => products.find((product) => product.name === name)!;

describe("useProducts", () => {
  it("no pierde ningún toque rápido en +", async () => {
    const { result, onChanged } = await mountProducts();
    const leche = find(result.current.products, "Leche entera");
    await act(async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          result.current.updateStock(leche.id, (item) => ({ ...item, quantity: item.quantity + 1 })),
        ),
      );
    });
    expect(find(result.current.products, "Leche entera").currentStock).toBe(5);
    expect(find(await api.products(), "Leche entera").currentStock).toBe(5);
    expect(onChanged).toHaveBeenCalled();
  });

  it("calcula lo que falta según el mínimo", async () => {
    const { result } = await mountProducts();
    const pan = find(result.current.products, "Pan de molde");
    await act(() => result.current.updateStock(pan.id, (item) => ({ ...item, minimum: 2 })));
    expect(result.current.needs.map((item) => item.name)).toContain("Pan de molde");
  });

  it("crea, rechaza duplicados con un mensaje claro y borra", async () => {
    const { result } = await mountProducts();
    let created = { ok: false };
    await act(async () => {
      created = await result.current.createProduct("Kéfir de cabra", "Refrigerados");
    });
    expect(created.ok).toBe(true);
    let duplicate: { ok: boolean; error?: string } = { ok: true };
    await act(async () => {
      duplicate = await result.current.createProduct("kéfir de cabra", "Refrigerados");
    });
    expect(duplicate).toMatchObject({ ok: false, error: expect.stringContaining("ya existe") as string });
    const kefir = result.current.products.find((product) => product.name === "Kéfir de cabra")!;
    await act(async () => {
      await result.current.removeProduct(kefir.id);
    });
    expect(result.current.products.some((product) => product.id === kefir.id)).toBe(false);
  });

  it("avisa al usuario si no se puede guardar y vuelve a cargar lo real", async () => {
    const notify = vi.fn();
    setErrorNotifier(notify);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = await mountProducts();
    const leche = find(result.current.products, "Leche entera");
    vi.spyOn(api, "updateProduct").mockRejectedValueOnce(new Error("sin red"));
    await act(() => result.current.updateStock(leche.id, (item) => ({ ...item, quantity: 3 })));
    expect(notify).toHaveBeenCalled();
    await waitFor(() => expect(find(result.current.products, "Leche entera").currentStock).toBe(0));
  });
});

describe("useLots", () => {
  async function withLot() {
    await api.addLot({ productId: null, productName: "Yogur", quantity: 2, expiryDate: "2026-10-20" });
    const hook = renderHook(() => useLots(api));
    await waitFor(() => expect(hook.result.current.lots).toHaveLength(1));
    return hook;
  }

  it("cambia el estado al momento y lo guarda", async () => {
    const { result } = await withLot();
    const lot = result.current.lots[0];
    await act(() => result.current.setState(lot, "opened"));
    expect(result.current.lots[0].state).toBe("opened");
    expect((await api.lots())[0].state).toBe("opened");
  });

  it("retira un lote y lo recupera al deshacer", async () => {
    const { result } = await withLot();
    const lot = result.current.lots[0];
    await act(async () => {
      expect(await result.current.remove(lot)).toBe(true);
    });
    expect(result.current.lots).toHaveLength(0);
    await act(() => result.current.restore(lot));
    expect(result.current.lots.map((item) => item.productName)).toEqual(["Yogur"]);
  });

  it("se recarga cuando otra pantalla avisa de cambios en el inventario", async () => {
    const { result } = await withLot();
    await api.addLot({ productId: null, productName: "Queso", quantity: 1, expiryDate: null });
    act(() => inventoryChanged.emit());
    await waitFor(() => expect(result.current.lots).toHaveLength(2));
  });
});
