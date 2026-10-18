import { useCallback, useEffect, useMemo, useState } from "react";
import type { CestaApi } from "../data/api";
import type { Ticket, TicketReview } from "../data/types";
import { LOAD_FAILED, logError, notifyError, reportError, traced } from "../lib/errors";
import { isNetworkError, outboxFor } from "../data/outbox";

type NewTicket = Parameters<CestaApi["saveTicket"]>[0];
type SavedTicket = Awaited<ReturnType<CestaApi["saveTicket"]>>;

export interface TicketsState {
  tickets: Ticket[];
  reviews: TicketReview[];
  /** Lo que se planeó comprar en la última sesión, para compararlo con el ticket. */
  planned: { name: string; quantity: number }[];
  /** Gasto por mes (AAAA-MM → céntimos), del más reciente al más antiguo. */
  months: [string, number][];
  reload: () => Promise<void>;
  /** Sin conexión, el ticket queda en la cola y devuelve «queued». */
  save: (input: NewTicket) => Promise<SavedTicket | "queued">;
  update: (ticket: Ticket) => Promise<void>;
  resolveReview: (review: TicketReview, correctedName: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  photoUrl: (ticket: Ticket) => Promise<string | null>;
}

/**
 * Tickets del hogar y sus revisiones pendientes. Se recargan cuando otro dispositivo guarda uno.
 * `onStockChanged` avisa a la app cuando un ticket o una revisión cambian las existencias.
 */
export function useTickets(api: CestaApi, onStockChanged: () => void): TicketsState {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reviews, setReviews] = useState<TicketReview[]>([]);
  const [planned, setPlanned] = useState<{ name: string; quantity: number }[]>([]);

  const reload = useCallback(async () => {
    try {
      const data = await api.tickets();
      setTickets(data.tickets);
      setReviews(data.reviews);
    } catch (error) {
      reportError(error, "cargar tickets", LOAD_FAILED);
    }
  }, [api]);

  useEffect(() => {
    void reload();
    api
      .purchaseSession()
      .then((session) => setPlanned(session?.planned ?? []))
      .catch(notifyError("cargar compra prevista", LOAD_FAILED));
    return api.db.subscribe((table) => {
      if (table === "tickets" || table === "ticket_reviews") void reload();
    });
  }, [api, reload]);

  const months = useMemo(() => {
    const totals = new Map<string, number>();
    for (const ticket of tickets) {
      const month = ticket.purchasedAt.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + ticket.totalCents);
    }
    return [...totals.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [tickets]);

  /** Guarda el ticket; sin conexión queda en la cola y devuelve «queued». */
  const save = useCallback(
    async (input: NewTicket): Promise<SavedTicket | "queued"> => {
      let result: SavedTicket;
      try {
        result = await traced("guardar ticket", () => api.saveTicket(input));
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        await outboxFor(api.db.householdId).enqueue({ kind: "ticket", ticket: input });
        return "queued";
      }
      // Los precios aprenden de cada ticket; si falla, se reintentará en la siguiente actualización.
      void api.refreshPrices().catch(logError("actualizar precios tras ticket"));
      onStockChanged();
      await reload();
      return result;
    },
    [api, onStockChanged, reload],
  );

  const update = useCallback(
    async (ticket: Ticket) => {
      await traced("editar ticket", () => api.updateTicket(ticket));
      await reload();
    },
    [api, reload],
  );

  const resolveReview = useCallback(
    async (review: TicketReview, correctedName: string) => {
      await traced("resolver revisión", () => api.resolveReview(review.id, correctedName));
      onStockChanged();
      await reload();
    },
    [api, onStockChanged, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await traced("borrar ticket", () => api.deleteTicket(id));
      await reload();
    },
    [api, reload],
  );

  const photoUrl = useCallback((ticket: Ticket) => api.ticketImageUrl(ticket.imagePath ?? ""), [api]);

  return { tickets, reviews, planned, months, reload, save, update, resolveReview, remove, photoUrl };
}
