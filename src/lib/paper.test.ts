import { describe, expect, it } from "vitest";
import { findPaper, ocrSize } from "./paper";

/** Foto simulada: mesa de madera (color) con un ticket blanco con líneas de texto. */
function photo(width: number, height: number, ticket: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inside = x >= ticket.x && x < ticket.x + ticket.w && y >= ticket.y && y < ticket.y + ticket.h;
      const text = inside && y % 6 === 0 && x % 3 !== 0;
      const [r, g, b] = !inside ? [214, 186, 132] : text ? [40, 40, 40] : [238, 238, 232];
      data.set([r, g, b, 255], i);
    }
  }
  return data;
}

describe("buscar el ticket en la foto", () => {
  it("recorta el papel y deja fuera la mesa", () => {
    const box = findPaper(photo(300, 400, { x: 110, y: 20, w: 80, h: 360 }), 300, 400);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(105);
    expect(box!.x).toBeLessThanOrEqual(110);
    expect(box!.x + box!.width).toBeGreaterThanOrEqual(190);
    expect(box!.x + box!.width).toBeLessThanOrEqual(195);
    expect(box!.y).toBeLessThanOrEqual(20);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(380);
  });

  it("sin papel claro devuelve null para leer la foto entera", () => {
    expect(findPaper(photo(100, 100, { x: 0, y: 0, w: 0, h: 0 }), 100, 100)).toBeNull();
  });

  it("amplía el ticket para que las letras se lean y limita el tamaño", () => {
    expect(ocrSize(500, 2500)).toEqual({ width: 1300, height: 6500 });
    const big = ocrSize(500, 10_000);
    expect(big.width * big.height).toBeLessThanOrEqual(14_000_000);
  });
});
