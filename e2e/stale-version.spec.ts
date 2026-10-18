import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

// Sin service worker: así el 404 simulado lo recibe siempre la página (y no la instalación del worker).
test.use({ serviceWorkers: "block" });

/**
 * Tras publicar una versión nueva con Cesta abierta, la página antigua pide trozos de código que el
 * servidor ya no tiene (404). La app se recarga sola (y así toma la versión nueva, con otros nombres
 * de archivo) en lugar de quedarse en «Algo no ha ido bien».
 *
 * Solo se comprueba la recarga: WebKit recuerda que un módulo falló y, como aquí la versión es la
 * misma, al recargar volvería a pedir el mismo archivo; en producción ya sería otro.
 */
test("si falta una pantalla de la versión anterior, la app se recarga sola", async ({ page }) => {
  await page.route(/\/assets\/Menu-[\w-]+\.js$/, (route) =>
    route.fulfill({ status: 404, body: "", headers: { "Cache-Control": "no-store" } }),
  );
  // La precarga de pantallas pediría el menú antes de tocarlo: se espera a que la app esté lista.
  await openApp(page);
  let loads = 0;
  page.on("load", () => loads++);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect.poll(() => loads, { message: "la app debe recargarse sola" }).toBeGreaterThan(0);
  await expect(page.getByLabel("Iniciando Cesta")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Todo en calma" })).toBeVisible();
});
