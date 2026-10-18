import type { PDFPageProxy } from "pdfjs-dist";
import { linesFromItems, type PdfTextItem } from "./pdf-lines";

/** Páginas como mucho: un ticket ocupa una o dos. */
const MAX_PAGES = 4;

export interface PdfTicket {
  /** Texto del PDF por líneas (vacío si es una imagen escaneada). */
  text: string;
  /** Primera página como JPEG, para guardar y enseñar como foto del ticket. */
  photo: Blob | null;
  /** Páginas dibujadas para leerlas con OCR cuando el PDF no trae texto. */
  scans: HTMLCanvasElement[];
}

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Dibuja una página a un ancho dado (en píxeles). */
async function render(page: PDFPageProxy, width: number) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

/**
 * Lee un ticket en PDF (por ejemplo, el ticket digital de Mercadona) en el propio dispositivo.
 * Si el PDF trae texto se usa tal cual (exacto, sin OCR); si es una imagen escaneada, se dibujan
 * sus páginas para pasarlas por el lector de fotos.
 */
export async function readPdfTicket(file: Blob): Promise<PdfTicket> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loading.promise;
  try {
    const lines: string[] = [];
    const pages: PDFPageProxy[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
      const page = await pdf.getPage(number);
      pages.push(page);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = content.items.flatMap((item) => {
        if (!("str" in item)) return [];
        // Matriz [a, b, c, d, x, y]: posición en x, y; d es la altura de la letra.
        const [, , , d, x, y] = item.transform as number[];
        return [{ str: item.str, x, y, width: item.width, height: item.height || Math.abs(d) }];
      });
      lines.push(...linesFromItems(items));
    }
    const text = lines.join("\n");
    const hasText = text.replace(/\s/g, "").length >= 20;

    const first = await render(pages[0], 900);
    const photo = await new Promise<Blob | null>((resolve) => first.toBlob(resolve, "image/jpeg", 0.85));
    const scans = hasText ? [] : await Promise.all(pages.map((page) => render(page, 1300)));
    return { text: hasText ? text : "", photo, scans };
  } finally {
    await loading.destroy();
  }
}
