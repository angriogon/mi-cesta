const KEY = "cesta-reloaded-at";

/** Error al cargar un trozo de código que ya no existe (se publicó otra versión con la app abierta). */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload/i.test(
    message,
  );
}

/**
 * Recarga la página para tomar la versión publicada, una sola vez cada 30 s (si la recarga no lo
 * arregla, no se entra en un bucle). Devuelve si ha recargado.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento de sesión se recarga igualmente: es mejor que dejar la app rota.
  }
  window.location.reload();
  return true;
}

/**
 * Si se publica una versión nueva con Cesta abierta, la página antigua puede pedir trozos que el
 * servidor ya no tiene. En vez de fallar, se recarga y toma la versión nueva.
 */
export function recoverFromStaleChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
