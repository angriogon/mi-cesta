import { describe, expect, it } from "vitest";
import { lowPetItems, lowPetItemText } from "./pet";

describe("artículos de la mascota", () => {
  it("avisa de los que están en su mínimo o por debajo; sin mínimo no avisan", () => {
    const items = [
      { id: "a", name: "Pienso", currentStock: 1, minimumStock: 2 },
      { id: "b", name: "Arena", currentStock: 2, minimumStock: 2 },
      { id: "c", name: "Snacks", currentStock: 5, minimumStock: 2 },
      { id: "d", name: "Juguete", currentStock: 0, minimumStock: 0 },
    ];
    expect(lowPetItems(items).map((item) => item.name)).toEqual(["Pienso", "Arena"]);
    expect(lowPetItemText(items[0])).toBe("Queda poco: Pienso (1 de mínimo 2).");
  });
});
