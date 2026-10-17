import { Camera, Mic, ReceiptText, ScanLine } from "lucide-react";
import { useRef } from "react";

const TILE = "flex min-h-16 flex-col items-center justify-center rounded-lg text-xs font-semibold";

/** Formas de añadir productos a la zona: código de barras, voz, foto de la balda o tickets recientes. */
export function CaptureActions({
  listening,
  onScan,
  onDictate,
  onPhoto,
  onTickets,
}: {
  listening: boolean;
  onScan: () => void;
  onDictate: () => void;
  onPhoto: (file: File) => Promise<void>;
  onTickets: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4 grid grid-cols-4 gap-1.5">
      <button type="button" onClick={onScan} className={`${TILE} bg-card`}>
        <ScanLine className="mb-1 size-4 text-primary" />
        Escanear
      </button>
      <button
        type="button"
        onClick={onDictate}
        aria-pressed={listening}
        className={`${TILE} border ${listening ? "border-primary bg-primary text-primary-foreground" : "border-transparent bg-card"}`}
      >
        <Mic className="mb-1 size-4" />
        {listening ? "Escuchando" : "Dictar"}
      </button>
      <button type="button" onClick={() => fileInput.current?.click()} className={`${TILE} bg-card`}>
        <Camera className="mb-1 size-4 text-primary" />
        Foto balda
      </button>
      <button type="button" onClick={onTickets} className={`${TILE} bg-card`}>
        <ReceiptText className="mb-1 size-4 text-primary" />
        Tickets
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          // Se vacía al terminar para poder elegir la misma foto otra vez.
          void onPhoto(file).finally(() => {
            if (fileInput.current) fileInput.current.value = "";
          });
        }}
      />
    </div>
  );
}
