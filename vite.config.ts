/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.CESTA_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
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
        background_color: "#f5f7f3",
        theme_color: "#f5f7f3",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/og.png"],
        navigateFallback: `${base}index.html`,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
