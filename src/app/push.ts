import { supabase } from "./config";

/**
 * Estado de los avisos en este dispositivo:
 * - install: iPhone sin la app instalada (iOS solo permite avisos desde la pantalla de inicio).
 * - unsupported: el navegador no admite avisos push.
 * - denied: se rechazó el permiso (se cambia en Ajustes del iPhone).
 */
export type PushState = "install" | "unsupported" | "denied" | "off" | "on";

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return isIos() && !isInstalled() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

/** Clave pública VAPID en base64url → bytes, como la pide pushManager.subscribe. */
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Pide permiso y registra este dispositivo para recibir los avisos del hogar. */
export async function enablePush(householdId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Sin permiso no se pueden enviar avisos. Puedes darlo en Ajustes.");
  const { data: config } = await supabase().from("push_config").select("public_key").maybeSingle();
  if (!config?.public_key) throw new Error("Los avisos se están preparando. Vuelve a probar en unos minutos.");
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(config.public_key),
    }));
  const json = subscription.toJSON();
  const { error } = await supabase()
    .from("push_subscriptions")
    .upsert({
      endpoint: subscription.endpoint,
      household_id: householdId,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
    });
  if (error) throw new Error("No se han podido activar los avisos. Inténtalo de nuevo.");
}

/** Deja de recibir avisos en este dispositivo. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}
