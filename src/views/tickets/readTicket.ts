import { prepareTicketPhoto, recognizeText } from "../../lib/image";
import { isPdf, readPdfTicket } from "../../lib/pdf";
import { readText } from "../../lib/storage";

/**
 * Lee un ticket elegido en Tickets: foto (se recorta y se pasa por el OCR) o PDF (su texto se usa
 * tal cual; si es un PDF escaneado, sus páginas pasan por el OCR). Todo en el propio dispositivo.
 */
export async function readTicketFile(
  file: File,
  {
    onPhoto,
    onStatus,
    onProgress,
  }: {
    onPhoto: (photo: Blob) => void;
    onStatus: (status: string) => void;
    onProgress: (percent: number) => void;
  },
): Promise<string> {
  if (isPdf(file)) {
    onStatus("Abriendo el PDF…");
    const pdf = await readPdfTicket(file);
    if (pdf.photo) onPhoto(pdf.photo);
    if (pdf.text) return pdf.text;
    onStatus("El PDF es una imagen: leyéndolo en este dispositivo…");
    const pages: string[] = [];
    for (const [index, scan] of pdf.scans.entries())
      pages.push(
        await recognizeText(scan, (percent) => onProgress((index * 100 + percent) / pdf.scans.length), { block: true }),
      );
    return pages.join("\n");
  }
  const { photo, ocr } = await prepareTicketPhoto(file);
  onPhoto(photo);
  onStatus("Leyendo el ticket en este dispositivo…");
  const text = await recognizeText(ocr, onProgress, { block: true });
  // Diagnóstico del lector (banco de tickets reales): localStorage "cesta-debug-ocr" = "1".
  if (readText("cesta-debug-ocr") === "1")
    console.info("[ocr]", JSON.stringify({ text, image: ocr.toDataURL("image/png") }));
  return text;
}
