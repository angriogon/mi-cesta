import { copy } from "../copy/es";
import { ImageUp, Flashlight, LoaderCircle, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError, type CestaApi } from "../data/api";
import type { BarcodeProduct } from "../data/types";
import { parseScannedCode, type ParsedCode } from "../domain/barcode";
import { readCodes } from "../lib/barcode-reader";
import { logError } from "../lib/errors";
import { Button, Input } from "../ui/primitives";
import { ScannedProduct } from "./scanner/ScannedProduct";
import { useBarcodeCamera } from "./scanner/useBarcodeCamera";

const AIM = "Acerca el código al recuadro y evita reflejos.";

/**
 * Escáner de códigos de cualquier supermercado con la cámara trasera, con una foto o a mano.
 * Si no se reconoce el producto, permite guardar su nombre para las próximas veces.
 */
export function BarcodeScanner({
  api,
  onClose,
  onUse,
  continuous = false,
}: {
  api: CestaApi;
  onClose: () => void;
  onUse: (product: BarcodeProduct) => void;
  continuous?: boolean;
}) {
  const busyRef = useRef(false);
  const lastCode = useRef("");
  const photoInput = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState("");
  const [unknownName, setUnknownName] = useState("");
  const [unknown, setUnknown] = useState<ParsedCode | null>(null);
  const [parsed, setParsed] = useState<ParsedCode | null>(null);
  const [status, setStatus] = useState(AIM);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [attempt, setAttempt] = useState(0);
  const camera = useBarcodeCamera({
    active: !product && !unknown,
    attempt,
    onCode: (code) => {
      if (code.code !== lastCode.current) void lookup(code);
    },
    onError: setStatus,
  });

  async function lookup(input: ParsedCode | string) {
    if (busyRef.current) return;
    busyRef.current = true;
    camera.stop();
    setBusy(true);
    setUnknown(null);
    setUnknownName("");
    setStatus("Identificando producto…");
    try {
      const code = typeof input === "string" ? parseScannedCode(input) : input;
      if (!code) {
        // La API explica qué le pasa al código escrito (pocos números o dígito de control erróneo).
        if (typeof input === "string") await api.lookupBarcode(input);
        return;
      }
      lastCode.current = code.code;
      setParsed(code);
      const found = await api.lookupBarcode(code);
      if (!found) {
        setUnknown(code);
        setStatus(
          code.kind === "peso-variable"
            ? "Es una etiqueta de la balanza del súper. Dinos qué es y la reconoceremos aunque cambie el precio."
            : "No conocemos este código. Dinos qué producto es y lo recordaremos.",
        );
        return;
      }
      navigator.vibrate?.(45);
      setProduct(found);
      setStatus("Producto identificado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se ha podido identificar.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Foto del código: más nítida que el vídeo para códigos pequeños, curvos o con poca luz. */
  async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    camera.stop();
    setBusy(true);
    setStatus("Buscando el código en la foto…");
    try {
      const reads = await readCodes(file, true);
      const code = reads.map((read) => parseScannedCode(read.text, read.format)).find(Boolean);
      setBusy(false);
      if (code) return void lookup(code);
      setStatus("No se ve ningún código en la foto. Acércate más, con luz y sin reflejos, o escríbelo.");
    } catch (error) {
      logError("leer foto de código")(error);
      setBusy(false);
      setStatus("No se ha podido leer la foto. Prueba otra vez o escribe el código.");
    }
  }

  async function saveUnknown(event: FormEvent) {
    event.preventDefault();
    if (!unknown || !unknownName.trim() || busy) return;
    setBusy(true);
    setStatus("Guardando el código para próximas veces…");
    try {
      setProduct(await api.saveBarcode(unknown, unknownName));
      setUnknown(null);
      setStatus("Producto guardado e identificado.");
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : copy.errors.saveShort);
    } finally {
      setBusy(false);
    }
  }

  function correct() {
    if (!parsed || !product) return;
    setUnknown(parsed);
    setUnknownName(product.name);
    setProduct(null);
    setStatus("Escribe el nombre correcto: lo recordaremos para este código.");
  }

  function reset() {
    setProduct(null);
    setParsed(null);
    setUnknown(null);
    setUnknownName("");
    setManual("");
    lastCode.current = "";
    setStatus(AIM);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 px-4 py-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear producto"
    >
      <section className="mx-auto max-w-[420px] overflow-hidden rounded-xl bg-background">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ScanLine className="size-4 text-primary" /> Escanear producto
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar escáner"
            className="flex size-10 items-center justify-center rounded-xl bg-card"
          >
            <X className="size-4" />
          </button>
        </div>
        {!product && !unknown && (
          <div className="relative aspect-[4/3] overflow-hidden bg-black">
            <video key={attempt} ref={camera.video} muted playsInline className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-[27%_7%] rounded-xl border-2 border-white/90 shadow-float">
              <span className="absolute inset-x-4 top-1/2 h-px bg-red-400/90 shadow-float" />
            </div>
            {camera.torchAvailable && (
              <button
                type="button"
                onClick={() => void camera.toggleTorch()}
                aria-label={camera.torch ? "Apagar linterna" : "Encender linterna"}
                className={`absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full border border-white/30 ${camera.torch ? "bg-white text-primary" : "bg-black/45 text-white"}`}
              >
                <Flashlight className="size-4" />
              </button>
            )}
          </div>
        )}
        <div className="p-4">
          {product ? (
            <ScannedProduct
              product={product}
              parsed={parsed}
              continuous={continuous}
              onAnother={reset}
              onCorrect={correct}
              onUse={() => {
                onUse(product);
                if (continuous) reset();
              }}
            />
          ) : (
            <>
              <p className="text-center text-xs font-semibold text-muted-foreground" role="status">
                {busy && <LoaderCircle className="mr-1 inline size-3.5 animate-spin" />}
                {status}
              </p>
              {unknown ? (
                <form onSubmit={saveUnknown} className="mt-3 rounded-xl bg-warning-soft p-3">
                  <label htmlFor="unknown-product-name" className="text-xs font-semibold text-warning">
                    ¿Qué producto es? · {unknown.code}
                  </label>
                  <Input
                    id="unknown-product-name"
                    value={unknownName}
                    onChange={(event) => setUnknownName(event.target.value)}
                    placeholder="Nombre del producto"
                    // Al no reconocer el código, el siguiente paso es escribir el nombre: abrir el teclado ahorra un toque.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="mt-1.5 h-11 rounded-lg text-[1.0625rem]"
                  />
                  <Button
                    type="submit"
                    disabled={!unknownName.trim() || busy}
                    className="mt-2 h-11 w-full rounded-xl text-xs"
                  >
                    Guardar y usar
                  </Button>
                  <Button variant="ghost" onClick={reset} className="mt-1 h-10 w-full rounded-xl text-xs">
                    Escanear otro
                  </Button>
                </form>
              ) : (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void lookup(manual);
                    }}
                    className="mt-3 flex gap-2"
                  >
                    <Input
                      value={manual}
                      onChange={(event) => setManual(event.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      enterKeyHint="search"
                      placeholder="Código EAN"
                      aria-label="Código EAN"
                      className="h-11 rounded-xl text-base"
                    />
                    <Button type="submit" disabled={manual.length < 8 || busy} className="h-11 rounded-xl px-3 text-xs">
                      Buscar
                    </Button>
                  </form>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => void readPhoto(event)}
                    className="hidden"
                    aria-label="Foto del código"
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => photoInput.current?.click()}
                    className="mt-2 h-11 w-full rounded-xl text-xs"
                  >
                    <ImageUp className="size-4" /> Hacer una foto del código
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
