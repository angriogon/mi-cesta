import { useEffect, useRef, useState } from "react";
import type { CestaApi } from "../data/api";
import { outboxFor } from "../data/outbox";
import { reportError } from "../lib/errors";

export const OFFLINE_SAVED = "Sin conexión: el cambio se guardará en cuanto vuelva la red.";

/**
 * Envía la cola de cambios hechos sin conexión (almacén, mascota y tickets): al abrir la app, al
 * volver la red y al volver a la app. Devuelve cuántos cambios esperan; `onSynced` refresca los datos.
 */
export function useOfflineQueue(api: CestaApi, onSynced: () => void) {
  const [pending, setPending] = useState(0);
  const synced = useRef(onSynced);
  synced.current = onSynced;

  useEffect(() => {
    const outbox = outboxFor(api.db.householdId);
    const unsubscribe = outbox.subscribe(setPending);
    const flush = () => {
      if (!navigator.onLine) return;
      void outbox
        .flush(api, (_entry, error) =>
          reportError(
            error,
            "cola sin conexión",
            "Un cambio hecho sin conexión ya no se podía aplicar y se ha descartado.",
          ),
        )
        .then(({ sent }) => {
          if (sent) synced.current();
        })
        .catch((error: unknown) => reportError(error, "cola sin conexión"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [api]);

  return pending;
}
