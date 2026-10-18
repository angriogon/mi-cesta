import { describe, expect, it } from "vitest";
import catalog from "./seed-catalog.json";
import { DEFAULT_EQUIVALENCES, defaultEquivalence, matchLine } from "./equivalences";

const products = (catalog as { sku: string; name: string }[]).map((item) => ({ id: item.sku, name: item.name }));
const nameOf = (line: string, aliases: { alias: string; productId: string }[] = []) =>
  matchLine(line, products, aliases)?.product.name ?? null;

describe("equivalencias de tickets", () => {
  it("todas las de serie apuntan a productos que existen en el catálogo base", () => {
    const names = new Set(products.map((product) => product.name));
    expect(Object.values(DEFAULT_EQUIVALENCES).filter((name) => !names.has(name))).toEqual([]);
  });

  it("traduce las abreviaturas de Mercadona de un ticket real", () => {
    expect(nameOf("PECHUGA FAMILIAR")).toBe("Pechuga de pollo");
    expect(nameOf("24 HUEVOS FRESCOS")).toBe("Huevos L");
    expect(nameOf("LOMO TROZO")).toBe("Lomo de cerdo");
    expect(nameOf("PROTE.MANGO MARACUYA")).toBe("Yogur proteico");
    expect(nameOf("GRIEGO LIGERO NAT")).toBe("Yogur griego");
    expect(nameOf("Pota")).toBe("Calamar");
    expect(nameOf("LECHE DESN P6")).toBe("Leche desnatada");
  });

  it("solo con palabras completas: «prote» no convierte una crema protectora en yogur", () => {
    expect(defaultEquivalence("CREMA PROTECTORA SPF50")).toBeNull();
    expect(nameOf("CREMA PROTECTORA")).toBe("Crema protectora");
  });

  it("la equivalencia del hogar manda sobre la de serie y sobre el parecido", () => {
    expect(nameOf("PECHUGA FAMILIAR", [{ alias: "pechuga familiar", productId: "carne-y-pescado-pollo-entero" }])).toBe(
      products.find((product) => product.id === "carne-y-pescado-pollo-entero")?.name ?? null,
    );
    expect(matchLine("PECHUGA FAMILIAR", products)?.source).toBe("equivalence");
    expect(matchLine("SOLOMILLO CERDO", products)?.source).toBe("similar");
  });
});
