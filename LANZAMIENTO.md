# Cesta 5 · estado y pulido para el lanzamiento

## Qué está probado

| Prueba | Resultado | Cubre |
|---|---|---|
| Unitarias (Vitest) | 39/39 | Listas, emparejamiento de nombres, lectura de tickets de Mercadona (incluido el peso), recetas, inventario rápido, AutoCesta y toda la API (compra → almacén → ticket sin duplicar, deshacer, cocinar, revisiones que aprenden, precios, mascota, códigos de barras, restablecer) |
| Base de datos (PGlite) | 20/20 | Migración completa, aislamiento entre hogares, invitaciones, listas que no se pisan, fotos privadas, salir de un hogar |
| Extremo a extremo (Playwright, WebKit) | 19/19 (estable en 2 repeticiones) | Todas las pantallas en iPhone 14 e iPhone SE: compra, tienda, caducidades, mantenimiento con PIN y recuperación, AutoCesta, tickets a mano y con **OCR real**, mascota, recetas, inventario rápido, códigos de barras, menú, restablecer, persistencia, modo oscuro y que nada se salga de la pantalla |

### Qué no está probado todavía
- **Un iPhone real.** WebKit en ordenador no prueba la cámara, Face ID, las notificaciones, el teclado ni la app instalada en la pantalla de inicio.
- **El modo con Supabase de verdad.** Las funciones SQL y los permisos están probados en un Postgres embebido. El registro, el email de confirmación, el tiempo real y la subida de fotos necesitan un proyecto real.
- **La función de precios de Mercadona desplegada.** El formato de la tienda online se comprobó a mano el 17/10/2026.

## Fallos del original corregidos
1. Lo caducado aparecía como «hoy» en Inicio.
2. Los tickets se guardaban con 0 líneas.
3. «Ahora no» en las caducidades dejaba los productos sin seguimiento: ahora se estima la fecha y se puede poner o cambiar después.
4. El icono de la pestaña se veía como una mancha (trazos 4 veces más gruesos) y el icono del iPhone tenía esquinas blancas.
5. El plan B en la tienda renombraba el producto en lugar de quitarlo de la lista.
6. Borrar, vaciar la lista o retirar un lote no se podía deshacer.
7. Pulsar «+» varias veces seguidas podía perder pulsaciones.
8. La vista de la página `og.png` apuntaba a `localhost`; el zoom estaba bloqueado (accesibilidad).
9. No había manifiesto ni service worker: no funcionaba sin conexión ni se instalaba bien.

## Imprescindible antes de lanzar
1. **Prueba en iPhones reales** (iOS 17 y 18, Safari y app instalada): cámara del escáner, lectura de tickets con fotos reales de Mercadona, Lidl, Carrefour y Dia, Face ID, safe areas y teclado.
2. **Supabase en producción**: ejecutar la migración y probar con 2 cuentas en 2 dispositivos (invitación, tiempo real, conflicto de listas, fotos). Configurar **SMTP propio** (el de Supabase solo envía unos pocos emails por hora) y plantillas de email en español.
3. **Eliminar cuenta y exportar datos.** Es la única función nueva que falta de verdad: la exige el RGPD (derechos de supresión y portabilidad) y Apple, si se publica en la App Store.
4. **Legal**: política de privacidad, términos y aviso de cookies. Ojo: el perfil de alérgenos y la dieta pueden considerarse **datos de salud** (categoría especial del RGPD), así que hace falta consentimiento explícito o no guardarlos en el servidor.
5. **Precios de Mercadona**: usa su tienda online sin API oficial. Para un producto comercial hay riesgo legal (condiciones de uso) y puede romperse en cualquier momento. Recomiendo desactivarlo de lanzamiento y quedarse con los precios aprendidos de los tickets, o buscar un acuerdo o fuente con licencia.
6. **Tesseract en el propio servidor**: ahora el motor y el idioma se descargan de jsDelivr la primera vez. Servirlos desde Cesta evita depender de un tercero y permite leer tickets sin conexión.
7. **Avisos de la mascota**: hoy solo saltan con la app abierta. Para avisos reales en iPhone hace falta Web Push (iOS 16.4+, app instalada) con un pequeño servidor. Si no se hace, conviene decir claramente «se avisa al abrir Cesta».
8. **Dominio propio** (no `github.io`): la app instalada queda ligada al dominio, así que cambiarlo después obliga a reinstalar y pierde los datos locales.

## Pulido (sin funciones nuevas)
**Usabilidad y accesibilidad**
- Muchas etiquetas usan textos de 7–10 px heredados del original: subir el mínimo a 11–12 px y respetar el tamaño de texto del sistema (Dynamic Type).
- Varios botones miden 28–36 px; Apple recomienda 44 pt como mínimo (los «−/+» y las papeleras sobre todo).
- En Preparar, el selector de categoría recorta nombres largos («Tomate ensala…»): pasar la categoría a una segunda línea o a un toque largo.
- El botón de menú y el título flotan sobre el contenido al hacer scroll: añadir una franja superior con desenfoque.
- Hacer una pasada completa con VoiceOver y revisar el contraste (WCAG AA) de los textos grises sobre los fondos verdes claros.
- Primer uso: proponer definir el mínimo de 5–10 productos habituales; sin mínimos, Necesidades y AutoCesta no tienen nada que hacer.
- Pantallas de arranque de iOS (`apple-touch-startup-image`) para evitar el destello blanco al abrir la app instalada.

**Robustez**
- Cola sin conexión para el almacén, tickets y la mascota con Supabase (hoy solo las listas se reintentan solas; el resto avisa del error).
- El PIN de mantenimiento es de cada dispositivo: en un hogar compartido cualquier miembro puede crear el suyo. Decidir si «administrador» debe ser un rol de la cuenta (el creador del hogar) validado en el servidor.
- Monitorizar errores en producción (Sentry o similar) y añadir analítica respetuosa con la privacidad.
- Limitar el crecimiento del historial (`stock_events`, `operations`) archivando lo de más de 12 meses.

**Contenido**
- Revisar el catálogo base (349 productos): quedan pares como «Garbanzo» / «Garbanzos».
- Ampliar las recetas (72) o permitir marcarlas como favoritas; hoy solo se puede descartar.
- Ampliar el lector de tickets con más formatos de supermercado y probarlo con un banco de tickets reales anonimizados.

**Rendimiento**
- El código principal pesa 390 KB (113 KB comprimido) porque incluye Supabase también en modo local; separarlo ahorraría unos 100 KB.
- La primera instalación descarga 1,9 MB para funcionar sin conexión (incluye el PDF y el escáner); se pueden dejar fuera de la caché inicial.
