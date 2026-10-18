import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION } from "../app/config";
import { RELEASES } from "./novedades";

const parts = (version: string) => version.split(".").map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

describe("Novedades", () => {
  it("la versión de la app es la primera de Novedades y la de package.json", () => {
    expect(APP_VERSION).toBe(RELEASES[0].version);
    expect(pkg.version).toBe(RELEASES[0].version);
  });

  it("van de la más nueva a la más antigua, sin repetir y con fecha válida", () => {
    for (let i = 1; i < RELEASES.length; i++) expect(newer(RELEASES[i - 1].version, RELEASES[i].version)).toBe(true);
    for (let i = 1; i < RELEASES.length; i++) {
      if (RELEASES[i].date) expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
    for (const release of RELEASES.slice(0, -1)) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("cada versión tiene título y al menos un cambio, escrito como frase", () => {
    for (const release of RELEASES) {
      expect(release.title).not.toBe("");
      expect(release.changes.length).toBeGreaterThan(0);
      for (const change of release.changes) expect(change).toMatch(/^[«A-ZÁÉÍÓÚÑ0-9].*[.»)]$/u);
    }
  });
});
