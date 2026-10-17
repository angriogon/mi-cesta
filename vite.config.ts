/// <reference types="vitest/config" />
import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.CESTA_BASE ?? "/";

const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ["react", "react-dom", "scheduler"],
  supabase: ["@supabase", "iceberg-js"],
};

/**
 * Bloques de dependencias con nombre estable: React y Supabase cambian poco, así que el iPhone los
 * conserva entre versiones de la app; PDF, escáner y OCR solo se descargan al usarlos.
 */
function vendorChunk(id: string): string | undefined {
  const path = id.replaceAll("\\", "/");
  for (const [chunk, packages] of Object.entries(VENDOR_CHUNKS))
    if (packages.some((name) => path.includes(`/node_modules/${name}/`))) return chunk;
  return undefined;
}

/** Dependencias pesadas que solo se usan en momentos concretos (PDF, escáner, OCR). */
const ON_DEMAND_PACKAGES = ["jspdf", "html2canvas", "dompurify", "canvg", "@zxing", "tesseract.js"];

/** Sus bloques llevan el prefijo «ondemand-»: no entran en la descarga inicial y se guardan al usarlos. */
function chunkFileName(chunk: { moduleIds: readonly string[] }): string {
  const onDemand = chunk.moduleIds.some((id) =>
    ON_DEMAND_PACKAGES.some((name) => id.replaceAll("\\", "/").includes(`/node_modules/${name}/`)),
  );
  return onDemand ? "assets/ondemand-[name]-[hash].js" : "assets/[name]-[hash].js";
}

const ON_DEMAND = /\/assets\/ondemand-/;

/**
 * OCR servido desde la propia app, sin CDN de terceros: el trabajador, el motor LSTM en sus tres
 * variantes (con y sin SIMD) y el español compacto. Solo se descargan al leer el primer ticket.
 */
const OCR_FILES: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js": "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "spa.traineddata.gz": "@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
};
const nodeModule = (file: string) => fileURLToPath(new URL(`./node_modules/${file}`, import.meta.url));

function ocrAssets(): Plugin {
  return {
    name: "cesta-ocr-assets",
    generateBundle() {
      for (const [name, file] of Object.entries(OCR_FILES))
        this.emitFile({ type: "asset", fileName: `ocr/${name}`, source: readFileSync(nodeModule(file)) });
    },
    configureServer(server) {
      server.middlewares.use(`${base}ocr/`, (request, response, next) => {
        const file = OCR_FILES[(request.url ?? "").replace(/^\//, "").split("?")[0]];
        if (!file) return next();
        response.setHeader("Content-Type", file.endsWith(".gz") ? "application/gzip" : "text/javascript");
        createReadStream(nodeModule(file)).pipe(response);
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    ocrAssets(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "cesta-icon.svg"],
      manifest: {
        id: base,
        name: "Cesta — Mi lista de la compra",
        short_name: "Cesta",
        description: "Una lista de la compra rápida, clara y pensada para usar en el iPhone.",
        lang: "es-ES",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#f2f2f7",
        theme_color: "#f2f2f7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/og.png", "**/assets/ondemand-*", "**/ocr/**"],
        navigateFallback: `${base}index.html`,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => ON_DEMAND.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "cesta-modulos", expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}ocr/`),
            handler: "CacheFirst",
            options: { cacheName: "cesta-ocr", expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: vendorChunk, chunkFileNames: chunkFileName },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
