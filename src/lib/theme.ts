import { readText, writeText } from "./storage";

export type Theme = "light" | "dark";

const KEY = "cesta-theme";
const BACKGROUND: Record<Theme, string> = { light: "#f5f7f3", dark: "#101712" };

/** Tema elegido en este dispositivo; claro si no se ha elegido nunca. */
export function storedTheme(): Theme {
  return readText(KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BACKGROUND[theme]);
}

export function saveTheme(theme: Theme) {
  writeText(KEY, theme);
  applyTheme(theme);
}
