import { CalendarDays, Camera, CircleCheck, Euro, FileCheck2, Image, LoaderCircle, Pencil, Plus, ReceiptText, Trash2, TriangleAlert, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, type CestaApi } from "../data/api";
import type { PriceRef, Ticket, TicketItem, TicketReview } from "../data/types";
import { compareWithPlan, parseTicketText, reviewTicketLines } from "../domain/tickets";
import { compressImage, recognizeText } from "../lib/image";
import { centsToInput, formatCents, parseEuroToCents, todayIso } from "../lib/text";
import { Button, Input } from "../ui/primitives";
import type { Notify } from "../ui/Toast";

const MAX_BYTES = 10 * 1024 * 1024;

function LinesEditor({ items, onChange }: { items: TicketItem[]; onChange: (items: TicketItem[]) => void }) {
  const update = (index: number, patch: Partial<TicketItem>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_3.6rem_4.9rem_2rem] items-end gap-1.5 rounded-xl bg-muted/65 p-2">
          <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
            Producto
            <Input value={item.description} onChange={(event) => update(index, { description: event.target.value })} className="mt-1 h-9 rounded-lg bg-card px-2 text-sm" />
          </label>
          <label className="text-[10px] font-bold text-muted-foreground">
            Cant.
            <Input
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={item.quantity}
              onChange={(event) => update(index, { quantity: Math.max(0, Number(event.target.value) || 0) })}
              className="mt-1 h-9 rounded-lg bg-card px-1 text-center text-sm"
            />
          </label>
          <label className="text-[10px] font-bold text-muted-foreground">
            Importe
            <MoneyInput cents={item.lineTotalCents} onChange={(cents) => update(index, { lineTotalCents: cents })} className="mt-1 h-9 rounded-lg bg-card px-1 text-center text-sm" />
          </label>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Eliminar línea ${item.description}`}
            className="mb-0.5 flex size-8 items-center justify-center rounded-lg text-[#a34141] active:bg-red-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" onClick={() => onChange([...items, { description: "", quantity: 1, lineTotalCents: 0 }])} className="h-10 w-full rounded-xl text-xs">
        <Plus className="size-3.5" /> Añadir línea
      </Button>
    </div>
  );
}

/** Campo de importe que deja escribir "3,4" sin reformatear mientras se teclea. */
function MoneyInput({ cents, onChange, className }: { cents: number; onChange: (cents: number) => void; className?: string }) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseEuroToCents(text) !== cents) setText(centsToInput(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const value = event.target.value.replace(/[^0-9.,]/g, "");
        setText(value);
        const parsed = parseEuroToCents(value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setText(centsToInput(cents))}
      className={className}
    />
  );
}

export function TicketsView({ api, onStockChanged, notify }: { api: CestaApi; onStockChanged: () => void; notify: Notify }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reviews, setReviews] = useState<TicketReview[]>([]);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
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
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [prices, setPrices] = useState<PriceRef[]>([]);
  const [planned, setPlanned] = useState<{ name: string; quantity: number }[]>([]);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.tickets();
      setTickets(data.tickets);
      setReviews(data.reviews);
      setCorrections(Object.fromEntries(data.reviews.map((review) => [review.id, review.suggestion.proposedName || review.description])));
    } catch {
      setStatus("No se han podido cargar los tickets.");
    }
  }

  useEffect(() => {
    void load();
    api.prices().then((data) => setPrices(data.prices)).catch(() => undefined);
    api.purchaseSession().then((session) => setPlanned(session?.planned ?? [])).catch(() => undefined);
    const unsubscribe = api.db.subscribe((table) => {
      if (table === "tickets" || table === "ticket_reviews") void load();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const months = useMemo(() => {
    const map = new Map<string, number>();
    for (const ticket of tickets) map.set(ticket.purchasedAt.slice(0, 7), (map.get(ticket.purchasedAt.slice(0, 7)) ?? 0) + ticket.totalCents);
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [tickets]);
  const smartReview = useMemo(() => reviewTicketLines(lines, prices), [lines, prices]);
  const plan = useMemo(() => compareWithPlan(planned, lines), [planned, lines]);

  async function pick(selected: File | null) {
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setStatus("La foto supera 10 MB. Prueba con otra o recórtala.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setBusy(true);
    setProgress(2);
    setStatus("Preparando la foto…");
    const image = await compressImage(selected);
    setFile(image);
    setPreview(URL.createObjectURL(image));
    setStatus("Leyendo el ticket en este dispositivo…");
    try {
      const text = await recognizeText(image, setProgress);
      const parsed = parseTicketText(text);
      setRawText(text);
      setDate(parsed.purchasedAt);
      setTotal(parsed.total.replace(".", ","));
      setLines(parsed.items);
      if (parsed.merchant) setMerchant(parsed.merchant);
      setProgress(100);
      setStatus(parsed.total ? "Lectura terminada. Revisa los datos antes de guardar." : "Lectura terminada. Indica el total para guardar.");
    } catch {
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
      const result = await api.saveTicket({ image: file && file.size ? file : null, merchant, purchasedAt: date, totalCents, rawText, items: lines });
      void api.refreshPrices().catch(() => undefined);
      onStockChanged();
      clearForm();
      setStatus(
        `Ticket guardado. ${result.added} ${result.added === 1 ? "unidad añadida" : "unidades añadidas"} al almacén${result.reviews ? ` · ${result.reviews} para revisar` : ""}.`,
      );
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.updateTicket(editing);
      setEditing(null);
      setStatus("Cambios guardados correctamente.");
      await load();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se han podido guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(review: TicketReview) {
    setBusy(true);
    try {
      await api.resolveReview(review.id, corrections[review.id] || review.description);
      setStatus(review.issueType === "unidentified" ? "Corrección aprendida para próximos tickets." : "Revisión confirmada.");
      onStockChanged();
      await load();
    } catch {
      setStatus("No se ha podido guardar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(ticket: Ticket) {
    if (confirmDelete !== ticket.id) {
      setConfirmDelete(ticket.id);
      return;
    }
    setConfirmDelete(null);
    try {
      await api.deleteTicket(ticket.id);
      notify("Ticket eliminado. Las existencias no se modifican.");
      await load();
    } catch {
      notify("No se ha podido eliminar el ticket.");
    }
  }

  async function showPhoto(ticket: Ticket) {
    if (!ticket.imagePath) return;
    if (photo?.id === ticket.id) return setPhoto(null);
    const url = await api.ticketImageUrl(ticket.imagePath);
    if (url) setPhoto({ id: ticket.id, url });
    else notify("No se ha podido abrir la foto.");
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setControl((value) => !value);
            setEditing(null);
          }}
          aria-pressed={control}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold transition-colors ${control ? "bg-primary text-primary-foreground" : "border border-border bg-card text-primary"}`}
        >
          <Wrench className="size-3.5" /> {control ? "Listo" : "Control"}
        </button>
      </div>

      {reviews.length > 0 && (
        <section className="mb-4 rounded-[18px] border border-[#e6dfcf] bg-[#faf7ef] p-3 dark:border-border dark:bg-card">
          <div className="flex items-center gap-2 text-[#76582b] dark:text-foreground">
            <TriangleAlert className="size-4" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold">Solo hay que revisar {reviews.length}</h2>
              <p className="text-[10px] opacity-70">El resto del ticket ya se procesó automáticamente.</p>
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {reviews.slice(0, 8).map((review) => (
              <div key={review.id} className="rounded-xl bg-card p-2 dark:bg-muted">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{review.description}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {review.issueType === "unidentified"
                        ? "Producto sin identificar · escribe cómo se llama"
                        : review.issueType === "possible_duplicate"
                          ? "Posible duplicado"
                          : `Precio distinto al habitual${review.suggestion.previousPriceCents ? ` · antes ${formatCents(review.suggestion.previousPriceCents)}` : ""}`}
                    </p>
                  </div>
                  {review.issueType === "unidentified" && (
                    <Input
                      value={corrections[review.id] || ""}
                      onChange={(event) => setCorrections((current) => ({ ...current, [review.id]: event.target.value }))}
                      aria-label={`Corregir ${review.description}`}
                      className="h-9 max-w-36 rounded-lg text-xs"
                    />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolve(review)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf3eb] text-primary dark:bg-secondary"
                    aria-label="Confirmar revisión"
                  >
                    <CircleCheck className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-5 rounded-[22px] border border-border bg-card p-4 shadow-[0_12px_38px_rgba(32,47,38,.06)]" aria-labelledby="monthly-spend-title">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <h2 id="monthly-spend-title" className="text-sm font-bold">
            Gasto por meses
          </h2>
        </div>
        {months.length ? (
          <div className="mt-3 space-y-2">
            {months.slice(0, 6).map(([month, cents]) => (
              <div key={month} className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5">
                <span className="text-sm font-semibold capitalize">
                  {new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}
                </span>
                <span className="text-sm font-bold text-primary">{formatCents(cents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Cuando guardes el primer ticket aparecerá aquí el total de su mes.</p>
        )}
      </section>

      <form onSubmit={save} className="rounded-[22px] border border-border bg-card p-4 shadow-[0_12px_38px_rgba(32,47,38,.06)]">
        <h2 className="text-base font-bold">Añadir ticket</h2>
        <label className="mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/35 bg-[#f3f7f3] text-center text-primary dark:bg-muted">
          {preview ? (
            <img src={preview} alt="Vista previa del ticket" className="max-h-64 w-full object-contain" />
          ) : (
            <>
              <Camera className="size-7" />
              <span className="mt-2 text-sm font-bold">Fotografiar o elegir ticket</span>
              <span className="mt-1 text-xs text-muted-foreground">JPG, PNG o HEIC · máximo 10 MB</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
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
            className="mt-2 w-full py-1.5 text-center text-[11px] font-bold text-primary"
          >
            Añadir ticket sin foto
          </button>
        )}
        {(busy || status) && (
          <div className="mt-3 rounded-xl bg-muted/75 px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground" role="status">
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5 text-primary" />}
              {status}
            </p>
            {busy && progress > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}
        {file && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-bold text-muted-foreground">
              Supermercado
              <Input value={merchant} onChange={(event) => setMerchant(event.target.value)} maxLength={40} className="mt-1.5 h-11 rounded-xl bg-background text-sm" />
            </label>
            <label className="text-xs font-bold text-muted-foreground">
              Fecha
              <Input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} className="mt-1.5 h-11 rounded-xl bg-background text-sm" />
            </label>
            <label className="text-xs font-bold text-muted-foreground">
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
                <p className="text-xs font-bold">
                  {lines.length} {lines.length === 1 ? "línea" : "líneas"}
                </p>
                {!control && (
                  <button type="button" onClick={() => setControl(true)} className="flex items-center gap-1 py-1 text-[11px] font-bold text-primary">
                    <Pencil className="size-3" /> Revisar textos y cantidades
                  </button>
                )}
              </div>
              {(smartReview.duplicates.length > 0 || smartReview.unexpected.length > 0) && (
                <div className="mb-2 rounded-xl border border-[#ead8d1] bg-[#fbf4f1] p-2 text-[10px] text-[#854936] dark:border-border dark:bg-muted dark:text-foreground">
                  <p className="font-bold">Revisión inteligente</p>
                  {smartReview.duplicates.length > 0 && <p className="mt-1">Posibles duplicados: {smartReview.duplicates.map((item) => item.description).join(", ")}</p>}
                  {smartReview.unexpected.length > 0 && (
                    <p className="mt-1">Precio inesperado: {smartReview.unexpected.map((item) => `${item.name} (${formatCents(item.current)})`).join(", ")}</p>
                  )}
                </div>
              )}
              {plan && (
                <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-[#eaf3eb] p-2 text-center text-primary dark:bg-secondary">
                  <div>
                    <b className="block text-sm">{plan.planned}</b>
                    <span className="text-[9px]">Planeados</span>
                  </div>
                  <div>
                    <b className="block text-sm">{plan.found}</b>
                    <span className="text-[9px]">Verificados</span>
                  </div>
                  <div>
                    <b className="block text-sm">{plan.missing}</b>
                    <span className="text-[9px]">No vistos</span>
                  </div>
                </div>
              )}
              {control && <LinesEditor items={lines} onChange={setLines} />}
            </div>
            <p className="col-span-2 text-[11px] leading-5 text-muted-foreground">
              La lectura automática puede cometer errores: confirma siempre la fecha y el total antes de guardar.
            </p>
            <div className="col-span-2 grid grid-cols-[1fr_2fr] gap-2">
              <Button variant="outline" onClick={() => {
                clearForm();
                setStatus("");
              }} disabled={busy} className="h-12 rounded-2xl">
                Descartar
              </Button>
              <Button type="submit" disabled={busy || !total} className="h-12 rounded-2xl">
                <FileCheck2 className="size-4" /> Guardar ticket
              </Button>
            </div>
          </div>
        )}
      </form>

      {tickets.length > 0 && (
        <section className="mt-6" aria-labelledby="ticket-history-title">
          <h2 id="ticket-history-title" className="mb-2.5 px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Historial
          </h2>
          <div className="overflow-hidden rounded-[20px] border border-border bg-card">
            {tickets.slice(0, 30).map((ticket, index) => (
              <div key={ticket.id} className={index ? "border-t border-border/80" : ""}>
                <div className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => void showPhoto(ticket)}
                    disabled={!ticket.imagePath}
                    aria-label={ticket.imagePath ? `Ver foto del ticket de ${ticket.merchant}` : undefined}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary disabled:opacity-100"
                  >
                    {ticket.imagePath ? <Image className="size-4" /> : <ReceiptText className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{ticket.merchant}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ticket.purchasedAt.split("-").reverse().join("/")} · {ticket.items.length} {ticket.items.length === 1 ? "línea" : "líneas"}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{formatCents(ticket.totalCents)}</span>
                  {control && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...ticket, items: ticket.items.map((item) => ({ ...item })) })}
                        aria-label={`Editar ticket de ${ticket.merchant}`}
                        className="flex size-9 items-center justify-center rounded-lg bg-muted text-primary"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(ticket)}
                        aria-label={confirmDelete === ticket.id ? `Confirmar eliminar ticket de ${ticket.merchant}` : `Eliminar ticket de ${ticket.merchant}`}
                        className={`flex size-9 items-center justify-center rounded-lg ${confirmDelete === ticket.id ? "bg-[#a34141] text-white" : "bg-[#fbefeb] text-[#a34141]"}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {photo?.id === ticket.id && <img src={photo.url} alt={`Ticket de ${ticket.merchant}`} className="max-h-[70vh] w-full bg-muted object-contain" />}
                {editing?.id === ticket.id && (
                  <form onSubmit={saveEdit} className="border-t border-border/70 bg-[#f5f8f5] p-3 dark:bg-muted">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="col-span-2 text-[10px] font-bold text-muted-foreground">
                        Supermercado
                        <Input value={editing.merchant} onChange={(event) => setEditing({ ...editing, merchant: event.target.value })} className="mt-1 h-10 rounded-lg bg-card text-sm" />
                      </label>
                      <label className="text-[10px] font-bold text-muted-foreground">
                        Fecha
                        <Input type="date" value={editing.purchasedAt} onChange={(event) => setEditing({ ...editing, purchasedAt: event.target.value })} className="mt-1 h-10 rounded-lg bg-card text-sm" />
                      </label>
                      <label className="text-[10px] font-bold text-muted-foreground">
                        Total
                        <MoneyInput cents={editing.totalCents} onChange={(cents) => setEditing({ ...editing, totalCents: cents })} className="mt-1 h-10 rounded-lg bg-card text-sm" />
                      </label>
                    </div>
                    <div className="mt-3">
                      <LinesEditor items={editing.items} onChange={(items) => setEditing({ ...editing, items })} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => setEditing(null)} className="h-11 rounded-xl text-xs">
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={busy} className="h-11 rounded-xl text-xs">
                        Guardar cambios
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
