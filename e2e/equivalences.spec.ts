import { expect, test } from "@playwright/test";
import { jsPDF } from "jspdf";
import { nav, openApp, openMenu } from "./helpers";

function ticketPdf(lines: string[]): Buffer {
  // jsPDF pone la página en vertical: ancho 320 pt, suficiente para la columna de importes.
  const doc = new jsPDF({ unit: "pt", format: [320, 400] });
  doc.setFont("courier");
  doc.setFontSize(9);
  lines.forEach((line, index) => doc.text(line, 12, 20 + index * 14));
  return Buffer.from(doc.output("arraybuffer"));
}

const TICKET = [
  "MERCADONA, S.A. A-46103834",
  "28/09/2026 11:39 OP: 2259972",
  "1 PECHUGA FAMILIAR                   7,35",
  "1 24 HUEVOS FRESCOS                  5,25",
  "1 BOLSA PLASTICO                     0,15",
  "TOTAL (EUR)                         12,75",
];

test("equivalencias: el ticket suma al producto elegido y se puede cambiar línea a línea", async ({ page }) => {
  await openApp(page);
  // 1. En el menú: PECHUGA FAMILIAR → Pollo entero (en lugar de la de serie, Pechuga de pollo).
  await openMenu(page);
  await page.getByRole("button", { name: "Equivalencias de tickets" }).click();
  await page.getByLabel("Texto del ticket").fill("pechuga familiar");
  await page.getByRole("button", { name: "Añadir" }).click();
  const picker = page.getByRole("dialog", { name: "PECHUGA FAMILIAR" });
  await picker.getByLabel("Buscar producto").fill("pollo entero");
  await picker.getByRole("button", { name: /^Pollo entero/ }).click();
  await expect(page.getByRole("button", { name: "Cambiar el producto de pechuga familiar" })).toContainText(
    "Pollo entero",
  );
  await page.getByRole("button", { name: "Cerrar menú" }).last().click();

  // 2. El ticket: la pechuga va a Pollo entero, los huevos a Huevos L (de serie) y la bolsa queda sin producto.
  await nav(page, "Tickets").click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: ticketPdf(TICKET) });
  await expect(page.getByText(/Lectura terminada/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 línea sin producto del almacén")).toBeVisible();
  await page.getByRole("button", { name: "Asignar productos" }).click();
  await expect(page.getByRole("button", { name: /PECHUGA FAMILIAR: Pollo entero/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /24 HUEVOS FRESCOS: Huevos L/ })).toBeVisible();

  // 3. La bolsa no es del almacén: no se suma.
  await page.getByRole("button", { name: /BOLSA PLASTICO: Sin producto/ }).click();
  await page
    .getByRole("dialog", { name: "BOLSA PLASTICO" })
    .getByRole("button", { name: "No sumar al almacén" })
    .click();
  await expect(page.getByText(/línea sin producto/)).toBeHidden();
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await expect(page.getByText(/Ticket guardado/)).toBeVisible();

  // 4. En el almacén están Pollo entero y Huevos L, no la bolsa.
  await nav(page, "Necesidades").click();
  await expect(page.getByText("Pollo entero").first()).toBeVisible();
  await expect(page.getByText("Huevos L").first()).toBeVisible();
});

test("equivalencias antiguas: reasignar un producto creado desde el ticket mueve sus existencias", async ({ page }) => {
  await openApp(page);
  // Como en versiones anteriores: una línea dudosa resuelta con su propio texto crea un producto nuevo.
  await nav(page, "Tickets").click();
  await page.getByRole("button", { name: "Añadir ticket sin foto" }).click();
  await page.getByRole("button", { name: "Revisar textos y cantidades" }).click();
  await page.getByRole("button", { name: "Añadir línea" }).click();
  await page.getByLabel("Producto", { exact: true }).first().fill("BOLLO ZZ CHOCO");
  await page.getByPlaceholder("0,00").fill("1,80");
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await page.getByRole("button", { name: "Confirmar revisión" }).click();
  await expect(page.getByText("Corrección aprendida para próximos tickets.")).toBeVisible();

  await openMenu(page);
  await page.getByRole("button", { name: "Equivalencias de tickets" }).click();
  await expect(page.getByText("Por revisar · 1")).toBeVisible();
  await page.getByRole("button", { name: "Cambiar el producto de BOLLO ZZ CHOCO" }).click();
  const picker = page.getByRole("dialog", { name: "BOLLO ZZ CHOCO" });
  await picker.getByLabel("Buscar producto").fill("donuts");
  await picker.getByRole("button", { name: /^Donuts/ }).click();
  await expect(
    page.getByText(/irá a Donuts y su unidad pasa a ese producto; «BOLLO ZZ CHOCO» ya no existe/),
  ).toBeVisible();
  await expect(page.getByText(/Por revisar/)).toBeHidden();
  await expect(page.getByRole("button", { name: "Cambiar el producto de BOLLO ZZ CHOCO" })).toContainText("Donuts");
});
