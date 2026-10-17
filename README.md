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

| Orden              | Qué comprueba                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`         | Lógica de dominio y API (Vitest)                                                                                                   |
| `npm run test:db`  | Migración, permisos entre hogares y funciones en un Postgres embebido (PGlite)                                                     |
| `npm run test:e2e` | Todas las pantallas en WebKit con tamaño de iPhone 14 y iPhone SE (Playwright). La prueba de OCR descarga el idioma la primera vez |

### Calidad de código

- `npm run check` = tipos (TypeScript 7) + ESLint + Prettier. Se ejecuta en CI antes de las pruebas.
- **TypeScript 6 y 7 conviven a propósito**: la app se compila con TypeScript 7 (paquete `typescript-7`), pero typescript-eslint aún necesita la API de TypeScript 6 (paquete `typescript`). Cuando typescript-eslint admita la 7, sobra el alias.
- **Errores**: ningún `catch` se queda vacío. Usa `src/lib/errors.ts`: `notifyError` para lo que el usuario espera ver (cargar, guardar) y `logError` para tareas opcionales. Los avisos repetidos se agrupan en uno.
- **Carga y caché**: Inicio va en el arranque; Compra, Despensa y Menú se descargan al abrirlas (y se precargan en segundo plano). React y Supabase van en bloques propios que el iPhone conserva entre versiones. Los bloques `ondemand-*` (PDF, escáner, OCR) no entran en la caché inicial de la PWA: se guardan al usarse.
- **OCR sin CDN**: el motor de Tesseract y el español se sirven desde `/ocr/` (los copia `vite.config.ts` desde `node_modules`). La e2e del OCR falla si la app pide algo fuera de su dominio.
- **Accesibilidad**: `e2e/a11y.spec.ts` audita cada pantalla con axe (WCAG 2.1 AA) en claro y en oscuro.
- **Operaciones atómicas**: las acciones de varios pasos (guardar compra, deshacer, cocinar, guardar ticket, resolver revisión, borrar producto o ticket) acumulan sus escrituras en un `BatchDb` y las aplican juntas con la función `apply_batch` de Supabase: o todas o ninguna. Para leer una fila usa `db.get` o `db.listBy` en lugar de leer la tabla entera.
- **Tipos de Supabase**: `src/data/database.types.ts` se genera con `npm run gen:types` (requiere la CLI de Supabase). `src/data/schema.ts` hace fallar la compilación si los tipos de la app y las columnas reales dejan de coincidir.

Para usar Cesta hace falta cuenta. El **modo local** (datos solo en ese dispositivo) es solo para pruebas: lo usan `npm run dev` sin variables de entorno y las pruebas automáticas (`VITE_FORCE_LOCAL=true`). Una versión publicada sin Supabase configurado muestra que falta la configuración en lugar de arrancar en local.

## Supabase (cuentas y hogar compartido)

El proyecto de producción es **Cesta** (`ykptjovevwmzxzuejhzp`, región París) en la organización RIOS VEGA HOUSE. Ya tiene aplicadas la migración, el catálogo base, las fotos privadas de tickets, el tiempo real, la función `mercadona-prices` y las URL de autenticación (`https://angriogon.github.io/mi-cesta/`).

La URL y la clave pública _anon_ están en `.env.production`: es una clave pensada para ir en la app, y la seguridad la dan los permisos de la base de datos. Nunca añadas la clave _service_role_.

Para montar otro proyecto desde cero:

1. Ejecuta `supabase/migrations/20261017000000_cesta.sql` en el SQL Editor (o `supabase db push`).
2. En **Authentication → URL Configuration**, pon la URL de la app como _Site URL_ y en _Redirect URLs_.
3. Despliega la función: `supabase functions deploy mercadona-prices`.
4. Cambia la URL y la clave en `.env.production`.

Prueba de integración contra un proyecto real (necesita tres usuarios de prueba confirmados):

```bash
CESTA_IT_URL=… CESTA_IT_KEY=… CESTA_IT_EMAILS=a@x,b@x,c@x CESTA_IT_PASSWORD=… npx vitest run src/data/supabase.integration.test.ts
```

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
