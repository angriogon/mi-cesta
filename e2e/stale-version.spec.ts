import { expect, test } from "@playwright/test";
import { openApp, openMenu } from "./helpers";

/**
 * Tras publicar una versión nueva con Cesta abierta, la página antigua pide trozos de código que el
 * servidor ya no tiene (404). La app se recarga sola en lugar de mostrar «Algo no ha ido bien».
 */
test("si falta una pantalla de la versión anterior, la app se recarga sola", async ({ page }) => {
  let missing = true;
  await page.route(/\/assets\/Menu-[\w-]+\.js$/, async (route) => {
    if (missing) {
      missing = false;
      await route.fulfill({ status: 404, body: "" });
    } else await route.continue();
  });
  await openApp(page);
  const reloaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await reloaded;
  await expect(page.getByText("Algo no ha ido bien")).toBeHidden();
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Equivalencias de tickets" })).toBeVisible();
});
