import { expect, test } from "@playwright/test";
import { addToPrepare, nav, openApp, openMenu } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("el súper por defecto se elige en Precios y se nota en la tienda", async ({ page }) => {
  // Un ticket de Mercadona enseña a Cesta lo que cuesta la leche.
  await nav(page, "Tickets").click();
  await page.getByRole("button", { name: "Añadir ticket sin foto" }).click();
  await page.getByRole("button", { name: "Revisar textos y cantidades" }).click();
  await page.getByRole("button", { name: "Añadir línea" }).click();
  await page.getByLabel("Producto", { exact: true }).first().fill("LECHE ENTERA");
  await page.getByLabel("Importe").first().fill("1,10");
  await page.getByPlaceholder("0,00").fill("1,10");
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await expect(page.getByText(/Ticket guardado/)).toBeVisible();

  await nav(page, "Compra").click();
  await addToPrepare(page, "Leche entera");
  await page.getByRole("button", { name: "Generar lista" }).click();
  await expect(page.getByText("Presupuesto · 1,10 €")).toBeVisible();
  await expect(page.getByTitle("Último precio en Mercadona")).toBeVisible();

  await openMenu(page);
  await page.getByRole("button", { name: "Precios" }).click();
  await expect(page.getByRole("radio", { name: "El último que pagué" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "DIA" }).click();
  await expect(page.getByText(/En la compra verás los precios de DIA/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "DIA" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Actualizar precios" }).click();
  await expect(page.getByText(/precios al día|No hay precios nuevos/)).toBeVisible();
  await page.getByRole("button", { name: "← Volver al menú" }).click();
  await expect(page.getByText("En la compra, precios de DIA")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar menú" }).last().click();

  // En DIA aún no se ha comprado leche: se ve el precio de Mercadona, como referencia.
  await expect(page.getByText("Presupuesto en DIA · 1,10 €")).toBeVisible();
  await expect(page.getByTitle("Último precio en Mercadona")).toHaveClass(/text-muted-foreground/);
});
