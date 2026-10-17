import { copy } from "../../copy/es";
import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { logError } from "../../lib/errors";

const HOUR = 60 * 60 * 1000;

/**
 * Aviso de versión nueva. La app no se actualiza sola a mitad de uso: la versión nueva espera
 * hasta que se toca «Actualizar» (o hasta el próximo arranque en frío).
 * Se busca una versión nueva cada hora y al volver a la app.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(logError("buscar actualización"));
      };
      setInterval(check, HOUR);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
    onRegisterError: logError("registrar service worker"),
  });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl bg-card p-3 text-sm shadow-float"
    >
      <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 font-semibold">{copy.update.title}</span>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="h-11 rounded-xl px-3 font-semibold text-muted-foreground"
      >
        {copy.update.later}
      </button>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
      >
        {copy.update.apply}
      </button>
    </div>
  );
}
