import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdmin } from "./useAdmin";

describe("acceso al mantenimiento", () => {
  it("con cuenta, responsables y administradores entran sin PIN", () => {
    expect(renderHook(() => useAdmin("h1", "owner")).result.current.unlocked).toBe(true);
    expect(renderHook(() => useAdmin("h1", "admin")).result.current.unlocked).toBe(true);
  });

  it("un miembro no entra aunque lo pida: se le explica que lo pida a un administrador", () => {
    const { result } = renderHook(() => useAdmin("h1", "member"));
    expect(result.current).toMatchObject({ byRole: true, unlocked: false });
    act(() => result.current.request());
    expect(result.current).toMatchObject({ requested: true, unlocked: false });
  });

  it("en modo local sigue el PIN del dispositivo", async () => {
    const { result } = renderHook(() => useAdmin("h-local", null));
    expect(result.current).toMatchObject({ byRole: false, unlocked: false });
    await act(() => result.current.configure("2468"));
    expect(result.current.unlocked).toBe(true);
    act(() => result.current.lock());
    expect(result.current.unlocked).toBe(false);
  });
});
