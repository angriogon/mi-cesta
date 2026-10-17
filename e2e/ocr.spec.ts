import { expect, test } from "@playwright/test";
import { nav, openApp } from "./helpers";

const TICKET_HTML = `<html><body style="margin:0;background:#fff">
<pre style="font:22px/1.5 'Courier New',monospace;padding:30px;width:520px;color:#111">
MERCADONA, S.A. A-46103834
C/ EJEMPLO 1 41300
17/10/2026 18:42 OP: 123456
FACTURA SIMPLIFICADA
1 LECHE ENTERA            0,95
2 ARROZ LARGO   1,20      2,40
1 PAN BAGUETTE            0,45
TOTAL (€)                 3,80
TARJETA BANCARIA          3,80
</pre></body></html>`;

/** Lectura real con Tesseract (necesita internet para descargar el idioma la primera vez). */
test("lee una foto de ticket y la guarda con sus líneas", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const render = await browser.newPage({ viewport: { width: 600, height: 420 }, deviceScaleFactor: 2 });
  await render.setContent(TICKET_HTML);
  const image = await render.screenshot({ type: "png" });
  await render.close();

  await openApp(page);
  await nav(page, "Tickets").click();
  await page.locator('input[type="file"]').setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: image });
  await expect(page.getByText(/Lectura terminada/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByPlaceholder("0,00")).toHaveValue("3,80");
  await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-10-17");
  await expect(page.getByText("3 líneas")).toBeVisible();
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await expect(page.getByText(/Ticket guardado\. 4 unidades añadidas/)).toBeVisible();
  await expect(page.getByText(/17\/10\/2026 · 3 líneas/)).toBeVisible();
});
