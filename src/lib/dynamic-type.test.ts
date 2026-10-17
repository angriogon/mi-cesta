import { describe, expect, it } from "vitest";
import { textScale } from "./dynamic-type";

describe("textScale", () => {
  it("no cambia nada con el tamaño por defecto de iOS o sin dato", () => {
    expect(textScale(17)).toBe(1);
    expect(textScale(0)).toBe(1);
    expect(textScale(Number.NaN)).toBe(1);
  });

  it("sigue los tamaños grandes y pequeños dentro de un límite", () => {
    expect(textScale(19)).toBe(1.12);
    expect(textScale(14)).toBe(0.85);
    expect(textScale(53)).toBe(1.4);
  });
});
