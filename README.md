# Cesta 4.0.1 — app original (recuperada)

Archivos de la web app **Cesta** tal y como los servía `cesta-diaria.angelmanuelrios.chatgpt.site`, recuperados el 17/10/2026. Se descargaron desde el navegador con la sesión iniciada y no se han modificado (solo se ha añadido este README).

La app se creó con **ChatGPT Sites**, que usa *vinext*, un Next.js basado en Vite: React Server Components compilados con rolldown.

## Qué contiene esta rama

| Ruta | Qué es |
|---|---|
| `index.html` | HTML renderizado en el servidor de la página `/`, sin datos del usuario |
| `_next/static/chunks/*.js` | 19 chunks de JavaScript compilado y minificado: la interfaz completa (inicio, compra, necesidades, Serranito, tickets, inventario rápido, recetas y escáner de códigos de barras) |
| `_next/static/css/index.CXYzi6fP.css` | Estilos (Tailwind compilado) |
| `_next/static/_vinext_fonts/` | Fuentes Geist y Geist Mono |
| `cesta-icon.svg`, `icon.svg`, `apple-touch-icon.png`, `og.png` | Iconos e imagen para compartir |

## Qué NO se ha podido recuperar

- **El código fuente original** (componentes React, TypeScript, configuración). Solo existe compilado; no hay *source maps*.
- **El servidor**: las rutas `/api/sync`, `/api/inventory`, `/api/products`, `/api/prices`, `/api/purchases`, `/api/insights`, `/api/preferences`, `/api/dog-reminders`, `/api/master-password` y `/api/v4`, y su base de datos. Se ejecutan en la plataforma de OpenAI y no se pueden ver desde fuera.
- Los chunks que solo se cargan bajo demanda y que no se descargaron durante la sesión, si los hubiera.

## Limitaciones

Esta rama es una **copia de archivo**: no funciona tal cual en GitHub Pages ni en otro alojamiento estático.
- Las rutas son absolutas (`/_next/...`), así que no cargan en `usuario.github.io/mi-cesta/`.
- Toda la funcionalidad depende de las rutas `/api/*`, que no existen fuera de la plataforma original.

Para tener el código fuente editable hay que pedirlo desde ChatGPT ("Editar el sitio en ChatGPT"). Con los archivos de esta rama también se puede reconstruir la app de forma guiada.
