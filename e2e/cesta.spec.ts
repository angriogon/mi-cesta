import { expect, test } from "@playwright/test";
import { addToPrepare, expectNoHorizontalScroll, nav, openApp, openMenu, unlockMaintenance } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("arranca con el hogar vacío y en calma", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Todo en calma" })).toBeVisible();
  await expect(page.getByLabel("Índice de tranquilidad: 100 de 100")).toBeVisible();
  await expect(page.getByText("Nada urgente")).toBeVisible();
  await expect(page.getByText("Todo bajo control")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("preparar la compra: añadir, repetir, cantidad, categoría, borrar y deshacer", async ({ page }) => {
  await nav(page, "Compra").click();
  await expect(page.getByText("Lista vacía")).toBeVisible();
  await addToPrepare(page, "Kombucha de mango");
  await expect(page.getByText("NUEVO")).toBeVisible();
  await addToPrepare(page, "kombucha de mango");
  await expect(page.getByRole("tab", { name: "Preparar · 1" })).toBeVisible();
  await page.getByRole("button", { name: "Aumentar Kombucha de mango" }).click();
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "3" }).first()).toBeVisible();
  await page.getByLabel("Cambiar categoría de Kombucha de mango").selectOption("Bebidas");
  await expect(page.getByText("Bebidas · 1")).toBeVisible();

  // El buscador sugiere productos del catálogo.
  await page.getByPlaceholder("Añadir producto…").fill("leche ent");
  await page.getByRole("button", { name: /Leche entera/ }).click();
  await expect(page.getByText("Refrigerados · 1")).toBeVisible();

  await page.getByRole("button", { name: "Eliminar Leche entera" }).click();
  await expect(page.getByText("Leche entera eliminado.")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("Refrigerados · 1")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("de Preparar a la tienda y al almacén, con caducidades", async ({ page }) => {
  await nav(page, "Compra").click();
  await addToPrepare(page, "Leche entera");
  await addToPrepare(page, "Arroz largo");
  await page.getByRole("button", { name: "Generar lista" }).click();
  await expect(page.getByRole("tab", { name: /En tienda/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Marcar Leche entera como comprado" }).click();
  await page.getByRole("button", { name: "Marcar Arroz largo como comprado" }).click();
  await page.getByRole("button", { name: /Guardar 2 unidades en el almacén/ }).click();

  // La leche es perecedera: se ofrece anotar la caducidad.
  const dialog = page.getByRole("dialog", { name: "Caducidades de la compra" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Todo en 7 días" }).click();
  await dialog.getByRole("button", { name: "Guardar fechas" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("2 productos guardados en el almacén")).toBeVisible();

  await nav(page, "Inicio").click();
  await expect(page.getByText("Existencias totales")).toBeVisible();
  await expect(page.getByRole("button", { name: /Existencias totales 2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deshacer · Compra/ })).toBeVisible();

  await nav(page, "Necesidades").click();
  await expect(page.getByText("Caducidades y estados")).toBeVisible();
  await expect(page.getByText("7 d")).toBeVisible();
});

test("vaciar la lista de la tienda pide confirmación y se puede deshacer", async ({ page }) => {
  await nav(page, "Compra").click();
  await addToPrepare(page, "Pan de molde");
  await page.getByRole("button", { name: "Generar lista" }).click();
  await page.getByRole("button", { name: "Vaciar" }).click();
  await expect(page.getByText("Pan de molde")).toBeVisible();
  await page.getByRole("button", { name: "¿Vaciar? Toca otra vez" }).click();
  await expect(page.getByText("Lista vacía")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("Pan de molde")).toBeVisible();
});

test("mantenimiento con PIN: mínimos, necesidades y lista", async ({ page }) => {
  await nav(page, "Necesidades").click();
  await expect(page.getByText("Define mínimos en Mantenimiento")).toBeVisible();
  await unlockMaintenance(page);
  await page.getByPlaceholder("Buscar en el catálogo…").fill("huevos");
  await page.getByRole("button", { name: "Aumentar mínimo de Huevos L" }).click();
  await page.getByRole("button", { name: "Aumentar mínimo de Huevos L" }).click();
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByPlaceholder("Buscar en lo que falta…").fill("");
  await expect(page.getByText("Faltan 2")).toBeVisible();
  await expect(nav(page, "Necesidades")).toContainText("1");
  await page.getByRole("button", { name: "Añadir necesidades a la lista" }).click();
  await expect(page.getByRole("tab", { name: "En tienda · 2" })).toBeVisible();
});

test("el PIN incorrecto no abre el mantenimiento", async ({ page }) => {
  await nav(page, "Necesidades").click();
  await unlockMaintenance(page, "2468");
  await page.getByRole("button", { name: "Bloquear mantenimiento" }).click();
  await page.getByRole("button", { name: "Mantenimiento" }).click();
  await page.locator("#admin-pin").fill("1111");
  await page.getByRole("button", { name: "Entrar con PIN" }).click();
  await expect(page.getByText("PIN incorrecto.")).toBeVisible();
  await page.getByRole("button", { name: "¿Has olvidado el PIN?" }).click();
  await page.getByLabel("Frase de confirmación").fill("RESTABLECER");
  await page.getByRole("button", { name: "Crear un PIN nuevo" }).click();
  await expect(page.getByRole("button", { name: "Crear acceso de administrador" })).toBeVisible();
});

test("AutoCesta sugiere lo que está bajo mínimos y se puede añadir", async ({ page }) => {
  await nav(page, "Necesidades").click();
  await unlockMaintenance(page);
  await page.getByPlaceholder("Buscar en el catálogo…").fill("arroz largo");
  await page.getByRole("button", { name: "Aumentar mínimo de Arroz largo" }).click();
  await page.getByRole("button", { name: "Listo" }).click();
  await nav(page, "Inicio").click();
  await page.getByRole("button", { name: "AutoCesta" }).click();
  await expect(page.getByRole("button", { name: "AutoCesta" })).toHaveAttribute("aria-pressed", "true");
  await nav(page, "Compra").click();
  await expect(page.getByText("Sugeridos por AutoCesta")).toBeVisible();
  await page.getByRole("button", { name: "Añadir seleccionados" }).click();
  await expect(page.getByText("Despensa · 1")).toBeVisible();
});

test("ticket a mano: líneas, revisión, historial, edición y borrado", async ({ page }) => {
  await nav(page, "Tickets").click();
  await expect(page.getByText("Cuando guardes el primer ticket")).toBeVisible();
  await page.getByRole("button", { name: "Añadir ticket sin foto" }).click();
  await page.getByRole("button", { name: "Revisar textos y cantidades" }).click();
  await page.getByRole("button", { name: "Añadir línea" }).click();
  await page.getByLabel("Producto").first().fill("LECHE ENTERA");
  await page.getByRole("button", { name: "Añadir línea" }).click();
  await page.getByLabel("Producto").nth(1).fill("ZZ COSA RARA");
  await page.getByPlaceholder("0,00").fill("4,50");
  await page.getByRole("button", { name: "Guardar ticket" }).click();
  await expect(page.getByText(/Ticket guardado\. 1 unidad añadida.*1 para revisar/)).toBeVisible();
  await expect(page.getByText("Solo hay que revisar 1")).toBeVisible();
  await page.getByLabel("Corregir ZZ COSA RARA").fill("Galletas de avena");
  await page.getByRole("button", { name: "Confirmar revisión" }).click();
  await expect(page.getByText("Corrección aprendida para próximos tickets.")).toBeVisible();
  await expect(page.getByText("4,50 €").first()).toBeVisible();
  await expect(page.getByText(/· 2 líneas/)).toBeVisible();

  await page.getByRole("button", { name: "Editar ticket de Mercadona" }).click();
  await page.getByRole("textbox", { name: "Supermercado" }).last().fill("Lidl");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados correctamente.")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar ticket de Lidl" }).click();
  await page.getByRole("button", { name: "Confirmar eliminar ticket de Lidl" }).click();
  await expect(page.getByText("Ticket eliminado. Las existencias no se modifican.")).toBeVisible();
});

test("mascota: nombre, artículos, dar 1 y avisos", async ({ page }) => {
  await nav(page, /^Mascota/).click();
  await expect(page.getByText("No hay artículos.")).toBeVisible();
  await unlockMaintenance(page);
  await page.getByLabel("Nombre de la mascota").fill("Serranito");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Nombre de la mascota actualizado.")).toBeVisible();
  await expect(nav(page, /^Serranito/)).toBeVisible();
  await page.getByLabel("Nueva comida o snack").fill("Nervio de toro");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.getByRole("button", { name: "Aumentar existencias de Nervio de toro" }).click();
  await page.getByRole("button", { name: "Aumentar existencias de Nervio de toro" }).click();
  await page.getByLabel("Texto del aviso").fill("Sacar un blíster");
  await page.getByRole("button", { name: "Añadir aviso" }).click();
  await expect(page.getByText(/Aviso programado/)).toBeVisible();
  await page.getByRole("switch", { name: "Pausar Sacar un blíster" }).click();
  await expect(page.getByText("Aviso pausado.")).toBeVisible();
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByRole("button", { name: "Dar 1" }).click();
  await expect(page.getByText("1 unidad de Nervio de toro descontada.")).toBeVisible();
});

test("recetas: filtrar, añadir lo que falta y cocinar", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "Recetas con mi stock" }).click();
  await expect(page.getByText("Recetas para decidir")).toBeVisible();
  await page.getByLabel("Buscar receta o ingrediente").fill("tortilla francesa");
  await page.getByRole("button", { name: /Tortilla francesa de calabacín/ }).click();
  await page.getByRole("button", { name: "Añadir ingredientes a la lista" }).click();
  await expect(page.getByText(/ingredientes añadidos a En tienda/)).toBeVisible();
  await expect(page.getByRole("tab", { name: /En tienda · 3/ })).toBeVisible();
});

test("inventario rápido: zona, lista escrita, guardar e incorporar", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "Inventario rápido" }).click();
  await page.getByRole("button", { name: "Frigorífico" }).click();
  await page.getByLabel("Producto", { exact: true }).fill("2 yogures naturales, tres huevos y queso fresco");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(page.getByText("3 productos")).toBeVisible();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Inventario guardado.")).toBeVisible();
  await page.getByRole("button", { name: "Incorporar al almacén" }).click();
  await expect(page.getByText("3 productos incorporados.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Todo en calma|Casi todo|Algunas cosas/ })).toBeVisible({
    timeout: 5000,
  });
});

test.describe("sin service worker", () => {
  test.use({ serviceWorkers: "block" });
  test("código de barras: producto conocido y desconocido", async ({ page }) => {
    await openApp(page);
    await page.route("https://world.openfoodfacts.org/**", async (route) => {
      const known = route.request().url().includes("8410000000001");
      await route.fulfill({
        json: known
          ? {
              status: 1,
              product: { product_name_es: "Galletas María", brands: "Marca", allergens_tags: ["en:gluten"] },
            }
          : { status: 0 },
      });
    });
    await nav(page, "Compra").click();
    await page.getByRole("button", { name: "Escanear código de barras" }).first().click();
    await page.getByLabel("Código EAN").fill("8410000000001");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Alérgenos: gluten")).toBeVisible();
    await page.getByRole("button", { name: "Usar este producto" }).click();
    await expect(page.getByText("Galletas María")).toBeVisible();

    await page.getByRole("button", { name: "Escanear código de barras" }).first().click();
    await page.getByLabel("Código EAN").fill("8410000000099");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByPlaceholder("Nombre del producto").fill("Paté de la abuela");
    await page.getByRole("button", { name: "Guardar y usar" }).click();
    await page.getByRole("button", { name: "Usar este producto" }).click();
    await expect(page.getByText("Paté de la abuela")).toBeVisible();
  });
});

test("menú: código postal, perfil alimentario, novedades y restablecer", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "Indicar código postal" }).click();
  await page.getByPlaceholder("41300").fill("41300");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "CP 41300" })).toBeVisible();
  await page.getByRole("button", { name: "Alimentación especial" }).click();
  await page.getByLabel("Activar perfil").check();
  await page.getByPlaceholder("gluten, leche, frutos secos").fill("huevo");
  // Datos de salud: sin consentimiento explícito no se guardan.
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Para guardar alergias o alimentos a evitar, marca tu consentimiento.")).toBeVisible();
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil alimentario guardado.")).toBeVisible();
  await page.getByLabel(/Doy mi consentimiento explícito/).uncheck();
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText(/Consentimiento retirado/)).toBeVisible();
  await expect(page.getByPlaceholder("gluten, leche, frutos secos")).toHaveValue("");
  await page.getByRole("button", { name: "← Volver al menú" }).click();
  await page.getByRole("button", { name: "Novedades" }).click();
  await expect(page.getByText("Versión 5.0.0", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "← Volver al menú" }).click();
  await page.getByRole("button", { name: "Privacidad y condiciones" }).click();
  await expect(page.getByRole("heading", { name: "Política de privacidad" })).toBeVisible();
  await page.getByRole("button", { name: "Condiciones" }).click();
  await expect(page.getByRole("heading", { name: "Condiciones de uso" })).toBeVisible();
  await page.getByRole("button", { name: "← Volver al menú" }).click();
  await page.getByRole("button", { name: "Exportar mis datos" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia" }).click();
  expect((await download).suggestedFilename()).toMatch(/^cesta-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
  await page.getByRole("button", { name: "← Volver al menú" }).click();
  // En modo local no hay cuenta que eliminar.
  await expect(page.getByRole("button", { name: "Eliminar cuenta" })).toHaveCount(0);
  await page.getByRole("button", { name: "Restablecer datos del hogar" }).click();
  await page.getByPlaceholder("Escribe RESTABLECER").fill("otra cosa");
  await page.getByRole("button", { name: "Restablecer todo" }).click();
  await expect(page.getByText("Escribe RESTABLECER para confirmar.")).toBeVisible();
  await page.getByPlaceholder("Escribe RESTABLECER").fill("restablecer");
  await page.getByRole("button", { name: "Restablecer todo" }).click();
  await expect(page.getByLabel("Iniciando Cesta")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Todo en calma" })).toBeVisible();
});

test("los datos se conservan al cerrar y volver a abrir", async ({ page }) => {
  await nav(page, "Compra").click();
  await addToPrepare(page, "Café molido");
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByLabel("Iniciando Cesta")).toBeHidden({ timeout: 15_000 });
  await nav(page, "Compra").click();
  await expect(page.getByText("Café molido")).toBeVisible();
});
