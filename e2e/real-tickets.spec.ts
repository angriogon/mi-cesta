import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { nav, openApp } from "./helpers";

/**
 * Banco de tickets reales, fuera del repositorio (pueden llevar datos de la tarjeta).
 * CESTA_REAL_TICKETS=carpeta con fotos (.jpg/.png) y, al lado, un .json con lo esperado:
 * { "date": "2026-09-28", "total": "128,32", "lines": [["LECHE DESN P6", 492], ...] }
 * Sin la variable, esta prueba no se ejecuta.
 */
const folder = process.env.CESTA_REAL_TICKETS;
/** El WebKit de Playwright en Windows no decodifica JPEG (Safari en el iPhone sí): se pasa a PNG con Chromium. */
async function asPng(path: string): Promise<Buffer> {
  const bytes = readFileSync(path);
  if (!/.jpe?g$/i.test(path)) return bytes;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.toDataURL("image/png");
    }, bytes.toString("base64"));
    return Buffer.from(dataUrl.split(",")[1], "base64");
  } finally {
    await browser.close();
  }
}

const photos = folder ? readdirSync(folder).filter((name) => /\.(jpe?g|png)$/i.test(name)) : [];

test.describe("tickets reales", () => {
  test.skip(!folder, "Sin CESTA_REAL_TICKETS");
  for (const photo of photos) {
    test(photo, async ({ page }) => {
      test.setTimeout(240_000);
      const expected = JSON.parse(readFileSync(join(folder!, photo.replace(/\.\w+$/, ".json")), "utf8")) as {
        date: string;
        total: string;
        lines: [string, number][];
      };
      page.on("console", (message) => {
        const text = message.text();
        if (!text.startsWith("[ocr] ")) return void console.log("[page]", text.slice(0, 300));
        const { text: ocrText, image } = JSON.parse(text.slice(6)) as { text: string; image: string };
        const base = join(folder!, "out", photo.replace(/\.\w+$/, ""));
        mkdirSync(join(folder!, "out"), { recursive: true });
        writeFileSync(`${base}.txt`, ocrText);
        writeFileSync(`${base}.png`, Buffer.from(image.split(",")[1], "base64"));
      });
      await page.addInitScript(() => localStorage.setItem("cesta-debug-ocr", "1"));
      await openApp(page);
      await nav(page, "Tickets").click();
      const started = Date.now();
      const png = await asPng(join(folder!, photo));
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: png });
      await expect(page.getByText(/Lectura terminada|No se ha podido leer/)).toBeVisible({ timeout: 220_000 });
      const seconds = Math.round((Date.now() - started) / 1000);
      await page.screenshot({ path: join(folder!, "out", `${photo}.screen.png`), fullPage: true });
      const status = await page
        .getByText(/Lectura terminada|No se ha podido leer/)
        .first()
        .innerText();
      expect(status, "la lectura debe terminar").toMatch(/Lectura terminada/);
      const date = await page.locator('input[type="date"]').first().inputValue();
      const total = await page.getByPlaceholder("0,00").first().inputValue();
      const review = page.getByRole("button", { name: "Revisar textos y cantidades" });
      if (await review.isVisible()) await review.click();
      const names = await page
        .getByRole("button", { name: /^Eliminar línea/ })
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")!.replace("Eliminar línea ", "")));
      const amounts = await page
        .getByText("Importe", { exact: true })
        .locator("input")
        .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
      const read = names.map((name, index) => `${name} = ${amounts[index]}`);
      const wanted = expected.lines.map(([name, cents]) => `${name} = ${(cents / 100).toFixed(2).replace(".", ",")}`);
      const amountHits = expected.lines.filter(([, cents], index) => {
        const value = (cents / 100).toFixed(2).replace(".", ",");
        return amounts[index] === value || amounts.includes(value);
      }).length;
      console.log(
        JSON.stringify(
          {
            photo,
            seconds,
            status,
            date: [date, expected.date],
            total: [total, expected.total],
            lines: [names.length, expected.lines.length],
            amountHits,
            read,
            missing: wanted.filter((line) => !read.includes(line)).slice(0, 60),
          },
          null,
          1,
        ),
      );
    });
  }
});
