# Cesta 5

Lista de la compra, despensa y tickets para el hogar, pensada para el iPhone (se instala desde Safari como app). Es la reconstrucción como código fuente de Cesta 4.0.1, que vivía en ChatGPT Sites, con base de datos propia y cuentas por hogar.

## Qué hace

- **Compra**: preparar la lista (con buscador del catálogo, categorías, precios aprendidos y PDF para compartir) y modo «En tienda» para ir marcando; al terminar, lo comprado pasa al almacén.
- **Necesidades**: existencias y mínimos por producto, caducidades y estados (cerrado, abierto, reservado, cocinado, congelado), radar de certeza y predicción de reposición. La edición está protegida con PIN o Face ID del dispositivo.
- **AutoCesta**: sugiere lo que falta, pregunta cuando no está segura de cuánto queda y explica cada sugerencia.
- **Tickets**: foto del ticket leída en el propio iPhone (Tesseract), revisión de lo dudoso, gasto por meses, precios aprendidos y conciliación con lo ya guardado para no duplicar.
- **Recetas**: 72 recetas ordenadas según lo que hay en casa, con objetivos (gastar lo que caduca, sin comprar, 15 minutos…), perfil alimentario y «ya la he cocinado».
- **Inventario rápido** por zonas: escribir, dictar, escanear códigos de barras, foto de la balda o traer lo de los últimos tickets.
- **Mascota**: comida y snacks con mínimos, «Dar 1» y avisos diarios.
- **Hogar compartido**: varias personas con su cuenta ven la misma lista al momento; se invita con un código.
- Deshacer, modo oscuro, funciona sin conexión y se instala en la pantalla de inicio.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173 (modo local si no hay Supabase configurado)
npm run test:all     # tipos + unitarias + base de datos + extremo a extremo en WebKit
```

| Orden | Qué comprueba |
|---|---|
| `npm test` | Lógica de dominio y API (Vitest) |
| `npm run test:db` | Migración, permisos entre hogares y funciones en un Postgres embebido (PGlite) |
| `npm run test:e2e` | Todas las pantallas en WebKit con tamaño de iPhone 14 y iPhone SE (Playwright). La prueba de OCR descarga el idioma la primera vez |

Sin variables de entorno la app funciona en **modo local**: los datos se guardan solo en ese dispositivo. Es útil para probar y para las pruebas automáticas.

## Puesta en marcha con Supabase (cuentas y hogar compartido)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región Europa).
2. En **SQL Editor**, ejecuta `supabase/migrations/20261017000000_cesta.sql`. También puedes usar `supabase db push` con la CLI.
3. En **Authentication → URL Configuration**, pon como *Site URL* `https://angriogon.github.io/mi-cesta/` y añádela también a *Redirect URLs*.
4. (Opcional) Despliega la función de precios: `supabase functions deploy mercadona-prices`.
5. En GitHub, en **Settings → Secrets and variables → Actions → Variables**, crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave pública *anon*, nunca la *service_role*).
6. Haz push a `main`: el workflow pasa las pruebas, compila y publica en GitHub Pages.

En local, copia `.env.example` a `.env.local` y rellena las mismas variables.

## Estructura

```
src/domain     Lógica pura: listas, tickets, recetas, AutoCesta, inventario rápido
src/data       API de la app (antes, rutas /api del servidor) sobre Supabase o almacenamiento local
src/views      Pantallas
src/app        Arranque, cuentas y hogar
supabase/      Migración SQL, pruebas de permisos y Edge Function de precios
e2e/           Pruebas de extremo a extremo
```

El catálogo base (`src/domain/seed-catalog.json`) también está en la migración (`catalog_template`). Si cambias uno, cambia el otro.

Consulta [LANZAMIENTO.md](LANZAMIENTO.md) para el estado de las pruebas y lo que queda para salir al mercado.
