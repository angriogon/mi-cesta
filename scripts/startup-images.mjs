// Genera las pantallas de arranque de iOS (apple-touch-startup-image) idénticas al splash de la app,
// para que al abrir Cesta instalada no haya un destello blanco antes de que cargue.
// Uso: node scripts/startup-images.mjs  (escribe public/startup/*.png e imprime las etiquetas <link>)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { ShoppingBasket } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Pantallas de iPhone en orientación vertical: puntos CSS, densidad y margen inferior seguro.
const DEVICES = [
  { w: 440, h: 956, dpr: 3, bottom: 34 }, // 16 Pro Max
  { w: 402, h: 874, dpr: 3, bottom: 34 }, // 16 Pro
  { w: 430, h: 932, dpr: 3, bottom: 34 }, // 14/15 Pro Max, 15/16 Plus
  { w: 393, h: 852, dpr: 3, bottom: 34 }, // 14/15 Pro, 15, 16
  { w: 428, h: 926, dpr: 3, bottom: 34 }, // 12/13 Pro Max, 14 Plus
  { w: 390, h: 844, dpr: 3, bottom: 34 }, // 12, 13, 14
  { w: 375, h: 812, dpr: 3, bottom: 34 }, // X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, dpr: 3, bottom: 34 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2, bottom: 34 }, // XR, 11
  { w: 375, h: 667, dpr: 2, bottom: 0 }, // SE, 8
];

// Los mismos colores y medidas que Splash en src/app/chrome/Chrome.tsx (tema claro).
const icon = renderToStaticMarkup(createElement(ShoppingBasket, { size: 32, strokeWidth: 1.8, color: "#ffffff" }));
const html = (bottom) => `<!doctype html><html><body style="margin:0;background:#ffffff;height:100vh;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif">
  <div style="width:76px;height:76px;border-radius:12px;background:#1b7232;display:flex;align-items:center;justify-content:center">${icon}</div>
  <p style="margin:16px 0 0;font-size:17px;font-weight:600;color:#1b7232">Cesta</p>
  <p style="position:absolute;bottom:${22.4 + bottom}px;margin:0;font-size:12px;font-weight:600;
    text-transform:uppercase;color:#5c5c61">Powered by AR</p>
</body></html>`;

mkdirSync("public/startup", { recursive: true });
const browser = await chromium.launch();
const links = [];
for (const device of DEVICES) {
  const page = await browser.newPage({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: device.dpr,
  });
  await page.setContent(html(device.bottom));
  const name = `apple-splash-${device.w * device.dpr}x${device.h * device.dpr}.png`;
  await page.screenshot({ path: `public/startup/${name}` });
  await page.close();
  links.push(
    `    <link rel="apple-touch-startup-image" media="(device-width: ${device.w}px) and (device-height: ${device.h}px) and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: portrait)" href="/startup/${name}" />`,
  );
}
await browser.close();
console.log(links.join("\n"));
