import {
  Camera,
  ChevronLeft,
  LoaderCircle,
  MapPin,
  Mic,
  PackageCheck,
  Plus,
  ReceiptText,
  Save,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CestaApi } from "../data/api";
import type { BarcodeProduct, QuickItem, QuickSession } from "../data/types";
import { categoryForLocation, labelsFromOcr, LOCATIONS, mergeQuickItems, parseSpokenList } from "../domain/quick";
import { compressImage, recognizeText } from "../lib/image";
import { Button, Input } from "../ui/primitives";
import { BarcodeScanner } from "./BarcodeScanner";
import { LOAD_FAILED, notifyError, reportError } from "../lib/errors";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechCtor = new () => SpeechRecognitionLike;

export function QuickInventory({
  api,
  onClose,
  onCommitted,
}: {
  api: CestaApi;
  onClose: () => void;
  onCommitted: () => Promise<void>;
}) {
  const [step, setStep] = useState<"location" | "capture">("location");
  const [location, setLocation] = useState<string>(LOCATIONS[0]);
  const [items, setItems] = useState<QuickItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [scanning, setScanning] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<QuickSession[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .quickInventory()
      .then((data) => setSessions(data.sessions))
      .catch(notifyError("cargar inventarios", LOAD_FAILED));
    return () => recognition.current?.stop();
  }, [api]);

  const counts = useMemo(
    () => ({
      ready: items.filter((item) => item.confidence >= 0.8).length,
      review: items.filter((item) => item.confidence < 0.8).length,
    }),
    [items],
  );

  const add = (incoming: QuickItem[]) => setItems((current) => mergeQuickItems(current, incoming));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    add(parseSpokenList(`${quantity} ${name}`, location, "manual", 0.95));
    setName("");
    setQuantity("1");
  }

  function useBarcode(product: BarcodeProduct) {
    add([
      {
        id: crypto.randomUUID(),
        name: product.name,
        quantity: 1,
        category: categoryForLocation(product.name, location),
        unit: product.quantity || "unidad",
        confidence: 0.99,
        source: "código",
      },
    ]);
    navigator.vibrate?.(35);
  }

  async function fromTickets() {
    setBusy(true);
    setStatus("Preparando productos de tickets recientes…");
    try {
      const data = await api.quickInventory();
      add(
        data.recentTicketItems.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          source: "ticket",
          confidence: 0.9,
        })),
      );
      setStatus(
        data.recentTicketItems.length
          ? `${data.recentTicketItems.length} productos propuestos desde tickets de las últimas dos semanas.`
          : "No hay tickets de las últimas dos semanas.",
      );
    } catch (error) {
      reportError(error, "inventario rápido");
      setStatus("No se han podido cargar los tickets.");
    } finally {
      setBusy(false);
    }
  }

  async function fromPhoto(file: File | null) {
    if (!file) return;
    setBusy(true);
    setStatus("Leyendo etiquetas visibles de la balda…");
    try {
      const text = await recognizeText(await compressImage(file));
      const labels = labelsFromOcr(text, location);
      add(labels);
      setStatus(
        labels.length
          ? `${labels.length} etiquetas propuestas. Revisa nombres y cantidades.`
          : "No se han reconocido etiquetas. Prueba con más luz o usa el dictado.",
      );
    } catch (error) {
      reportError(error, "inventario rápido");
      setStatus("No se ha podido leer la fotografía. Prueba con más luz o utiliza el dictado.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function dictate() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech =
      (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;
    if (!Speech) {
      setStatus(
        "El dictado no está disponible en este navegador. Usa el micrófono del teclado y separa los productos con comas.",
      );
      return;
    }
    const instance = new Speech();
    instance.lang = "es-ES";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      add(parseSpokenList(text, location, "voz", 0.82));
      setStatus("Dictado añadido. Revisa las cantidades.");
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => {
      setListening(false);
      setStatus("No se ha entendido el dictado. Puedes repetirlo o escribirlo.");
    };
    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  async function persist(action: "save" | "commit") {
    if (!items.length) return;
    setBusy(true);
    setStatus(action === "save" ? "Guardando para continuar después…" : "Incorporando existencias al almacén…");
    try {
      if (action === "save") {
        setSessionId(await api.saveQuickSession(sessionId, location, items));
        setStatus("Inventario guardado. Puedes cerrar y continuar más tarde.");
      } else {
        const count = await api.commitQuickSession(sessionId, location, items);
        await onCommitted();
        setStatus(`${count} ${count === 1 ? "producto incorporado" : "productos incorporados"}.`);
        window.setTimeout(onClose, 700);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se ha podido guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-background">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(.7rem+env(safe-area-inset-top))]">
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={step === "location" ? onClose : () => setStep("location")}
            aria-label="Volver"
            className="flex size-10 items-center justify-center rounded-xl bg-card"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase text-primary">Inventario rápido</p>
            <h1 className="truncate text-lg font-semibold">{step === "location" ? "Elige una zona" : location}</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-xl bg-card"
          >
            <X className="size-4" />
          </button>
        </header>

        {step === "location" ? (
          <section className="mt-5">
            <p className="text-xs leading-5 text-muted-foreground">
              Trabaja por zonas: cuenta lo que hay en cada una y se suma a tus existencias. Puedes guardar el progreso y
              continuar en otro momento.
            </p>
            {sessions.length > 0 && (
              <div className="mt-3 space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSessionId(session.id);
                      setLocation(session.location);
                      setItems(session.items.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })));
                      setStep("capture");
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-primary/20 bg-muted px-3 py-2.5 text-left"
                  >
                    <span>
                      <b className="block text-[12px] text-primary">Continuar {session.location}</b>
                      <small className="text-xs text-muted-foreground">
                        {session.items.length} productos guardados
                      </small>
                    </span>
                    <ChevronLeft className="size-4 rotate-180 text-primary" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {LOCATIONS.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => {
                    setSessionId(null);
                    setItems([]);
                    setStatus("");
                    setLocation(zone);
                    setStep("capture");
                  }}
                  className={`min-h-20 rounded-xl border p-3 text-left ${zone === location ? "border-primary bg-muted text-primary " : " bg-card"}`}
                >
                  <MapPin className="size-4" />
                  <span className="mt-2 block text-[12px] font-semibold leading-4">{zone}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="flex min-h-16 flex-col items-center justify-center rounded-lg bg-card text-xs font-semibold"
              >
                <ScanLine className="mb-1 size-4 text-primary" />
                Escanear
              </button>
              <button
                type="button"
                onClick={dictate}
                aria-pressed={listening}
                className={`flex min-h-16 flex-col items-center justify-center rounded-lg border text-xs font-semibold ${listening ? "border-primary bg-primary text-white" : " bg-card"}`}
              >
                <Mic className="mb-1 size-4" />
                {listening ? "Escuchando" : "Dictar"}
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex min-h-16 flex-col items-center justify-center rounded-lg bg-card text-xs font-semibold"
              >
                <Camera className="mb-1 size-4 text-primary" />
                Foto balda
              </button>
              <button
                type="button"
                onClick={() => void fromTickets()}
                className="flex min-h-16 flex-col items-center justify-center rounded-lg bg-card text-xs font-semibold"
              >
                <ReceiptText className="mb-1 size-4 text-primary" />
                Tickets
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => void fromPhoto(event.target.files?.[0] ?? null)}
              />
            </div>
            <form onSubmit={submit} className="mt-3 grid grid-cols-[4rem_1fr_2.8rem] gap-1.5">
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.,]/g, ""))}
                aria-label="Cantidad"
                className="h-11 rounded-xl bg-card text-center text-sm"
              />
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Producto o varios separados por comas"
                aria-label="Producto"
                className="h-11 rounded-xl bg-card text-[15px]"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!name.trim()}
                aria-label="Añadir"
                className="size-11 rounded-xl"
              >
                <Plus className="size-4" />
              </Button>
            </form>
            {(busy || status) && (
              <p
                className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs leading-4 text-muted-foreground"
                role="status"
              >
                {busy ? (
                  <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                )}
                {status}
              </p>
            )}
            {items.length > 0 && (
              <section className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{items.length} productos</p>
                  <p className="text-xs text-muted-foreground">
                    <b className="text-primary">{counts.ready}</b> listos ·{" "}
                    <b className="text-warning">{counts.review}</b> revisar
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg bg-card">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[1fr_4rem_2.2rem] items-center gap-1.5 px-2 py-2 ${index ? "border-t-[0.5px] border-separator" : ""}`}
                    >
                      <div className="min-w-0">
                        <Input
                          value={item.name}
                          aria-label="Nombre del producto"
                          onChange={(event) =>
                            setItems((list) =>
                              list.map((entry) =>
                                entry.id === item.id
                                  ? {
                                      ...entry,
                                      name: event.target.value,
                                      category: categoryForLocation(event.target.value, location),
                                      confidence: 0.95,
                                    }
                                  : entry,
                              ),
                            )
                          }
                          className="h-9 border-0 bg-transparent px-1 text-[13px] font-semibold"
                        />
                        <p
                          className={`px-1 text-xs font-semibold ${item.confidence >= 0.8 ? "text-primary" : "text-warning"}`}
                        >
                          {item.confidence >= 0.8 ? "Identificado" : "Revisar"} · {item.source} · {item.category}
                        </p>
                      </div>
                      <Input
                        inputMode="decimal"
                        value={item.quantity}
                        aria-label={`Cantidad de ${item.name}`}
                        onChange={(event) =>
                          setItems((list) =>
                            list.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    quantity: Math.max(0.01, Number(event.target.value.replace(",", ".")) || 1),
                                  }
                                : entry,
                            ),
                          )
                        }
                        className="h-9 rounded-lg text-center text-sm font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setItems((list) => list.filter((entry) => entry.id !== item.id))}
                        aria-label={`Eliminar ${item.name}`}
                        className="flex size-9 items-center justify-center text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="sticky bottom-0 mt-5 grid grid-cols-[1fr_1.35fr] gap-2 bg-gradient-to-t from-background via-background to-transparent pb-2 pt-5">
              <Button
                variant="outline"
                disabled={busy || !items.length}
                onClick={() => void persist("save")}
                className="h-12 rounded-xl text-xs"
              >
                <Save className="size-4" /> Guardar
              </Button>
              <Button
                disabled={busy || !items.length}
                onClick={() => void persist("commit")}
                className="h-12 rounded-xl text-xs"
              >
                <PackageCheck className="size-4" /> Incorporar al almacén
              </Button>
            </div>
          </>
        )}
        {scanning && <BarcodeScanner api={api} continuous onClose={() => setScanning(false)} onUse={useBarcode} />}
      </div>
    </div>
  );
}
