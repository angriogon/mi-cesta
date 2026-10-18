import { Camera, Euro, FileCheck2, LoaderCircle, Pencil, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { CestaApi } from "../data/api";
import { errorMessage } from "../app/errorMessage";
import { useTickets } from "../app/useTickets";
import type { PriceRef, TicketItem } from "../data/types";
import { parseTicketText } from "../domain/tickets";
import { parseEuroToCents, todayIso } from "../lib/text";
import { Button, Input } from "../ui/primitives";
import type { Notify } from "../ui/Toast";
import { reportError } from "../lib/errors";
import { LineChecks, LinesEditor } from "./tickets/fields";
import { readTicketFile } from "./tickets/readTicket";
import { MonthlySpend, ReviewsPanel, TicketHistory } from "./tickets/TicketLists";

const MAX_BYTES = 10 * 1024 * 1024;

export function TicketsView({
  api,
  prices,
  onStockChanged,
  notify,
}: {
  api: CestaApi;
  prices: PriceRef[];
  onStockChanged: () => void;
  notify: Notify;
}) {
  const ticketsState = useTickets(api, onStockChanged);
  const { tickets, reviews, planned, months } = ticketsState;
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("Mercadona");
  const [date, setDate] = useState(todayIso());
  const [total, setTotal] = useState("");
  const [rawText, setRawText] = useState("");
  const [lines, setLines] = useState<TicketItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [control, setControl] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(selected: File | null) {
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setStatus("El archivo supera 10 MB. Prueba con otro o recórtalo.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setBusy(true);
    setProgress(2);
    setStatus("Preparando el ticket…");
    setFile(new Blob());
    try {
      const text = await readTicketFile(selected, {
        onPhoto: (photo) => {
          setFile(photo);
          setPreview(URL.createObjectURL(photo));
        },
        onStatus: setStatus,
        onProgress: setProgress,
      });
      const parsed = parseTicketText(text);
      setRawText(text);
      setDate(parsed.purchasedAt);
      setTotal(parsed.total.replace(".", ","));
      setLines(parsed.items);
      if (parsed.merchant) setMerchant(parsed.merchant);
      setProgress(100);
      setStatus(
        parsed.total
          ? "Lectura terminada. Revisa los datos antes de guardar."
          : "Lectura terminada. Indica el total para guardar.",
      );
    } catch (error) {
      reportError(error, "tickets");
      setStatus("No se ha podido leer automáticamente. Puedes indicar la fecha, el total y las líneas a mano.");
    } finally {
      setBusy(false);
    }
  }

  function clearForm() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setRawText("");
    setLines([]);
    setTotal("");
    setProgress(0);
    setDate(todayIso());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const totalCents = parseEuroToCents(total);
    if (!totalCents) {
      setStatus("Indica el total del ticket (por ejemplo, 23,45).");
      return;
    }
    setBusy(true);
    setStatus("Guardando foto y gasto…");
    try {
      const result = await ticketsState.save({
        image: file && file.size ? file : null,
        merchant,
        purchasedAt: date,
        totalCents,
        rawText,
        items: lines,
      });
      clearForm();
      setStatus(
        `Ticket guardado. ${result.added} ${result.added === 1 ? "unidad añadida" : "unidades añadidas"} al almacén${result.reviews ? ` · ${result.reviews} para revisar` : ""}.`,
      );
    } catch (error) {
      setStatus(errorMessage(error, "No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setControl((value) => !value)}
          aria-pressed={control}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${control ? "bg-primary text-primary-foreground" : " bg-card text-primary"}`}
        >
          <Wrench className="size-3.5" /> {control ? "Listo" : "Control"}
        </button>
      </div>

      <ReviewsPanel reviews={reviews} resolveReview={ticketsState.resolveReview} onStatus={setStatus} />

      <MonthlySpend months={months} />

      <form onSubmit={save} className="rounded-xl bg-card p-4">
        <h2 className="text-base font-semibold">Añadir ticket</h2>
        <label className="mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/35 bg-card text-center text-primary">
          {preview ? (
            <img src={preview} alt="Vista previa del ticket" className="max-h-64 w-full object-contain" />
          ) : (
            <>
              <Camera className="size-7" />
              <span className="mt-2 text-sm font-semibold">Fotografiar o elegir ticket</span>
              <span className="mt-1 text-xs text-muted-foreground">Foto o PDF (ticket digital) · máximo 10 MB</span>
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              void pick(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        {!file && (
          <button
            type="button"
            onClick={() => {
              setFile(new Blob());
              setStatus("Introduce los datos del ticket a mano.");
            }}
            className="mt-2 w-full py-1.5 text-center text-xs font-semibold text-primary"
          >
            Añadir ticket sin foto
          </button>
        )}
        {(busy || status) && (
          <div className="mt-3 rounded-xl bg-muted/75 px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground" role="status">
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <FileCheck2 className="size-3.5 text-primary" />
              )}
              {status}
            </p>
            {busy && progress > 0 && (
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-card"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}
        {file && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-semibold text-muted-foreground">
              Supermercado
              <Input
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
                maxLength={40}
                className="mt-1.5 h-11 rounded-xl bg-background text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Fecha
              <Input
                type="date"
                value={date}
                max={todayIso()}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1.5 h-11 rounded-xl bg-background text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Total
              <div className="relative mt-1.5">
                <Euro className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  inputMode="decimal"
                  value={total}
                  onChange={(event) => setTotal(event.target.value.replace(/[^0-9.,]/g, ""))}
                  placeholder="0,00"
                  className="h-11 rounded-xl bg-background pl-8 text-sm"
                />
              </div>
            </label>
            <div className="col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {lines.length} {lines.length === 1 ? "línea" : "líneas"}
                </p>
                {!control && (
                  <button
                    type="button"
                    onClick={() => setControl(true)}
                    className="flex items-center gap-1 py-1 text-xs font-semibold text-primary"
                  >
                    <Pencil className="size-3" /> Revisar textos y cantidades
                  </button>
                )}
              </div>
              <LineChecks lines={lines} prices={prices} planned={planned} />
              {control && <LinesEditor items={lines} onChange={setLines} />}
            </div>
            <p className="col-span-2 text-xs leading-5 text-muted-foreground">
              La lectura automática puede cometer errores: confirma siempre la fecha y el total antes de guardar.
            </p>
            <div className="col-span-2 grid grid-cols-[1fr_2fr] gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  clearForm();
                  setStatus("");
                }}
                disabled={busy}
                className="h-12 rounded-xl"
              >
                Descartar
              </Button>
              <Button type="submit" disabled={busy || !total} className="h-12 rounded-xl">
                <FileCheck2 className="size-4" /> Guardar ticket
              </Button>
            </div>
          </div>
        )}
      </form>

      <TicketHistory
        tickets={tickets}
        control={control}
        ticketsState={ticketsState}
        notify={notify}
        onStatus={setStatus}
      />
    </>
  );
}
