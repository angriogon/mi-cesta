import { defineConfig, devices } from "@playwright/test";

/** Pruebas de extremo a extremo en WebKit (el motor de Safari) con tamaño de iPhone, en modo local. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone-webkit", use: { ...devices["iPhone 14"] } },
    { name: "iphone-se-webkit", use: { ...devices["iPhone SE"] }, testMatch: /layout\.spec\.ts/ },
  ],
  webServer: {
    command: "npx vite build --mode e2e && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_FORCE_LOCAL: "true", CESTA_BASE: "/" },
  },
});
