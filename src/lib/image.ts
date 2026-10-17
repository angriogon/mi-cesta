/**
 * Reduce la foto a un JPEG de tamaño razonable: la lectura es más rápida
 * y la subida ocupa mucho menos. Si el navegador no puede decodificarla (HEIC), devuelve el original.
 */
export async function compressImage(file: File, maxSide = 1800, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Reconoce texto en español con Tesseract (en el propio dispositivo). */
export async function recognizeText(image: Blob, onProgress?: (percent: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
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
    const result = await worker.recognize(image);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}
