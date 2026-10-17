/**
 * Política única de errores: ningún fallo se descarta sin dejar rastro.
 *
 * - `logError(contexto)`: tareas opcionales (limpiezas, presencia, linterna). Solo deja traza en consola.
 * - `notifyError(contexto, mensaje)`: lo que el usuario espera ver (cargar, guardar). Deja traza y muestra un aviso.
 *
 * Los avisos repetidos se agrupan: si falla la red, diez cargas fallidas producen un solo aviso.
 */

type Notifier = (message: string) => void;

const REPEAT_WINDOW_MS = 5000;

let notifier: Notifier | null = null;
const lastShown = new Map<string, number>();

/** La app registra aquí su sistema de avisos (toast). Devuelve la función para desregistrarlo. */
export function setErrorNotifier(next: Notifier): () => void {
  notifier = next;
  return () => {
    if (notifier === next) notifier = null;
  };
}

/** Deja traza del error y, si se indica `userMessage`, avisa al usuario (sin repetir el mismo aviso seguido). */
export function reportError(error: unknown, context: string, userMessage?: string): void {
  console.error(`[cesta] ${context}`, error);
  if (!userMessage || !notifier) return;
  const now = Date.now();
  if (now - (lastShown.get(userMessage) ?? 0) < REPEAT_WINDOW_MS) return;
  lastShown.set(userMessage, now);
  notifier(userMessage);
}

export const logError =
  (context: string) =>
  (error: unknown): void =>
    reportError(error, context);

export const notifyError =
  (context: string, userMessage: string) =>
  (error: unknown): void =>
    reportError(error, context, userMessage);

export const LOAD_FAILED = "No se han podido cargar algunos datos. Comprueba la conexión.";
export const SAVE_FAILED = "No se ha podido guardar. Comprueba la conexión.";

/** Solo para pruebas. */
export function resetErrorsForTests(): void {
  notifier = null;
  lastShown.clear();
}
