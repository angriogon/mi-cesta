# Cesta 5 · estado y pulido para el lanzamiento

## Qué está probado

| Prueba                         | Resultado | Cubre                                                                                                                                                                                              |
| ------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calidad (`npm run check`)      | En verde  | Tipos (TypeScript 7), ESLint estricto con tipos, react-hooks y jsx-a11y, y Prettier                                                                                                                |
| Unitarias (Vitest)             | 132       | Dominio, API completa, operaciones atómicas, hooks de cada dominio, errores, escala de texto, ruido de OCR, búsqueda del papel, exportación, consentimiento y códigos de barras con el lector real |
| Base de datos (PGlite)         | 50        | Migraciones, aislamiento entre hogares, invitaciones, fotos privadas, `apply_batch`, limpieza del historial, eliminar cuenta, avisos push y catálogo                                               |
| Extremo a extremo (Playwright) | 34        | Todas las pantallas en WebKit con iPhone 14 y SE, OCR real sin CDN, WCAG 2.1 AA en claro y oscuro, texto al 140 %, primer uso, favoritas, menú legal y escáner con fotos de códigos                |
| Tickets reales                 | Opcional  | `CESTA_REAL_TICKETS=carpeta`: fotos reales fuera del repositorio con lo esperado en JSON (hoy, Mercadona: 46/46 líneas)                                                                            |
| Integración con Supabase real  | Opcional  | Necesita usuarios de prueba (`CESTA_IT_*`); no se ejecuta en CI                                                                                                                                    |

### Qué no está probado todavía

- **Avisos push en un iPhone real** (app instalada): activarlos en Mascota y recibir un recordatorio con Cesta cerrada.
- **Eliminar cuenta y exportar datos** con una cuenta real.
- **El registro desde la pantalla y el email de confirmación** con un correo real.
- **Tickets de otros supermercados** (Lidl, Carrefour, Dia) con fotos reales.
- **Un ticket digital real de Mercadona en PDF**: las pruebas usan PDF generados con el mismo formato.

## Hecho

- Lint, formato, errores visibles y tipos generados de Supabase con contrato de columnas.
- Aspecto nativo de iOS, Dynamic Type (85 %–140 %), sin zoom y pantallas de arranque iguales al splash.
- Estado por dominio y `CestaApp` como esqueleto con contexto; ningún archivo de código pasa de 300 líneas.
- Consultas precisas y operaciones atómicas con `apply_batch`.
- Arranque ligero (pantallas bajo demanda, PDF/escáner/OCR fuera de la caché inicial) y OCR servido desde la propia app.
- Escáner con ZXing C++ (WebAssembly servido por la app): EAN/UPC, ITF-14, GS1 DataBar, GS1-128 y QR GS1 Digital Link; foto del código; etiquetas de la balanza recordadas por artículo; búsqueda en Open Food, Products, Beauty y Pet Food Facts; marca propia → cadena.
- Accesibilidad: contraste AA y nombres para VoiceOver comprobados automáticamente.
- Actualización con aviso; en Novedades, la fecha de la versión instalada, «Buscar actualización» y el registro de cambios de cada versión (`src/copy/novedades.ts`, comprobado en el CI).
- Para usar Cesta hace falta cuenta: el modo local es solo para pruebas y desarrollo.
- Historial limitado (400 días de movimientos, 30 de deshacer) con limpieza nocturna; clave _publishable_.
- **Lectura de tickets reales**: recorte del papel, luz igualada e intérprete tolerante al ruido.
- **Tickets en PDF** (ticket digital): se lee su texto tal cual, sin cámara ni OCR; un PDF escaneado pasa por el OCR.
- **Equivalencias de tickets**: cada línea va a un producto del almacén (PECHUGA FAMILIAR → Pechuga de pollo). Hay equivalencias de serie para Mercadona, se puede cambiar el producto de cada línea al revisar (y se recuerda) y se gestionan en Menú → Equivalencias de tickets. Así el almacén y las recetas cuadran con lo que se compra.
- **Eliminar cuenta y exportar mis datos** (RGPD: supresión y portabilidad).
- **Textos legales** (privacidad, condiciones y cookies) y consentimiento explícito para alergias y dieta.
- **Avisos push de la mascota** con Cesta cerrada (pg_cron + Edge Function `pet-push` + Vault).
- Primer uso con 18 básicos propuestos, recetas favoritas y catálogo base sin duplicados (345 productos).
- Textos compartidos en `src/copy/es.ts` y legales en `src/copy/legal.ts`.
- **Cola sin conexión** para almacén, tickets (con su foto) y mascota: se envía al volver la red.
- **Administrador como rol de la cuenta** (Responsable, Administrador, Miembro), comprobado en el servidor.
- **Aviso de artículos de la mascota bajo mínimos**, en la app y por push (10:00–12:00).
- **Precios solo de tus tickets**: fuera la tienda online de Mercadona y el código postal.
- **Catálogo de 399 productos** y **100 recetas**, todos sus ingredientes en el catálogo.

## Imprescindible antes de lanzar (fuera del código)

1. **Rellenar los datos del responsable** en `src/copy/legal.ts` (`OWNER`) y que un profesional revise los textos legales.
2. **Correo de Supabase**: SMTP propio (el de Supabase solo envía unos pocos emails por hora) y plantillas en español.
3. **Dominio propio** (no `github.io`) antes de que la gente instale la app.
4. **Protección de contraseñas filtradas** en Supabase (Authentication → Attack Protection): interruptor del panel; disponible en el plan Pro.
5. **Pruebas en iPhones reales** de lo que no cubren las automáticas (arriba).

## Pulido pendiente

- Monitorizar errores en producción (necesita una cuenta de Sentry o similar).
- Formatos de ticket de otros supermercados (Lidl, Carrefour, Dia) con un banco de tickets reales.
- Llevar a `src/copy/es.ts` los textos propios de cada pantalla si se quiere revisar todo el tono en un solo archivo.
