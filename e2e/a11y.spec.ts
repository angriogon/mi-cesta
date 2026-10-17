import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addToPrepare, nav, openApp, openMenu } from "./helpers";

/** Auditoría automática de accesibilidad (WCAG 2.1 AA) de cada pantalla, en claro y en oscuro. */
async function audit(page: Page, screen: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = result.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(
      (violation) =>
        `${screen} · ${violation.id}: ${violation.help} → ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(" | ")}`,
    );
  return problems;
}

for (const scheme of ["light", "dark"] as const) {
  test(`sin problemas graves de accesibilidad (${scheme})`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem("cesta-theme", theme), scheme);
    await openApp(page);
    const problems: string[] = [];
    problems.push(...(await audit(page, "Inicio")));

    await nav(page, "Compra").click();
    await addToPrepare(page, "Leche");
    problems.push(...(await audit(page, "Compra · Preparar")));
    await page.getByRole("button", { name: /Generar lista/ }).click();
    problems.push(...(await audit(page, "Compra · En tienda")));

    for (const [view, label] of [
      ["Necesidades", "Necesidades"],
      ["Tickets", "Tickets"],
    ] as const) {
      await nav(page, view).click();
      await expect(page.locator(".animate-spin")).toHaveCount(0);
      problems.push(...(await audit(page, label)));
    }
    await nav(page, /^Mascota/).click();
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    problems.push(...(await audit(page, "Mascota")));

    await openMenu(page);
    problems.push(...(await audit(page, "Menú")));

    expect(problems, problems.join("\n")).toEqual([]);
  });
}
