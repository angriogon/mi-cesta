import { BellRing, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "../../app/push";
import { reportError } from "../../lib/errors";

const TEXT: Record<PushState, string> = {
  install:
    "Para recibir los avisos con Cesta cerrada, instálala: en Safari toca Compartir → «Añadir a pantalla de inicio» y ábrela desde allí.",
  unsupported: "Este navegador no admite avisos. Se avisará al abrir Cesta.",
  denied: "Los avisos están bloqueados. Actívalos en Ajustes → Notificaciones → Cesta.",
  off: "Recibe los avisos de la mascota en este dispositivo aunque Cesta esté cerrada.",
  on: "Este dispositivo recibe los avisos aunque Cesta esté cerrada.",
};

const TEST_SENT =
  "Te hemos enviado un aviso de prueba. Si no llega en un minuto, revisa Ajustes → Notificaciones → Cesta.";

/**
 * Activar o desactivar los avisos push de la mascota en este dispositivo. Al activarlos llega un aviso
 * de prueba, y se puede pedir otro cuando se quiera, para ver que funcionan sin esperar a un recordatorio.
 */
export function PushCard({ householdId, hasAlerts }: { householdId: string; hasAlerts: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function run(action: () => Promise<void>, done = "") {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await action();
      setState(await pushState());
      setInfo(done);
    } catch (failure) {
      reportError(failure, "avisos push");
      setError(failure instanceof Error ? failure.message : "No se ha podido cambiar.");
      setState(await pushState().catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  }

  const toggle = () =>
    state === "on"
      ? run(disablePush, "Avisos desactivados en este dispositivo.")
      : run(async () => {
          await enablePush(householdId);
          await sendTestPush();
        }, TEST_SENT);

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
          {state === "on" && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {hasAlerts
                ? "Llegan a la hora de cada recordatorio y, si algo de la mascota está bajo mínimos, entre las 10:00 y las 12:00."
                : "Aún no hay recordatorios ni artículos de la mascota: añádelos en Mantenimiento para recibir avisos."}
            </p>
          )}
          {info && (
            <p className="mt-1 text-xs font-semibold text-primary" role="status">
              {info}
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs font-semibold text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {(state === "off" || state === "on") && (
        <div className={state === "on" ? "mt-2 grid grid-cols-2 gap-2" : "mt-2"}>
          {state === "on" && (
            <button
              type="button"
              onClick={() => void run(sendTestPush, TEST_SENT)}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Enviar aviso de prueba
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-60 ${state === "on" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {state === "on" ? "Desactivar" : "Activar avisos"}
          </button>
        </div>
      )}
    </section>
  );
}
