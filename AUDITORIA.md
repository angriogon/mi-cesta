# Auditoría de Mi Cesta (PWA para iOS)

Fecha: 17/10/2026 · Alcance: todo el repositorio (`index.html`, `sw.js`, `manifest.webmanifest`, iconos, workflow de GitHub Pages y README).

## Resumen

Mi Cesta es una lista de la compra autónoma: un único `index.html` (≈50 líneas de HTML, CSS y JS minificados a mano), un service worker y un manifest. Funciona y es segura frente a XSS (los textos del usuario se pintan con `textContent`). Pero tiene **un fallo grave de actualización**, un par de fallos funcionales en iOS y carencias que la limitan como app de uso diario.

| Área | Estado |
|---|---|
| Funcionalidad básica | ✅ Correcta |
| Seguridad (XSS, datos) | ✅ Buena: sin servidor y sin `innerHTML` con datos del usuario |
| Actualizaciones / service worker | ❌ Fallo crítico |
| Persistencia de datos en iOS | ⚠️ Frágil: no se puede importar y hay riesgo de perder datos |
| Accesibilidad | ⚠️ Aceptable, con detalles que mejorar |
| Mantenibilidad | ❌ Código minificado a mano, sin tests, sin lint |
| Despliegue | ⚠️ El README contradice al workflow |

---

## Fallos que se deberían corregir

### 🔴 Críticos

**1. Los usuarios nunca reciben actualizaciones** (`sw.js`)
El service worker usa una estrategia *cache-first* con un nombre de caché fijo (`mi-cesta-v1`). Una vez instalada, la app sirve siempre el `index.html` cacheado. Como `sw.js` no cambia al editar `index.html`, el navegador no instala un service worker nuevo y la caché nunca se renueva. **Ningún cambio que publiques llegará a quien ya tiene la app en el iPhone.**
→ Usa *network-first* para la navegación (HTML) y *cache-first* solo para los recursos estáticos. Versiona `CACHE` en cada despliegue (por ejemplo, con el hash del commit) y añade `self.skipWaiting()` y `clients.claim()`, o bien un aviso de "Hay una versión nueva".

**2. No hay forma de recuperar la copia de seguridad**
La app exporta a JSON, pero no puede importar ese JSON, así que la "copia de seguridad" no sirve para restaurar nada. Esto pesa más en iOS por estos motivos:
- Los datos de Safari y los de la app instalada en la pantalla de inicio están **separados**: lo que añadas en Safari no aparece en la app instalada.
- iOS puede borrar el almacenamiento (ITP borra los datos de las webs no instaladas tras 7 días sin uso, y el sistema puede liberar espacio cuando falta).
→ Añade "Importar lista" y llama a `navigator.storage.persist()`.

### 🟠 Importantes

**3. La exportación falla o se comporta mal en iOS** (`index.html:51`)
`URL.revokeObjectURL` se llama justo después de `a.click()`. En Safari/WebKit eso puede cancelar la descarga. Además, en una PWA instalada en iOS las descargas de blobs son poco fiables: abren un visor sin un botón claro para volver.
→ En iOS usa `navigator.share({ files: [...] })` (la hoja de compartir) y deja la descarga como alternativa. Retrasa el `revokeObjectURL` con `setTimeout`.

**4. El campo de precio está fuera del formulario** (`index.html:28`)
Si pulsas "Intro" en el precio no se añade nada, y el orden visual (nombre, cantidad, botón y, debajo, el precio) hace que la gente pulse "Añadir" antes de rellenar el precio.
→ Mete el precio dentro del `<form>` y pon el botón al final.

**5. El indicador "Artículos pendientes" cuenta unidades, no artículos** (`index.html:39`)
Con "Leche ×6" muestra 6. Cambia la etiqueta a "Unidades pendientes" o cuenta las filas.

**6. "Total estimado" incluye lo ya comprado** (`index.html:40`)
Es ambiguo. Lo útil suele ser "Pendiente: X €" y "En la cesta: Y €".

**7. Borrados sin confirmación ni deshacer**
Tanto "×" como "Borrar comprados" eliminan al instante, y con dedos en el móvil es fácil equivocarse.
→ Muestra un aviso con "Deshacer" durante unos 5 segundos.

**8. `save()` no captura errores** (`index.html:36`)
Si `localStorage` falla (cuota llena o modo restringido), lanza una excepción, la interfaz no se actualiza y el usuario no ve ningún aviso.

**9. Las cantidades aceptan decimales y valores absurdos** (`index.html:48`)
`Math.max(1, 2.5)` guarda 2.5 aunque el campo tenga `step=1`, y no hay máximo (se puede guardar 1e9).
→ Aplica `Math.round` y un tope razonable.

**10. El README contradice al workflow**
El README dice "Deploy from a branch", pero el repo incluye un workflow de Actions (`pages.yml`). Con "Deploy from a branch", el workflow falla en cada push porque Pages no está en modo "GitHub Actions".
→ Elige una opción: lo recomendable es Settings → Pages → Source: **GitHub Actions**. Actualiza el README.

### 🟡 Menores

11. El service worker cachea cualquier GET, incluidas respuestas de error (no comprueba `resp.ok`) y peticiones a otros dominios. Si falla la red, devuelve `index.html` para **cualquier** recurso, incluidas imágenes.
12. El botón "×" es muy pequeño (unos 30 px). Apple recomienda 44×44 pt como mínimo.
13. Los botones de filtro no indican su estado a los lectores de pantalla (falta `aria-pressed`). Al marcar un artículo se repinta toda la lista y se pierde el foco del teclado.
14. Los campos numéricos no tienen `inputmode="decimal"`. En iOS con teclado español, conviene probar que "2,5" se interpreta bien.
15. `viewport-fit=cover` está activado, pero no se usa `env(safe-area-inset-*)`. Ahora no rompe nada porque la barra de estado es `default`, pero fallará si se cambia a `black-translucent`.
16. Al manifest le faltan `id`, `lang` y un icono `maskable`. El `apple-touch-icon` debería medir 180×180, no 192.
17. No hay modo oscuro (`prefers-color-scheme`), y lo tienen casi todos los iPhone.
18. El `<h1>` incluye un emoji que el lector de pantalla lee como "carrito de la compra Mi Cesta".
19. Los IDs se generan con `Date.now()+Math.random()` (números decimales). Es mejor `crypto.randomUUID()`.
20. El README termina con una nota de Codex ("versión reconstruida… no es posible confirmar que sea idéntica"). Conviene quitarla.

---

## Sobre el desarrollo con Codex

Se nota el origen generado por IA:
- **Código comprimido en pocas líneas**: funciones enteras en una sola línea, sin comentarios. Es difícil de leer, revisar y modificar sin romper algo.
- **Sin tests, linter ni formateador**, así que nada detecta regresiones.
- **El service worker es una plantilla genérica** que nunca se probó con una actualización real, y ahí está el fallo crítico n.º 1.
- **Funcionalidades "de checklist"** (exportar) que no cierran el ciclo (no se puede importar).

Esto no la hace mala: para una primera versión es razonable. Pero antes de añadir funciones hay que reformatear el código y poner una red de seguridad mínima.

---

## Qué mejoraría (por prioridad)

1. **Arreglar el service worker** (fallo 1). Sin esto, nada de lo demás llega a los usuarios.
2. **Reformatear y separar** el código en `index.html`, `styles.css` y `app.js` (o módulos ES), con Prettier y ESLint.
3. **Tests end-to-end con Playwright** (WebKit, que es el motor de iOS), ejecutados en el workflow antes de desplegar: añadir, marcar, filtrar, borrar, exportar/importar y modo sin conexión.
4. **Importar, deshacer y editar artículos** (tocar el nombre para editarlo).
5. **Mejoras para el uso real en el súper**:
   - Botones − / + para la cantidad.
   - Agrupar por categorías o pasillos (fruta, lácteos, limpieza…) con orden personalizable.
   - Favoritos o historial: sugerencias al escribir con lo que compras siempre.
   - Fusionar duplicados ("Leche" dos veces se convierte en "Leche ×2").
   - Compartir la lista como texto por WhatsApp (hoja de compartir de iOS).
6. **Pulido iOS**: modo oscuro, `safe-area`, iconos correctos, pantalla de bienvenida e instrucciones de "Añadir a pantalla de inicio" la primera vez que se abre en Safari.

## Dirección que propongo

**Mantenerla como app *local-first*, sin cuentas y sin framework pesado**, que es su punto fuerte: rápida, privada y gratis de alojar. Por fases:

- **Fase 1 – Solidez (1–2 días):** arreglar los fallos 1–10, reformatear, tests con Playwright en CI y versionado automático del service worker.
- **Fase 2 – Utilidad diaria:** categorías, favoritos/historial, editar, deshacer, compartir como texto e importar.
- **Fase 3 – Compartir en familia (opcional):** es lo que más valor añade a una lista de la compra (que dos personas vean la misma lista). Se puede hacer manteniendo el modo local, con sincronización opcional mediante un backend ligero (Supabase o Firebase) o un enlace compartido, y migrando de `localStorage` a IndexedDB.

Si en algún momento crece mucho, pasar a Vite + TypeScript (sin framework o con Preact) sería el siguiente paso natural, pero hoy no hace falta.
