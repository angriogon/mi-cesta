import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, nav, openApp, openMenu } from "./helpers";

/** En pantallas pequeñas (iPhone SE) ninguna vista debe desbordarse horizontalmente. */
test("ninguna vista se sale de la pantalla", async ({ page }) => {
  await openApp(page);
  await expectNoHorizontalScroll(page);
  for (const view of ["Compra", "Necesidades", "Tickets"] as const) {
    await nav(page, view).click();
    await expectNoHorizontalScroll(page);
  }
  await nav(page, /^Mascota/).click();
  await expectNoHorizontalScroll(page);
  await openMenu(page);
  await page.getByRole("button", { name: "Recetas con mi stock" }).click();
  await expect(page.getByText("Recetas para decidir")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("claro por defecto aunque el iPhone esté en oscuro; el oscuro se elige en el menú y se recuerda", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openApp(page);
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(await isDark()).toBe(false);
  await openMenu(page);
  await page.getByRole("switch", { name: /Cambiar a oscuro/ }).click();
  expect(await isDark()).toBe(true);
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { bg: body.backgroundColor, fg: body.color };
  });
  expect(colors.bg).not.toBe(colors.fg);
  await page.reload();
  await expect(page.getByLabel("Iniciando Cesta")).toBeHidden({ timeout: 15_000 });
  expect(await isDark()).toBe(true);
  await openMenu(page);
  await page.getByRole("switch", { name: /Cambiar a claro/ }).click();
  expect(await isDark()).toBe(false);
});
