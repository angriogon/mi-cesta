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

test("claro por defecto aunque el iPhone esté en oscuro; el oscuro se elige en el menú y se recuerda", async ({
  page,
}) => {
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

/** Con el texto más grande que sigue Cesta (Dynamic Type, 140 %), las pantallas siguen cabiendo en un iPhone SE. */
test("con texto grande del sistema nada se sale de la pantalla", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = "140%"));
  await expectNoHorizontalScroll(page);
  for (const view of ["Compra", "Necesidades", "Tickets"] as const) {
    await nav(page, view).click();
    await expectNoHorizontalScroll(page);
  }
  await nav(page, /^Mascota/).click();
  await expectNoHorizontalScroll(page);
});

/** Las páginas largas del menú se desplazan hasta el final (en iPhone SE, la pantalla más baja). */
test("las páginas del menú se pueden leer hasta el final", async ({ page }) => {
  await openApp(page);
  const reachEnd = async (text: string | RegExp) => {
    const end = page.getByText(text).last();
    await end.scrollIntoViewIfNeeded();
    await expect(end).toBeInViewport();
  };
  const back = () => page.getByRole("button", { name: "← Volver al menú" }).click();

  await openMenu(page);
  await page.getByRole("button", { name: "Privacidad y condiciones" }).click();
  await reachEnd("Para crear una cuenta debes tener al menos 14 años.");
  await page.getByRole("button", { name: "Condiciones" }).click();
  await reachEnd(/Se rigen por la ley española/);
  await back();
  await page.getByRole("button", { name: "Novedades" }).click();
  await reachEnd(/Recetas encadenadas/);
  await back();
  await page.getByRole("button", { name: "Equivalencias de tickets" }).click();
  await page.getByRole("button", { name: "Ver las de serie" }).click();
  await reachEnd("TOMATE PERA");
  // Y el final del propio menú (Eliminar cuenta / versión) también se alcanza.
  await back();
  await reachEnd(/Cesta · Versión/i);
});
