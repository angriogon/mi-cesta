import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CestaApi } from "../data/api";
import { LocalDb, memoryPersistence } from "../data/local-db";
import { addToShopping } from "../domain/lists";
import { resetErrorsForTests } from "../lib/errors";
import { createChannel } from "./events";
import { useLists } from "./useLists";

let db: LocalDb;
let api: CestaApi;

beforeEach(() => {
  resetErrorsForTests();
  db = new LocalDb("hogar-listas", memoryPersistence());
  api = new CestaApi(db);
});

const names = (items: { name: string }[]) => items.map((item) => item.name).sort();

async function mount(active = true) {
  const hook = renderHook(({ on }) => useLists(api, on), { initialProps: { on: active } });
  await act(() => hook.result.current.pullLists());
  return hook;
}

describe("useLists", () => {
  it("carga las listas guardadas sin volver a guardarlas", async () => {
    const remote = addToShopping([], "Leche", [], {});
    await api.saveLists(remote, [], 0, (lists) => lists);
    const save = vi.spyOn(api, "saveLists");
    const { result } = await mount();
    expect(names(result.current.shopping)).toEqual(["Leche"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(save).not.toHaveBeenCalled();
  });

  it("guarda solo los cambios locales, agrupando toques seguidos", async () => {
    const save = vi.spyOn(api, "saveLists");
    const { result } = await mount();
    act(() => result.current.setShopping((items) => addToShopping(items, "Pan", [], {})));
    act(() => result.current.setShopping((items) => addToShopping(items, "Huevos", [], {})));
    await waitFor(async () => expect(names((await api.lists()).shopping)).toEqual(["Huevos", "Pan"]));
    expect(save).toHaveBeenCalledTimes(1);
    expect((await api.lists()).revision).toBe(1);
  });

  it("no guarda nada hasta que la app termina de cargar", async () => {
    const { result } = await mount(false);
    act(() => result.current.setShopping((items) => addToShopping(items, "Pan", [], {})));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect((await api.lists()).revision).toBe(0);
  });

  it("mezcla por nombre si otro dispositivo guardó antes", async () => {
    const { result } = await mount();
    // Otro dispositivo del hogar añade «Café» mientras este no se ha enterado.
    await api.saveLists(addToShopping([], "Café", [], {}), [], 0, (lists) => lists);
    act(() => result.current.setShopping((items) => addToShopping(items, "Pan", [], {})));
    await waitFor(() => expect(names(result.current.shopping)).toEqual(["Café", "Pan"]));
    expect(names((await api.lists()).shopping)).toEqual(["Café", "Pan"]);
  });
});

describe("canales internos", () => {
  it("avisa a los oyentes suscritos y deja de hacerlo al darse de baja", () => {
    const channel = createChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    channel.emit();
    unsubscribe();
    channel.emit();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
