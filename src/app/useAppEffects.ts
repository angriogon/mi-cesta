import { useEffect, useState, type TouchEvent } from "react";
import type { CestaApi } from "../data/api";
import type { DogReminder } from "../data/types";
import { logError } from "../lib/errors";
import { deviceName, readJson, writeJson } from "../lib/storage";
import { todayIso } from "../lib/text";
import { preloadDailyScreens } from "./screens/lazy";

/** Pantalla de bienvenida: se desvanece al terminar la carga (o a los 1,4 s como mucho). */
export function useSplash(ready: boolean) {
  const [splash, setSplash] = useState(true);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setFading(true);
        window.setTimeout(() => setSplash(false), 220);
      },
      ready ? 0 : 1400,
    );
    return () => window.clearTimeout(timer);
  }, [ready]);
  return { splash, fading };
}

/** Con Inicio ya visible, se descargan en segundo plano las pantallas de uso diario. */
export function usePreloadScreens(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void preloadDailyScreens().catch(logError("precargar pantallas")), 1200);
    return () => window.clearTimeout(timer);
  }, [ready]);
}

/** Avisos de la mascota: se muestran dentro de la app y como notificación si hay permiso. */
export function usePetAlerts(ready: boolean, reminders: DogReminder[], petName: string) {
  const [alert, setAlert] = useState<DogReminder | null>(null);
  useEffect(() => {
    if (!ready || !reminders.some((reminder) => reminder.enabled)) return;
    function check() {
      const now = new Date();
      const today = todayIso(now);
      for (const reminder of reminders.filter((item) => item.enabled)) {
        const [hours, minutes] = reminder.reminderTime.split(":").map(Number);
        const due = now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes);
        const key = `cesta-dog-reminder-${reminder.id}-${today}`;
        if (!due || readJson(key, null)) continue;
        writeJson(key, "shown");
        setAlert((current) => current ?? reminder);
        if ("Notification" in window && Notification.permission === "granted") {
          const options = { body: reminder.title, tag: `cesta-dog-${reminder.id}-${today}` };
          navigator.serviceWorker?.ready
            .then((registration) =>
              registration.showNotification(`Aviso de ${petName}`, {
                ...options,
                icon: `${import.meta.env.BASE_URL}apple-touch-icon.png`,
              }),
            )
            .catch(() => {
              try {
                new Notification(`Aviso de ${petName}`, options);
              } catch {
                // iOS solo permite notificaciones desde el service worker.
              }
            });
        }
      }
    }
    check();
    const interval = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [reminders, ready, petName]);
  return { alert, setAlert };
}

/** Indica a los demás del hogar que alguien está comprando ahora (cada 25 s, solo en «En tienda»). */
export function useStorePresence(api: CestaApi, device: string, active: boolean, pending: number) {
  useEffect(() => {
    if (!active) return;
    const ping = () =>
      void api
        .activity(device, deviceName(), `${pending} ${pending === 1 ? "producto pendiente" : "productos pendientes"}`)
        .catch(logError("presencia en tienda"));
    ping();
    const interval = window.setInterval(ping, 25_000);
    return () => window.clearInterval(interval);
  }, [api, device, active, pending]);
}

/** El aviso de «guardado» empieza a contar cuando se cierra el diálogo de caducidades, para que se llegue a ver. */
export function useSavedNotice(expiryOpen: boolean) {
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    if (!savedCount || expiryOpen) return;
    const timer = window.setTimeout(() => setSavedCount(0), 3000);
    return () => window.clearTimeout(timer);
  }, [savedCount, expiryOpen]);
  return { savedCount, setSavedCount };
}

/** Deslizar hacia abajo desde arriba del todo para actualizar. */
export function usePullToRefresh(enabled: boolean, onRefresh: () => Promise<void>) {
  const [start, setStart] = useState<number | null>(null);
  const [pull, setPull] = useState(0);
  return {
    pull,
    handlers: {
      onTouchStart(event: TouchEvent) {
        if (window.scrollY <= 0 && enabled) setStart(event.touches[0]?.clientY ?? null);
      },
      onTouchMove(event: TouchEvent) {
        if (start === null || window.scrollY > 0) return;
        setPull(Math.min(88, Math.max(0, ((event.touches[0]?.clientY ?? start) - start) * 0.55)));
      },
      onTouchEnd() {
        setStart(null);
        if (pull < 58) return setPull(0);
        setPull(88);
        void onRefresh().finally(() => setPull(0));
      },
    },
  };
}
