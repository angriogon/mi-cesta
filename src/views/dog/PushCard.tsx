import { BellRing, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "../../app/push";
import { reportError } from "../../lib/errors";

const TEXT: Record<PushState, string> = {
  install:
    "Para recibir los avisos con Cesta cerrada, instálala: en Safari toca Compartir → «Añadir a pantalla de inicio» y ábrela desde allí.",
  unsupported: "Este navegador no admite avisos. Se avisará al abrir Cesta.",
  denied: "Los avisos están bloqueados. Actívalos en Ajustes → Notificaciones → Cesta.",
  off: "Recibe los avisos de la mascota en este dispositivo aunque Cesta esté cerrada.",
  on: "Este dispositivo recibe los avisos aunque Cesta esté cerrada.",
};

/** Activar o desactivar los avisos push de la mascota en este dispositivo. */
export function PushCard({ householdId }: { householdId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (state === "on") await disablePush();
      else await enablePush(householdId);
      setState(await pushState());
    } catch (failure) {
      reportError(failure, "avisos push");
      setError(failure instanceof Error ? failure.message : "No se ha podido cambiar.");
      setState(await pushState().catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  return (
    <section className="mt-3 rounded-xl bg-card p-3" aria-label="Avisos en este dispositivo">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <BellRing className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Avisos en este dispositivo</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{TEXT[state]}</p>
          {error && (
            <p className="mt-1 text-xs font-semibold text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {(state === "off" || state === "on") && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-60 ${state === "on" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}
        >
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {state === "on" ? "Desactivar avisos" : "Activar avisos"}
        </button>
      )}
    </section>
  );
}
