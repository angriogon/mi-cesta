import { CalendarDays, CircleCheck, Image, Pencil, ReceiptText, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../app/errorMessage";
import type { TicketsState } from "../../app/useTickets";
import type { Ticket, TicketReview } from "../../data/types";
import { formatCents } from "../../lib/text";
import { Button, Input } from "../../ui/primitives";
import type { Notify } from "../../ui/Toast";
import { LinesEditor, MoneyInput } from "./fields";

/** Líneas del ticket que necesitan una decisión: producto sin identificar, duplicado o precio raro. */
export function ReviewsPanel({
  reviews,
  resolveReview,
  onStatus,
}: {
  reviews: TicketReview[];
  resolveReview: TicketsState["resolveReview"];
  onStatus: (message: string) => void;
}) {
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Propuesta de corrección por revisión; se rehace cuando llegan revisiones nuevas.
  useEffect(() => {
    setCorrections(
      Object.fromEntries(reviews.map((review) => [review.id, review.suggestion.proposedName || review.description])),
    );
  }, [reviews]);

  async function resolve(review: TicketReview) {
    setBusy(true);
    try {
      await resolveReview(review, corrections[review.id] || review.description);
      onStatus(
        review.issueType === "unidentified" ? "Corrección aprendida para próximos tickets." : "Revisión confirmada.",
      );
    } catch {
      onStatus("No se ha podido guardar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  if (!reviews.length) return null;
  return (
    <section className="mb-4 rounded-xl bg-warning-soft p-3">
      <div className="flex items-center gap-2 text-warning">
        <TriangleAlert className="size-4" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold">Solo hay que revisar {reviews.length}</h2>
          <p className="text-xs">El resto del ticket ya se procesó automáticamente.</p>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {reviews.slice(0, 8).map((review) => (
          <div key={review.id} className="rounded-xl bg-card p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{review.description}</p>
                <p className="text-xs text-muted-foreground">
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
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
                aria-label="Confirmar revisión"
              >
                <CircleCheck className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MonthlySpend({ months }: { months: [string, number][] }) {
  return (
    <section className="mb-5 rounded-xl bg-card p-4" aria-labelledby="monthly-spend-title">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 text-primary" />
        <h2 id="monthly-spend-title" className="text-sm font-semibold">
          Gasto por meses
        </h2>
      </div>
      {months.length ? (
        <div className="mt-3 space-y-2">
          {months.slice(0, 6).map(([month, cents]) => (
            <div key={month} className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5">
              <span className="text-sm font-semibold capitalize">
                {new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(
                  new Date(`${month}-01T00:00:00Z`),
                )}
              </span>
              <span className="text-sm font-semibold text-primary">{formatCents(cents)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cuando guardes el primer ticket aparecerá aquí el total de su mes.
        </p>
      )}
    </section>
  );
}

/** Historial de tickets: foto, y en modo control, edición y borrado (con confirmación). */
export function TicketHistory({
  tickets,
  control,
  ticketsState,
  notify,
  onStatus,
}: {
  tickets: Ticket[];
  control: boolean;
  ticketsState: TicketsState;
  notify: Notify;
  onStatus: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Salir del modo control cierra la edición abierta.
  useEffect(() => setEditing(null), [control]);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await ticketsState.update(editing);
      setEditing(null);
      onStatus("Cambios guardados correctamente.");
    } catch (error) {
      onStatus(errorMessage(error, "No se han podido guardar los cambios."));
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
      await ticketsState.remove(ticket.id);
      notify("Ticket eliminado. Las existencias no se modifican.");
    } catch {
      notify("No se ha podido eliminar el ticket.");
    }
  }

  async function showPhoto(ticket: Ticket) {
    if (!ticket.imagePath) return;
    if (photo?.id === ticket.id) return setPhoto(null);
    const url = await ticketsState.photoUrl(ticket);
    if (url) setPhoto({ id: ticket.id, url });
    else notify("No se ha podido abrir la foto.");
  }

  if (!tickets.length) return null;
  return (
    <section className="mt-6" aria-labelledby="ticket-history-title">
      <h2 id="ticket-history-title" className="mb-2.5 px-1 text-[12px] font-semibold uppercase text-muted-foreground">
        Historial
      </h2>
      <div className="overflow-hidden rounded-xl bg-card">
        {tickets.slice(0, 30).map((ticket, index) => (
          <div key={ticket.id} className={index ? "border-t-[0.5px] border-separator" : ""}>
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
                <p className="truncate text-sm font-semibold">{ticket.merchant}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ticket.purchasedAt.split("-").reverse().join("/")} · {ticket.items.length}{" "}
                  {ticket.items.length === 1 ? "línea" : "líneas"}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatCents(ticket.totalCents)}</span>
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
                    aria-label={
                      confirmDelete === ticket.id
                        ? `Confirmar eliminar ticket de ${ticket.merchant}`
                        : `Eliminar ticket de ${ticket.merchant}`
                    }
                    className={`flex size-9 items-center justify-center rounded-lg ${confirmDelete === ticket.id ? "bg-danger text-white" : "bg-danger-soft text-danger"}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
            {photo?.id === ticket.id && (
              <img
                src={photo.url}
                alt={`Ticket de ${ticket.merchant}`}
                className="max-h-[70vh] w-full bg-muted object-contain"
              />
            )}
            {editing?.id === ticket.id && (
              <form onSubmit={saveEdit} className="border-t-[0.5px] border-separator bg-card p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 text-xs font-semibold text-muted-foreground">
                    Supermercado
                    <Input
                      value={editing.merchant}
                      onChange={(event) => setEditing({ ...editing, merchant: event.target.value })}
                      className="mt-1 h-10 rounded-lg bg-card text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Fecha
                    <Input
                      type="date"
                      value={editing.purchasedAt}
                      onChange={(event) => setEditing({ ...editing, purchasedAt: event.target.value })}
                      className="mt-1 h-10 rounded-lg bg-card text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Total
                    <MoneyInput
                      cents={editing.totalCents}
                      onChange={(cents) => setEditing({ ...editing, totalCents: cents })}
                      className="mt-1 h-10 rounded-lg bg-card text-sm"
                    />
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
  );
}
