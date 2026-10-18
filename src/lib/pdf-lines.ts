/** Trozo de texto de un PDF con su posición (coordenadas del PDF: la y crece hacia arriba). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Reconstruye las líneas de un ticket a partir de los trozos de texto del PDF: agrupa por altura,
 * ordena de izquierda a derecha y convierte los huecos grandes en varios espacios, como en el papel
 * (el intérprete usa esa separación para reconocer la columna de importes).
 */
export function linesFromItems(items: PdfTextItem[]): string[] {
  const words = items.filter((item) => item.str.trim());
  if (!words.length) return [];
  const rows: { y: number; height: number; items: PdfTextItem[] }[] = [];
  for (const item of [...words].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, candidate.height * 0.45));
    if (row) row.items.push(item);
    else rows.push({ y: item.y, height: item.height || 10, items: [item] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let end = sorted[0].x;
      for (const item of sorted) {
        const charWidth = item.width / Math.max(1, item.str.length) || row.height * 0.5;
        const gap = item.x - end;
        // Hueco de columna → varios espacios; separación normal → uno; trozos pegados (palabra partida) → nada.
        if (line && !/\s$/.test(line) && !/^\s/.test(item.str))
          line += gap > charWidth * 2.5 ? "    " : gap > charWidth * 0.25 ? " " : "";
        line += item.str;
        end = item.x + item.width;
      }
      return line.replace(/[ \t]+$/, "");
    })
    .filter(Boolean);
}
