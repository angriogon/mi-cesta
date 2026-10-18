import { describe, expect, it } from "vitest";
import { parseTicketText } from "../domain/tickets";
import { linesFromItems, type PdfTextItem } from "./pdf-lines";

/** Trozo de texto en Courier de 10 pt: 6 pt por carácter. */
const at = (str: string, column: number, row: number, split = 0): PdfTextItem[] => {
  if (!split) return [{ str, x: 20 + column * 6, y: 800 - row * 12, width: str.length * 6, height: 10 }];
  // Una palabra partida en dos trozos pegados, como hacen algunos PDF.
  return [
    { str: str.slice(0, split), x: 20 + column * 6, y: 800 - row * 12, width: split * 6, height: 10 },
    {
      str: str.slice(split),
      x: 20 + (column + split) * 6,
      y: 800.4 - row * 12,
      width: (str.length - split) * 6,
      height: 10,
    },
  ];
};

describe("líneas de un ticket en PDF", () => {
  it("agrupa por altura, une palabras partidas y deja hueco en la columna de importes", () => {
    const items = [
      ...at("4,92", 36, 2),
      ...at("1 LECHE DESN P6", 0, 2, 7),
      ...at("MERCADONA, S.A.", 10, 0),
      ...at("28/09/2026 11:39", 8, 1),
      ...at("1 LIMPIAMUEBLE PARQUET", 0, 3),
      ...at("200", 36, 3),
      ...at("TOTAL (€)", 20, 4),
      ...at("7,12", 36, 4),
    ];
    const lines = linesFromItems(items);
    expect(lines[0]).toBe("MERCADONA, S.A.");
    expect(lines[2]).toMatch(/^1 LECHE DESN P6\s{3,}4,92$/);
    expect(lines[3]).toMatch(/^1 LIMPIAMUEBLE PARQUET\s{3,}200$/);
    const parsed = parseTicketText(lines.join("\n"));
    expect(parsed.purchasedAt).toBe("2026-09-28");
    expect(parsed.items).toEqual([
      { description: "LECHE DESN P6", quantity: 1, lineTotalCents: 492 },
      { description: "LIMPIAMUEBLE PARQUET", quantity: 1, lineTotalCents: 200 },
    ]);
    expect(parsed.total).toBe("7.12");
  });
});
