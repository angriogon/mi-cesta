import { copy } from "../copy/es";
import { ChevronLeft, LoaderCircle, PackageCheck, Plus, Save, Sparkles, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { CestaApi } from "../data/api";
import type { BarcodeProduct, QuickItem, QuickSession } from "../data/types";
import { categoryForLocation, labelsFromOcr, LOCATIONS, mergeQuickItems, parseSpokenList } from "../domain/quick";
import { compressImage, recognizeText } from "../lib/image";
import { Button, Input } from "../ui/primitives";
import { BarcodeScanner } from "./BarcodeScanner";
import { CaptureActions } from "./quick/CaptureActions";
import { QuickItemList } from "./quick/QuickItemList";
import { useDictation } from "./quick/useDictation";
import { ZonePicker } from "./quick/ZonePicker";
import { LOAD_FAILED, notifyError, reportError } from "../lib/errors";

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<QuickSession[]>([]);

  useEffect(() => {
    api
      .quickInventory()
      .then((data) => setSessions(data.sessions))
      .catch(notifyError("cargar inventarios", LOAD_FAILED));
  }, [api]);

  const add = (incoming: QuickItem[]) => setItems((current) => mergeQuickItems(current, incoming));
  const dictation = useDictation({
    onText: (text) => {
      add(parseSpokenList(text, location, "voz", 0.82));
      setStatus("Dictado añadido. Revisa las cantidades.");
    },
    onStatus: setStatus,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    add(parseSpokenList(`${quantity} ${name}`, location, "manual", 0.95));
    setName("");
    setQuantity("1");
  }

  function addBarcode(product: BarcodeProduct) {
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

  async function fromPhoto(file: File) {
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
    }
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
      setStatus(error instanceof Error ? error.message : copy.errors.saveShort);
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
            aria-label={copy.common.close}
            className="flex size-10 items-center justify-center rounded-xl bg-card"
          >
            <X className="size-4" />
          </button>
        </header>

        {step === "location" ? (
          <ZonePicker
            sessions={sessions}
            location={location}
            onResume={(session) => {
              setSessionId(session.id);
              setLocation(session.location);
              setItems(session.items.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })));
              setStep("capture");
            }}
            onPick={(zone) => {
              setSessionId(null);
              setItems([]);
              setStatus("");
              setLocation(zone);
              setStep("capture");
            }}
          />
        ) : (
          <>
            <CaptureActions
              listening={dictation.listening}
              onScan={() => setScanning(true)}
              onDictate={dictation.toggle}
              onPhoto={fromPhoto}
              onTickets={() => void fromTickets()}
            />
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
                className="h-11 rounded-xl bg-card text-[0.9375rem]"
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
            <QuickItemList items={items} setItems={setItems} location={location} />
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
        {scanning && <BarcodeScanner api={api} continuous onClose={() => setScanning(false)} onUse={addBarcode} />}
      </div>
    </div>
  );
}
