import { findPaper, ocrSize, type Box } from "./paper";

type Source = ImageBitmap | HTMLImageElement;

/** Abre la foto respetando la orientación de la cámara. Si `createImageBitmap` no puede (HEIC en algunos navegadores), usa <img>. */
async function decode(file: Blob): Promise<Source> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Este navegador no puede preparar la foto.");
  context.imageSmoothingQuality = "high";
  return { element, context };
}

function size(source: Source) {
  return "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

/** Dónde está el ticket en la foto original (o la foto entera si no se distingue el papel). */
function locateTicket(source: Source): Box {
  const full = size(source);
  const scale = Math.min(1, 600 / Math.max(full.width, full.height));
  const small = canvas(Math.max(1, Math.round(full.width * scale)), Math.max(1, Math.round(full.height * scale)));
  small.context.drawImage(source, 0, 0, small.element.width, small.element.height);
  const { data } = small.context.getImageData(0, 0, small.element.width, small.element.height);
  const box = findPaper(data, small.element.width, small.element.height);
  if (!box) return { x: 0, y: 0, ...full };
  return {
    x: Math.round(box.x / scale),
    y: Math.round(box.y / scale),
    width: Math.min(full.width, Math.round(box.width / scale)),
    height: Math.min(full.height, Math.round(box.height / scale)),
  };
}

/**
 * Escala de grises con la luz igualada: divide cada píxel por el fondo de papel de su zona
 * (así desaparecen sombras, arrugas y degradados) y estira el contraste.
 */
function evenLight(target: { element: HTMLCanvasElement; context: CanvasRenderingContext2D }) {
  const { width, height } = target.element;
  const image = target.context.getImageData(0, 0, width, height);
  const step = 24;
  const tiny = canvas(Math.max(1, Math.round(width / step)), Math.max(1, Math.round(height / step)));
  tiny.context.drawImage(target.element, 0, 0, tiny.element.width, tiny.element.height);
  // El fondo es lo más claro de cada zona: un máximo local quita la tinta de la media.
  const tinyImage = tiny.context.getImageData(0, 0, tiny.element.width, tiny.element.height);
  const tw = tiny.element.width;
  const th = tiny.element.height;
  const bright = new Uint8ClampedArray(tinyImage.data.length);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let max = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(th - 1, Math.max(0, y + dy));
          const xx = Math.min(tw - 1, Math.max(0, x + dx));
          const i = (yy * tw + xx) * 4;
          max = Math.max(
            max,
            0.299 * tinyImage.data[i] + 0.587 * tinyImage.data[i + 1] + 0.114 * tinyImage.data[i + 2],
          );
        }
      }
      const o = (y * tw + x) * 4;
      bright[o] = bright[o + 1] = bright[o + 2] = max;
      bright[o + 3] = 255;
    }
  }
  tiny.context.putImageData(new ImageData(bright, tw, th), 0, 0);
  const background = canvas(width, height);
  background.context.drawImage(tiny.element, 0, 0, width, height);
  const bg = background.context.getImageData(0, 0, width, height).data;

  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const level = (gray / Math.max(40, bg[i])) * 255;
    const value = Math.max(0, Math.min(255, ((level - 70) * 255) / (235 - 70)));
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  target.context.putImageData(image, 0, 0);
}

export interface TicketPhoto {
  /** Foto recortada al ticket, en JPEG, para guardar y enseñar. */
  photo: Blob;
  /** Imagen preparada para leer: ticket ampliado, en grises y con la luz igualada. */
  ocr: HTMLCanvasElement;
}

/** Prepara la foto de un ticket: busca el papel, lo recorta, lo amplía y le iguala la luz. */
export async function prepareTicketPhoto(file: File): Promise<TicketPhoto> {
  const source = await decode(file);
  try {
    const box = locateTicket(source);

    const out = ocrSize(box.width, box.height);
    const ocr = canvas(out.width, out.height);
    ocr.context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    evenLight(ocr);

    const keep = Math.min(1, 2400 / Math.max(box.width, box.height));
    const kept = canvas(Math.max(1, Math.round(box.width * keep)), Math.max(1, Math.round(box.height * keep)));
    kept.context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, kept.element.width, kept.element.height);
    const photo = await new Promise<Blob | null>((resolve) => kept.element.toBlob(resolve, "image/jpeg", 0.8));
    return { photo: photo ?? file, ocr: ocr.element };
  } finally {
    if ("close" in source) source.close();
  }
}

/**
 * Reduce la foto a un JPEG de tamaño razonable: la lectura es más rápida
 * y la subida ocupa mucho menos. Si el navegador no puede decodificarla (HEIC), devuelve el original.
 */
export async function compressImage(file: File, maxSide = 1800, quality = 0.82): Promise<Blob> {
  try {
    const source = await decode(file);
    const full = size(source);
    const scale = Math.min(1, maxSide / Math.max(full.width, full.height));
    const target = canvas(Math.round(full.width * scale), Math.round(full.height * scale));
    target.context.drawImage(source, 0, 0, target.element.width, target.element.height);
    if ("close" in source) source.close();
    const blob = await new Promise<Blob | null>((resolve) => target.element.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Reconoce texto en español con Tesseract (en el propio dispositivo).
 * `block`: lee la imagen como un único bloque de líneas, que es como está escrito un ticket.
 */
export async function recognizeText(
  image: Blob | HTMLCanvasElement,
  onProgress?: (percent: number) => void,
  { block = false }: { block?: boolean } = {},
): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");
  // Motor e idioma servidos por la propia app (ver vite.config.ts): sin CDN de terceros.
  const ocr = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  const worker = await createWorker("spa", 1, {
    workerPath: `${ocr}worker.min.js`,
    corePath: ocr,
    langPath: ocr.replace(/\/$/, ""),
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") onProgress?.(Math.max(5, Math.round(message.progress * 100)));
    },
  });
  try {
    if (block) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const result = await worker.recognize(image);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}
