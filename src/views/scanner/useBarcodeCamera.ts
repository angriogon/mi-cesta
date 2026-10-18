import { useEffect, useRef, useState } from "react";
import { parseScannedCode, type ParsedCode } from "../../domain/barcode";
import { readCodes } from "../../lib/barcode-reader";
import { logError, reportError } from "../../lib/errors";

type Capabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { max: number } };

/** Lado mayor del recorte que se analiza: suficiente para un EAN a un palmo y rápido en el iPhone. */
const MAX_SIDE = 1280;

/**
 * Elige el código bueno de lo leído. Todo lo que lleva un GTIN (EAN, UPC, ITF-14, DataBar, GS1-128,
 * QR GS1) ya trae su dígito de control y vale a la primera; un Code 128 interno, que no lo tiene,
 * tiene que salir igual en dos fotogramas seguidos.
 */
export function acceptRead(
  reads: { text: string; format: string }[],
  previous: string,
): { parsed: ParsedCode | null; seen: string } {
  for (const read of reads) {
    const parsed = parseScannedCode(read.text, read.format);
    if (!parsed) continue;
    const checked = parsed.kind !== "interno" || !read.format.startsWith("Code128");
    if (checked || previous === read.text) return { parsed, seen: read.text };
    return { parsed: null, seen: read.text };
  }
  return { parsed: null, seen: "" };
}

/**
 * Cámara trasera leyendo los códigos de cualquier supermercado (ver `RETAIL_FORMATS`).
 * Analiza la zona del recuadro y, cada pocos fotogramas, la imagen entera (packs grandes).
 * Ajusta enfoque continuo y algo de zoom si el dispositivo lo permite, y ofrece la linterna.
 * `attempt` reinicia la cámara; `active` la apaga mientras se muestra un resultado.
 */
export function useBarcodeCamera({
  active,
  attempt,
  onCode,
  onError,
}: {
  active: boolean;
  attempt: number;
  onCode: (code: ParsedCode) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const callbacks = useRef({ onCode, onError });
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    callbacks.current = { onCode, onError };
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    stopRef.current = stop;
    setTorch(false);
    setTorchAvailable(false);

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        const element = video.current;
        if (stopped || !element) return stop();
        element.srcObject = stream;
        await element.play();
        tuneTrack(stream.getVideoTracks()[0], setTorchAvailable);

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Sin lienzo 2D");
        let frame = 0;
        let previous = "";
        const scan = async () => {
          if (stopped) return;
          if (element.readyState >= 2 && element.videoWidth) {
            // El recuadro de la pantalla está en el centro: se analiza esa franja, con margen.
            // Cada cuarto fotograma se mira la imagen entera, por si el código no cabe en el recuadro.
            const whole = frame++ % 4 === 3;
            const { videoWidth: w, videoHeight: h } = element;
            const cropW = whole ? w : w * 0.9;
            const cropH = whole ? h : h * 0.6;
            const scale = Math.min(1, MAX_SIDE / Math.max(cropW, cropH));
            canvas.width = Math.round(cropW * scale);
            canvas.height = Math.round(cropH * scale);
            context.drawImage(
              element,
              (w - cropW) / 2,
              (h - cropH) / 2,
              cropW,
              cropH,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const reads = await readCodes(context.getImageData(0, 0, canvas.width, canvas.height));
            const { parsed, seen } = acceptRead(reads, previous);
            previous = seen;
            if (parsed && !stopped) {
              callbacks.current.onCode(parsed);
              return;
            }
          }
          timer = window.setTimeout(() => void scan().catch(fail), 60);
        };
        await scan();
      } catch (error) {
        fail(error);
      }
    })();

    function fail(error: unknown) {
      if (stopped) return;
      stop();
      logError("escáner")(error);
      callbacks.current.onError(
        (error as DOMException)?.name === "NotAllowedError"
          ? "Sin permiso para usar la cámara. Actívalo en Ajustes, haz una foto del código o escríbelo."
          : "No se pudo abrir la cámara. Haz una foto del código o escríbelo.",
      );
    }

    return stop;
  }, [active, attempt]);

  async function toggleTorch() {
    const track = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch (error) {
      reportError(error, "linterna");
      setTorchAvailable(false);
    }
  }

  return { video, stop: () => stopRef.current(), torch, torchAvailable, toggleTorch };
}

/** Enfoque continuo, algo de zoom para acercar el código sin pegar el móvil, y si hay linterna. */
function tuneTrack(track: MediaStreamTrack | undefined, setTorchAvailable: (value: boolean) => void) {
  // Linterna, enfoque y zoom aún no están en los tipos DOM de TypeScript 7; el lint usa TypeScript 6, que sí los trae.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const capabilities = track?.getCapabilities?.() as Capabilities | undefined;
  setTorchAvailable(Boolean(capabilities?.torch));
  const advanced: MediaTrackConstraintSet[] = [];
  if (capabilities?.focusMode?.includes("continuous"))
    advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
  if (capabilities?.zoom && capabilities.zoom.max > 1)
    advanced.push({ zoom: Math.min(1.5, capabilities.zoom.max) } as MediaTrackConstraintSet);
  if (advanced.length) track?.applyConstraints({ advanced }).catch(logError("ajustar cámara"));
}
