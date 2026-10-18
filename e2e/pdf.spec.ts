import { expect, test, type Page } from "@playwright/test";
import { jsPDF } from "jspdf";
import { nav, openApp } from "./helpers";

const LINES = [
  "MERCADONA, S.A. A-46103834",
  "C/ EJEMPLO 1 41300",
  "28/09/2026 11:39 OP: 2259972",
  "FACTURA SIMPLIFICADA: 4586-018-111526",
  "Descripcion             P. Unit   Imp.(EUR)",
  "1 LECHE DESN P6                      4,92",
  "2 ARROZ LARGO            1,20        2,40",
  "1 LIMPIAMUEBLE PARQUET               2,00",
  "  PESCADO",
  "  Dorada",
  "  1,286 kg  9,50 EUR/kg             12,22",
  "TOTAL (EUR)                         21,54",
  "TARJETA BANCARIA                    21,54",
];

/** Ticket digital: PDF con texto en Courier, como el que envía el supermercado. */
function textPdf(): Buffer {
  const doc = new jsPDF({ unit: "pt", format: [300, 260] });
  doc.setFont("courier");
  doc.setFontSize(9);
  LINES.forEach((line, index) => doc.text(line, 12, 20 + index * 14));
  return Buffer.from(doc.output("arraybuffer"));
}

async function upload(page: Page, pdf: Buffer) {
  await openApp(page);
  await nav(page, "Tickets").click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: pdf });
}

async function expectTicket(page: Page) {
  await expect(page.getByPlaceholder("0,00")).toHaveValue("21,54");
  await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-09-28");
  await expect(page.getByText("4 líneas")).toBeVisible();
  await expect(page.getByAltText("Vista previa del ticket")).toBeVisible();
}

test("lee el ticket digital en PDF por su texto, sin OCR", async ({ page }) => {
  const ocrRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/ocr/")) ocrRequests.push(request.url());
  });
  await upload(page, textPdf());
  await expect(page.getByText(/Lectura terminada/)).toBeVisible({ timeout: 30_000 });
  await expectTicket(page);
  expect(ocrRequests, "un PDF con texto no necesita el lector de fotos").toEqual([]);
});

test("un PDF escaneado (solo imagen) se lee con el OCR", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const render = await browser.newPage({ viewport: { width: 600, height: 300 }, deviceScaleFactor: 2 });
  await render.setContent(
    `<pre style="margin:0;padding:20px;font:20px/1.4 'Courier New',monospace;color:#111;background:#fff">${LINES.join("\n")}</pre>`,
  );
  const png = await render.screenshot({ type: "png", fullPage: true });
  await render.close();
  const doc = new jsPDF({ unit: "pt", format: [600, 420] });
  doc.addImage(new Uint8Array(png), "PNG", 0, 0, 600, 420);
  await upload(page, Buffer.from(doc.output("arraybuffer")));
  await expect(page.getByText(/Lectura terminada/)).toBeVisible({ timeout: 120_000 });
  await expectTicket(page);
});
