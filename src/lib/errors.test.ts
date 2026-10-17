import { afterEach, describe, expect, it, vi } from "vitest";
import { LOAD_FAILED, logError, notifyError, reportError, resetErrorsForTests, setErrorNotifier } from "./errors";

describe("política de errores", () => {
  afterEach(() => {
    resetErrorsForTests();
    vi.restoreAllMocks();
  });

  it("deja traza de todo error, aunque no avise al usuario", () => {
    const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const notify = vi.fn();
    setErrorNotifier(notify);
    logError("tarea opcional")(new Error("fallo"));
    expect(console).toHaveBeenCalledWith("[cesta] tarea opcional", expect.any(Error));
    expect(notify).not.toHaveBeenCalled();
  });

  it("avisa al usuario y agrupa los avisos repetidos", () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const notify = vi.fn();
    setErrorNotifier(notify);
    notifyError("cargar avisos", LOAD_FAILED)(new Error("sin red"));
    notifyError("cargar precios", LOAD_FAILED)(new Error("sin red"));
    reportError(new Error("otro"), "guardar", "No se ha podido guardar.");
    expect(notify.mock.calls).toEqual([[LOAD_FAILED], ["No se ha podido guardar."]]);
  });

  it("deja de avisar cuando el aviso se desregistra", () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const notify = vi.fn();
    const unregister = setErrorNotifier(notify);
    unregister();
    reportError(new Error("x"), "guardar", "No se ha podido guardar.");
    expect(notify).not.toHaveBeenCalled();
  });
});
