import { describe, expect, it } from "vitest";
import { effectivePermissions } from "../../app/account";
import type { ListItem, PriceRef } from "../../data/types";
import { canonicalStore } from "../../domain/stores";
import { merchantBadge, priceFor } from "./prices";

const price = (merchant: string, priceCents: number, observedAt: string): PriceRef => ({
  id: `${merchant}-${observedAt}`,
  householdId: "h",
  productId: "p",
  productName: "Leche entera",
  category: "Refrigerados",
  priceCents,
  merchant,
  source: "ticket",
  observedAt,
});
const leche = { name: "Leche entera", quantity: 1 } as ListItem;

describe("precios del súper elegido", () => {
  const prices = [
    price("MERCADONA S.A.", 95, "2026-10-10"),
    price("Dia", 89, "2026-10-01"),
    price("Lidl", 92, "2026-10-15"),
  ];

  it("sin súper elegido, el último precio pagado en cualquiera", () => {
    expect(priceFor(leche, prices)?.merchant).toBe("Lidl");
  });

  it("con un súper elegido, su precio aunque sea más antiguo", () => {
    expect(priceFor(leche, prices, "DIA")?.priceCents).toBe(89);
    expect(priceFor(leche, prices, "Mercadona")?.priceCents).toBe(95);
  });

  it("si allí aún no se ha comprado, el último de otro súper", () => {
    expect(priceFor(leche, prices, "Consum")?.merchant).toBe("Lidl");
  });

  it("reconoce cada cadena como aparece en los tickets", () => {
    expect(canonicalStore("MERCADONA S.A.")).toBe("Mercadona");
    expect(canonicalStore("Dia")).toBe("DIA");
    expect(canonicalStore("SUPECO (Carrefour)")).toBe("Supeco");
    expect(canonicalStore("Hipermercado Alcampo")).toBe("Alcampo");
    expect(canonicalStore("Supermercados Jurado")).toBe("Jurado");
    expect(canonicalStore("Frutería Paco")).toBeNull();
    expect(merchantBadge(prices[1])).toBe("D");
  });
});

describe("permisos del hogar", () => {
  it("el responsable y los administradores los tienen todos; los miembros, los que se les den", () => {
    expect(effectivePermissions("owner", [])).toEqual(["almacen", "mascota", "miembros"]);
    expect(effectivePermissions("admin", null)).toEqual(["almacen", "mascota", "miembros"]);
    expect(effectivePermissions("member", ["mascota", "otro"])).toEqual(["mascota"]);
    expect(effectivePermissions("member", undefined)).toEqual([]);
  });
});
