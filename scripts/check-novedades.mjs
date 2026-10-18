// Comprueba que cada cambio de la app trae su nota en Novedades (src/copy/novedades.ts).
// Se ejecuta en el CI de cada PR: compara la rama con la base y falla si se tocó la app
// (src/, public/, supabase/, index.html) sin tocar Novedades. Las pruebas no cuentan.
// Para un cambio que no se nota en la app, pon «[sin novedades]» en el título del PR.
import { execFileSync } from "node:child_process";

const base = process.env.BASE_REF ? `origin/${process.env.BASE_REF}` : "origin/main";
if ((process.env.PR_TITLE ?? "").includes("[sin novedades]")) {
  console.log("Novedades: el PR indica que no hay cambios visibles.");
  process.exit(0);
}

const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const isTest = (file) => /\.test\.tsx?$|(^|\/)tests?\//.test(file);
const touchesApp = changed.filter((file) => /^(src|public|supabase)\/|^index\.html$/.test(file) && !isTest(file));

if (touchesApp.length && !changed.includes("src/copy/novedades.ts")) {
  console.error("Este PR cambia la app pero no añade su nota en src/copy/novedades.ts:");
  for (const file of touchesApp) console.error(`  ${file}`);
  console.error("Añade una versión nueva arriba (o amplía la que aún no se ha publicado).");
  console.error("Si el cambio no se nota en la app, pon «[sin novedades]» en el título del PR.");
  process.exit(1);
}
console.log("Novedades: al día.");
