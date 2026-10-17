# Cesta 5 · estado y pulido para el lanzamiento

## Qué está probado

| Prueba                         | Resultado | Cubre                                                                                                                                                                              |
| ------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calidad (`npm run check`)      | En verde  | Tipos (TypeScript 7), ESLint estricto con tipos, react-hooks y jsx-a11y, y Prettier                                                                                                |
| Unitarias (Vitest)             | 73        | Dominio, API completa, operaciones atómicas (todo o nada), consultas precisas, hooks de cada dominio (listas, despensa, mascota, tickets) y política de errores                    |
| Base de datos (PGlite)         | 26        | Migraciones, aislamiento entre hogares, invitaciones, listas que no se pisan, fotos privadas, salir de un hogar y `apply_batch` (orden, vuelta atrás, permisos, tablas permitidas) |
| Extremo a extremo (Playwright) | 21        | Todas las pantallas en WebKit con iPhone 14 y SE, OCR real sin CDN externos y auditoría de accesibilidad WCAG 2.1 AA en claro y oscuro                                             |
| Integración con Supabase real  | Opcional  | Necesita usuarios de prueba (`CESTA_IT_*`); no se ejecuta en CI                                                                                                                    |

### Qué no está probado todavía

- **Un iPhone real.** WebKit en ordenador no prueba la cámara, Face ID, las notificaciones, el teclado, la fuente SF ni la app instalada en la pantalla de inicio.
- **El registro desde la pantalla y el email de confirmación** con un correo real.

## Hecho en el estudio de mejora (fases 1 a 4)

- Lint, formato, errores visibles (ningún `catch` vacío) y tipos generados de Supabase con contrato de columnas.
- Aspecto nativo de iOS: colores del sistema, fuente SF, textos de 12 px como mínimo, zonas de toque de 44 pt, barra de pestañas, controles segmentados y listas agrupadas.
- Estado por dominio (`useLists`, `useProducts`, `useLots`, `usePet`, `useTickets`) y `CestaApp` como esqueleto con contexto; ningún archivo de código pasa de 300 líneas.
- Consultas precisas y operaciones de varios pasos atómicas con `apply_batch`.
- Arranque y caché: pantallas bajo demanda, PDF/escáner/OCR fuera de la caché inicial (779 KiB en lugar de 2.020 KiB), OCR servido desde la propia app.
- Accesibilidad: contraste AA y nombres para VoiceOver comprobados automáticamente.

## Imprescindible antes de lanzar (fuera del código)

1. **Prueba en iPhones reales** (iOS 17 y 18, Safari y app instalada): cámara del escáner, lectura de tickets con fotos reales de Mercadona, Lidl, Carrefour y Dia, Face ID, safe areas y teclado.
2. **Correo de Supabase**: configurar **SMTP propio** (el de Supabase solo envía unos pocos emails por hora) y plantillas de email en español.
3. **Eliminar cuenta y exportar datos.** Es la única función nueva que falta de verdad: la exige el RGPD (derechos de supresión y portabilidad) y Apple, si se publica en la App Store.
4. **Legal**: política de privacidad, términos y aviso de cookies. Ojo: el perfil de alérgenos y la dieta pueden considerarse **datos de salud** (categoría especial del RGPD), así que hace falta consentimiento explícito o no guardarlos en el servidor.
5. **Precios de Mercadona**: usa su tienda online sin API oficial. Para un producto comercial hay riesgo legal (condiciones de uso) y puede romperse en cualquier momento. Recomiendo desactivarlo de lanzamiento y quedarse con los precios aprendidos de los tickets, o buscar un acuerdo o fuente con licencia.
6. **Avisos de la mascota**: hoy solo saltan con la app abierta. Para avisos reales en iPhone hace falta Web Push (iOS 16.4+, app instalada) con un pequeño servidor. Si no se hace, conviene decir claramente «se avisa al abrir Cesta».
7. **Dominio propio** (no `github.io`): la app instalada queda ligada al dominio, así que cambiarlo después obliga a reinstalar y pierde los datos locales.
8. **Protección de contraseñas filtradas** en Supabase (Auth → Policies): un interruptor del panel; lo recomienda el asesor de seguridad.

## Pulido pendiente (sin funciones nuevas)

- Respetar el tamaño de texto del sistema (Dynamic Type).
- Limitar el crecimiento del historial (`stock_events`, `operations`).
- Pasar a la clave _publishable_ de Supabase.
- Textos de la interfaz en un catálogo único para revisar el tono.
- Primer uso: proponer definir el mínimo de 5–10 productos habituales; sin mínimos, Necesidades y AutoCesta no tienen nada que hacer.
- Pantallas de arranque de iOS (`apple-touch-startup-image`) para evitar el destello al abrir la app instalada.
- Cola sin conexión para el almacén, tickets y la mascota con Supabase (hoy solo las listas se reintentan solas; el resto avisa del error).
- El PIN de mantenimiento es de cada dispositivo: decidir si «administrador» debe ser un rol de la cuenta validado en el servidor.
- Monitorizar errores en producción (Sentry o similar) y analítica respetuosa con la privacidad.

**Contenido**

- Revisar el catálogo base (349 productos): quedan pares como «Garbanzo» / «Garbanzos».
- Ampliar las recetas (72) o permitir marcarlas como favoritas; hoy solo se puede descartar.
- Ampliar el lector de tickets con más formatos de supermercado y probarlo con un banco de tickets reales anonimizados.
