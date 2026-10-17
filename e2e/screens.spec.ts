import { expect, test } from "@playwright/test";
import { addToPrepare, nav, openApp, openMenu } from "./helpers";

/**
 * Capturas de todas las pantallas en claro y en oscuro para revisar el diseño.
 * Solo se ejecuta a petición: `CESTA_SCREENS=carpeta npx playwright test screens --project iphone-webkit`.
 */
const folder = process.env.CESTA_SCREENS;
test.skip(!folder, "Capturas solo bajo demanda");

for (const scheme of ["light", "dark"] as const) {
  test(`capturas en ${scheme}`, async ({ page }) => {
    const shot = async (name: string) => {
      await expect(page.locator(".animate-spin")).toHaveCount(0);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${folder}/${scheme}-${name}.png` });
    };
    await page.addInitScript((theme) => localStorage.setItem("cesta-theme", theme), scheme);
    await openApp(page);
    await shot("1-inicio");

    await nav(page, "Compra").click();
    for (const name of ["Leche", "Pan", "Tomates", "Detergente"]) await addToPrepare(page, name);
    await shot("2-preparar");

    await page.getByRole("button", { name: /Generar lista/ }).click();
    await page.getByRole("button", { name: /Leche/ }).first().click();
    await shot("3-tienda");

    await nav(page, "Necesidades").click();
    await expect(page.getByText(/Necesidades|almacén/i).first()).toBeVisible();
    await shot("4-necesidades");

    await nav(page, "Tickets").click();
    await shot("5-tickets");

    await nav(page, /^Mascota/).click();
    await shot("6-mascota");

    await openMenu(page);
    await shot("7-menu");
    await page.getByRole("button", { name: "Recetas con mi stock" }).click();
    await expect(page.getByText("Recetas para decidir")).toBeVisible();
    await shot("8-recetas");
  });
}
