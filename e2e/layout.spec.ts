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

test("en modo oscuro el texto sigue siendo legible", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openApp(page);
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { bg: body.backgroundColor, fg: body.color, dark: document.documentElement.classList.contains("dark") };
  });
  expect(colors.dark).toBe(true);
  expect(colors.bg).not.toBe(colors.fg);
});
