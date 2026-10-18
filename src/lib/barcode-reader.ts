import type * as ZXingReader from "zxing-wasm/reader";
import type { ReaderOptions } from "zxing-wasm/reader";

/**
 * Lector de códigos de barras: ZXing C++ compilado a WebAssembly, servido desde la propia app
 * (sin CDN) y descargado solo al abrir el escáner. Más rápido y tolerante que la versión en
 * JavaScript: lee códigos girados, invertidos, pequeños o con poca luz.
 */

/** Formatos de los supermercados: envases, packs, etiquetas de la balanza y QR GS1. */
export const RETAIL_FORMATS: ReaderOptions["formats"] = [
  "EAN13",
  "EAN8",
  "UPCA",
  "UPCE",
  "ITF14",
  "Code128",
  "DataBar",
  "DataBarExp",
  "DataBarLtd",
  "DataBarExpStk",
  "DataBarStk",
  "QRCode",
];

export interface ReadCode {
  text: string;
  format: string;
}

let reader: Promise<typeof ZXingReader> | null = null;

function loadReader() {
  reader ??= (async () => {
    const [zxing, { default: wasmUrl }] = await Promise.all([
      import("zxing-wasm/reader"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    await zxing.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
      fireImmediately: true,
    });
    return zxing;
  })().catch((error: unknown) => {
    reader = null;
    throw error;
  });
  return reader;
}

/**
 * Opciones de lectura, también girados. `thorough` prueba además colores invertidos (código claro
 * sobre fondo oscuro) y varios códigos a la vez: para fotos, donde la velocidad importa menos que
 * acertar. Los datos GS1 salen legibles: «(01)08412345678905(3103)000500».
 */
export const readerOptions = (thorough: boolean): ReaderOptions => ({
  formats: RETAIL_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: thorough,
  tryDownscale: true,
  maxNumberOfSymbols: thorough ? 4 : 1,
  textMode: "HRI",
});

/** Lee los códigos válidos de un fotograma o de una foto. */
export async function readCodes(input: ImageData | Blob, thorough = false): Promise<ReadCode[]> {
  const zxing = await loadReader();
  const results = await zxing.readBarcodes(input, readerOptions(thorough));
  return results.filter((result) => result.isValid).map((result) => ({ text: result.text, format: result.format }));
}
