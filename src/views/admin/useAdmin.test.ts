import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdmin } from "./useAdmin";

describe("acceso al mantenimiento", () => {
  it("con cuenta, quien tiene el permiso de una zona entra sin PIN", () => {
    const all = renderHook(() => useAdmin("h1", ["almacen", "mascota", "miembros"])).result.current;
    expect(all.unlocked).toBe(true);
    expect(all.can("mascota")).toBe(true);
    const pet = renderHook(() => useAdmin("h1", ["mascota"])).result.current;
    expect(pet.unlocked).toBe(false);
    expect(pet.can("mascota")).toBe(true);
  });

  it("sin permiso no entra aunque lo pida: se le explica que lo pida", () => {
    const { result } = renderHook(() => useAdmin("h1", []));
    expect(result.current).toMatchObject({ byRole: true, unlocked: false });
    act(() => result.current.request("mascota"));
    expect(result.current).toMatchObject({ requested: "mascota", unlocked: false });
    act(() => result.current.cancel());
    expect(result.current.requested).toBeNull();
  });

  it("en modo local sigue el PIN del dispositivo", async () => {
    const { result } = renderHook(() => useAdmin("h-local", null));
    expect(result.current).toMatchObject({ byRole: false, unlocked: false });
    await act(() => result.current.configure("2468"));
    expect(result.current.unlocked).toBe(true);
    expect(result.current.can("mascota")).toBe(true);
    act(() => result.current.lock());
    expect(result.current.unlocked).toBe(false);
  });
});
