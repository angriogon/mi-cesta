import { Camera, Flashlight, LoaderCircle, RotateCcw, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type CestaApi } from "../data/api";
import type { BarcodeProduct } from "../data/types";
import { Button, Input } from "../ui/primitives";
import { useBarcodeCamera } from "./scanner/useBarcodeCamera";

/** Escáner EAN/UPC con la cámara trasera; si no se reconoce, permite guardar el nombre. */
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
  const [manual, setManual] = useState("");
  const [unknownName, setUnknownName] = useState("");
  const [unknownCode, setUnknownCode] = useState("");
  const [status, setStatus] = useState("Acerca el código al recuadro y evita reflejos.");
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [attempt, setAttempt] = useState(0);
  const camera = useBarcodeCamera({
    active: !product && !unknownCode,
    attempt,
    onCode: (code) => {
      if (code !== lastCode.current) void lookup(code);
    },
    onError: setStatus,
  });

  async function lookup(raw: string) {
    const code = raw.replace(/\D/g, "").slice(0, 18);
    if (code.length < 8 || busyRef.current) return;
    busyRef.current = true;
    lastCode.current = code;
    camera.stop();
    setBusy(true);
    setUnknownCode("");
    setUnknownName("");
    setStatus("Identificando producto…");
    try {
      const found = await api.lookupBarcode(code);
      if (!found) {
        setUnknownCode(code);
        throw new Error("No conocemos este código. Dinos qué producto es y lo recordaremos.");
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

  async function saveUnknown(event: FormEvent) {
    event.preventDefault();
    if (!unknownCode || !unknownName.trim() || busy) return;
    setBusy(true);
    setStatus("Guardando el código para próximas veces…");
    try {
      setProduct(await api.saveBarcode(unknownCode, unknownName));
      setStatus("Producto guardado e identificado.");
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se ha podido guardar.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setProduct(null);
    setUnknownCode("");
    setUnknownName("");
    setManual("");
    lastCode.current = "";
    setStatus("Acerca el código al recuadro y evita reflejos.");
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
        {!product && !unknownCode && (
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
            <>
              <div className="flex gap-3">
                {product.image ? (
                  <img src={product.image} alt="" className="size-16 rounded-xl bg-card object-contain" />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-xl bg-muted">
                    <Camera className="size-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{product.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[product.brand, product.quantity].filter(Boolean).join(" · ")}
                  </p>
                  {product.source && (
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{product.source}</p>
                  )}
                  {product.allergens.length > 0 && (
                    <p className="mt-1 text-xs font-semibold text-danger">Alérgenos: {product.allergens.join(", ")}</p>
                  )}
                </div>
              </div>
              {Object.values(product.nutrients).some(Boolean) && (
                <div className="mt-3 grid grid-cols-5 gap-1 rounded-xl bg-muted p-2 text-center">
                  {(
                    [
                      ["kcal", product.nutrients.kcal],
                      ["prot.", product.nutrients.protein],
                      ["hidr.", product.nutrients.carbs],
                      ["grasas", product.nutrients.fat],
                      ["fibra", product.nutrients.fiber],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold">{Math.round(Number(value))}</p>
                      <p className="text-xs uppercase text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                <Button variant="outline" onClick={reset} className="h-12 rounded-xl">
                  <RotateCcw className="size-4" /> Otro
                </Button>
                <Button
                  onClick={() => {
                    onUse(product);
                    if (continuous) reset();
                  }}
                  className="h-12 rounded-xl"
                >
                  {continuous ? "Añadir y seguir" : "Usar este producto"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-xs font-semibold text-muted-foreground" role="status">
                {busy && <LoaderCircle className="mr-1 inline size-3.5 animate-spin" />}
                {status}
              </p>
              {unknownCode ? (
                <form onSubmit={saveUnknown} className="mt-3 rounded-xl bg-warning-soft p-3">
                  <label htmlFor="unknown-product-name" className="text-xs font-semibold text-warning">
                    ¿Qué producto es? · {unknownCode}
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
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
