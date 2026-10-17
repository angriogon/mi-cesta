export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Píxel de papel: claro y casi sin color (la mesa, la mano o la madera suelen tener color). */
function isPaper(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  return max > 115 && max - Math.min(r, g, b) < 38;
}

/** Tramo más largo de índices con valor ≥ `min`, tolerando huecos cortos (arrugas, sombras). */
function longestRun(values: number[], min: number, gap: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let lastHit = -1;
  for (let i = 0; i <= values.length; i++) {
    const hit = i < values.length && values[i] >= min;
    if (hit) {
      if (start < 0) start = i;
      lastHit = i;
    } else if (start >= 0 && (i === values.length || i - lastHit > gap)) {
      if (!best || lastHit - start > best[1] - best[0]) best = [start, lastHit];
      start = -1;
    }
  }
  return best;
}

/**
 * Busca el ticket en una foto (RGBA, normalmente reducida a ~600 px): la franja de papel claro más ancha
 * y, dentro de ella, la más alta. Devuelve null si no hay un papel claro que ocupe una parte razonable.
 */
export function findPaper(data: ArrayLike<number>, width: number, height: number): Box | null {
  const paper = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < paper.length; i += 4, p++) paper[p] = isPaper(data[i], data[i + 1], data[i + 2]) ? 1 : 0;

  const columns = Array.from({ length: width }, (_, x) => {
    let count = 0;
    for (let y = 0; y < height; y++) count += paper[y * width + x];
    return count / height;
  });
  const cols = longestRun(columns, 0.35, Math.round(width * 0.02));
  if (!cols) return null;

  const rows = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = cols[0]; x <= cols[1]; x++) count += paper[y * width + x];
    return count / (cols[1] - cols[0] + 1);
  });
  const span = longestRun(rows, 0.5, Math.round(height * 0.02));
  if (!span) return null;

  const box = { x: cols[0], y: span[0], width: cols[1] - cols[0] + 1, height: span[1] - span[0] + 1 };
  // Papel demasiado pequeño: mejor leer la foto entera que un trozo equivocado.
  if (box.width * box.height < width * height * 0.08 || box.width < width * 0.12) return null;
  // Margen pequeño para no cortar la primera o la última letra.
  const padX = Math.round(box.width * 0.02);
  const padY = Math.round(box.height * 0.01);
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  return {
    x,
    y,
    width: Math.min(width - x, box.width + padX * 2),
    height: Math.min(height - y, box.height + padY * 2),
  };
}

/** Tamaño de salida para el OCR: el ticket a ~1300 px de ancho (letras de unos 30 px), sin pasar de 14 MP. */
export function ocrSize(width: number, height: number, targetWidth = 1300, maxPixels = 14_000_000) {
  let scale = targetWidth / width;
  if (width * scale * height * scale > maxPixels) scale = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
