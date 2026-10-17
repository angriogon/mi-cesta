import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Iniciando Cesta")).toBeHidden({ timeout: 15_000 });
}

export function nav(page: Page, name: "Inicio" | "Compra" | "Necesidades" | "Tickets" | RegExp) {
  return page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("button", { name: typeof name === "string" ? new RegExp(`^${name}`) : name });
}

export async function addToPrepare(page: Page, name: string) {
  const input = page.getByPlaceholder("Añadir producto…");
  await input.fill(name);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

/** Crea el PIN de mantenimiento la primera vez o lo introduce si ya existe. */
export async function unlockMaintenance(page: Page, pin = "1234") {
  await page.getByRole("button", { name: "Mantenimiento" }).click();
  const create = page.getByRole("button", { name: "Crear acceso de administrador" });
  if (await create.isVisible().catch(() => false)) {
    await page.locator("#admin-pin").fill(pin);
    await page.locator("#admin-pin-confirm").fill(pin);
    await create.click();
  } else if (
    await page
      .locator("#admin-pin")
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator("#admin-pin").fill(pin);
    await page.getByRole("button", { name: "Entrar con PIN" }).click();
  }
  await expect(page.getByRole("button", { name: "Listo" })).toBeVisible();
}

export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("dialog", { name: "Menú" })).toBeVisible();
}

/** Comprueba que nada se sale por los lados de la pantalla. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
