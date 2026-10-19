import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, openApp, openMenu } from "./helpers";

test("planificar la semana: 7 días, cambiar una comida, añadir lo que falta y se recuerda", async ({ page }) => {
  await openApp(page);
  await openMenu(page);
  await page.getByRole("button", { name: "Recetas con mi stock" }).click();
  await page.getByRole("button", { name: "Planificar la semana" }).click();

  const planner = page.getByRole("region", { name: "Plan de la semana" });
  await expect(planner.getByText("Tu semana")).toBeVisible();
  await expect(planner.getByText("Plan del hogar: lo ve igual toda la familia.")).toBeVisible();
  await expect(planner.getByRole("listitem")).toHaveCount(7);
  await expect(planner.getByText(/^Hoy · /)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Cambiar la comida de hoy no toca la cena.
  const firstMeal = planner
    .getByRole("listitem")
    .first()
    .locator("p", { hasText: /^Comida · / });
  const firstDinner = planner
    .getByRole("listitem")
    .first()
    .locator("p", { hasText: /^Cena · / });
  const before = await firstMeal.textContent();
  const dinner = await firstDinner.textContent();
  await planner
    .getByRole("button", { name: /^Cambiar comida del/ })
    .first()
    .click();
  await expect(planner.getByText("Comida cambiada. Las demás siguen igual.")).toBeVisible();
  await expect(firstMeal).not.toHaveText(before ?? "");
  await expect(firstDinner).toHaveText(dinner ?? "");
  const changed = await firstMeal.textContent();

  // Al cerrar y volver (y al recargar la app), el plan del hogar sigue igual.
  await planner.getByRole("button", { name: "Cerrar plan de la semana" }).click();
  await page.getByRole("button", { name: "Planificar la semana" }).click();
  await expect(firstMeal).toHaveText(changed ?? "");
  await page.reload();
  await page.getByLabel("Iniciando Cesta").waitFor({ state: "hidden" });
  await openMenu(page);
  await page.getByRole("button", { name: "Recetas con mi stock" }).click();
  await page.getByRole("button", { name: "Planificar la semana" }).click();
  await expect(firstMeal).toHaveText(changed ?? "");

  // Y la lista de recetas va en orden alfabético.
  await planner.getByRole("button", { name: "Cerrar plan de la semana" }).click();
  const titles = await page.locator("section.bg-card p.truncate").allTextContents();
  expect(titles.length).toBeGreaterThan(10);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));

  // Lo que falta para la semana pasa a la lista de la tienda.
  await page.getByRole("button", { name: "Planificar la semana" }).click();
  await planner.getByRole("button", { name: "Añadir lo que falta" }).click();
  await expect(page.getByText(/ingredientes añadidos a En tienda/)).toBeVisible();
  await expect(page.getByRole("tab", { name: /En tienda · [1-9]/ })).toBeVisible();
});
