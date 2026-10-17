import { useState } from "react";
import { BUILD_TIME } from "../../app/config";
import { reportError } from "../../lib/errors";

const built = BUILD_TIME
  ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(BUILD_TIME))
  : "";

/**
 * Qué versión hay instalada y un botón para buscar otra. Si hay una nueva, aparece el aviso
 * «Hay una versión nueva de Cesta · Actualizar» (lo muestra UpdatePrompt).
 */
export function UpdateCheck() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setStatus("Buscando…");
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration) {
        setStatus("Esta versión no se actualiza sola (modo de pruebas).");
        return;
      }
      await registration.update();
      setStatus(
        registration.waiting || registration.installing
          ? "Hay una versión nueva: toca «Actualizar» en el aviso."
          : "Ya tienes la última versión.",
      );
    } catch (error) {
      reportError(error, "buscar actualización");
      setStatus("No se ha podido comprobar. Revisa la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {built && <span>Publicada el {built}</span>}
      <button
        type="button"
        onClick={() => void check()}
        disabled={busy}
        className="min-h-11 font-semibold text-primary disabled:opacity-60"
      >
        Buscar actualización
      </button>
      {status && (
        <output className="w-full" aria-live="polite">
          {status}
        </output>
      )}
    </div>
  );
}
