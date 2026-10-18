import { expect, test, type Page } from "@playwright/test";
import { writeBarcode, type WriterOptions } from "zxing-wasm/full";
import { nav, openApp } from "./helpers";

test.use({ serviceWorkers: "block" });

/**
 * «Foto» de un código: se dibuja en el navegador girado, pequeño y sobre un fondo gris, como una
 * foto hecha deprisa, y se pasa al escáner como si viniera de la cámara del iPhone.
 */
async function photoOf(page: Page, text: string, format: WriterOptions["format"], angle: number) {
  const { svg } = await writeBarcode(text, { format, scale: 2 });
  const base64 = await page.evaluate(
    async ({ svg, angle }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#b9b4aa";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(560, 470);
      context.rotate((angle * Math.PI) / 180);
      context.fillStyle = "#f4f1ea";
      context.fillRect(-image.width / 2 - 30, -image.height / 2 - 30, image.width + 60, image.height + 60);
      context.drawImage(image, -image.width / 2, -image.height / 2);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { svg, angle },
  );
  return { name: "codigo.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

async function openScanner(page: Page) {
  await nav(page, "Compra").click();
  await page.getByRole("button", { name: "Escanear código de barras" }).first().click();
}

test("lee la foto de un código girado y dice de qué cadena es la marca propia", async ({ page }) => {
  await openApp(page);
  const hosts: string[] = [];
  await page.route("**/api/v2/product/**", async (route) => {
    const url = new URL(route.request().url());
    hosts.push(url.host);
    const known = url.host === "world.openfoodfacts.org" && url.pathname.includes("8480000160270");
    await route.fulfill({
      json: known ? { status: 1, product: { product_name_es: "Leche semidesnatada", brands: "Dia" } } : { status: 0 },
    });
  });
  await openScanner(page);
  await page.getByLabel("Foto del código").setInputFiles(await photoOf(page, "8480000160270", "EAN13", 90));
  await expect(page.getByRole("heading", { name: "Leche semidesnatada" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Marca propia de DIA")).toBeVisible();

  // Un pack (ITF-14) se busca por la unidad que contiene.
  await page.getByRole("button", { name: "Otro" }).click();
  await page.getByLabel("Foto del código").setInputFiles(await photoOf(page, "18480000160277", "ITF14", -8));
  await expect(page.getByRole("heading", { name: "Leche semidesnatada" })).toBeVisible({ timeout: 15_000 });
  expect(hosts.every((host) => host.endsWith(".org"))).toBe(true);
});

test("etiqueta de la balanza: se aprende una vez y vale aunque cambie el precio", async ({ page }) => {
  await openApp(page);
  let external = 0;
  await page.route("**/api/v2/product/**", async (route) => {
    external++;
    await route.fulfill({ json: { status: 0 } });
  });
  await openScanner(page);
  await page.getByLabel("Foto del código").setInputFiles(await photoOf(page, "2300540012500", "EAN13", -15));
  await expect(page.getByText(/Es una etiqueta de la balanza del súper/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("Nombre del producto").fill("Pechuga de pollo al corte");
  await page.getByRole("button", { name: "Guardar y usar" }).click();
  await page.getByRole("button", { name: "Otro" }).click();

  // Otra etiqueta del mismo artículo, con otro importe, escrita a mano.
  await page.getByLabel("Código EAN").fill("2300540034502");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("heading", { name: "Pechuga de pollo al corte" })).toBeVisible();
  expect(external).toBe(0);

  // Un número mal escrito se avisa.
  await page.getByRole("button", { name: "Otro" }).click();
  await page.getByLabel("Código EAN").fill("2300540034503");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Revisa el código: el último número no cuadra con los demás.")).toBeVisible();
});
