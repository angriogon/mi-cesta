import { useEffect, useRef, useState } from "react";
import { logError, reportError } from "../../lib/errors";

type Controls = { stop: () => void };
type Capabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { max: number } };

/**
 * Cámara trasera leyendo códigos EAN/UPC/Code128 con ZXing (que se descarga al abrir el escáner).
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
  onCode: (code: string) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const callbacks = useRef({ onCode, onError });
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    callbacks.current = { onCode, onError };
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setTorch(false);
    setTorchAvailable(false);
    void (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled || !video.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 70,
          delayBetweenScanSuccess: 900,
        });
        const started = await reader.decodeFromConstraints(
          {
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          },
          video.current,
          (result) => {
            const code = result?.getText().replace(/\D/g, "") ?? "";
            if (code.length >= 8) callbacks.current.onCode(code);
          },
        );
        if (cancelled) {
          started.stop();
          return;
        }
        controls.current = started;
        const track = (video.current.srcObject as MediaStream | null)?.getVideoTracks()[0];
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
      } catch (error) {
        if (!cancelled)
          callbacks.current.onError(
            (error as DOMException)?.name === "NotAllowedError"
              ? "Sin permiso para usar la cámara. Actívalo en Ajustes o escribe el código."
              : "No se pudo abrir la cámara. Introduce el código manualmente.",
          );
      }
    })();
    return () => {
      cancelled = true;
      controls.current?.stop();
      controls.current = null;
    };
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

  return { video, stop: () => controls.current?.stop(), torch, torchAvailable, toggleTorch };
}
