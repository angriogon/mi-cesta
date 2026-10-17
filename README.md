# Mi Cesta — PWA para iPhone

Aplicación web instalable para gestionar una lista de la compra en iPhone, iPad y escritorio.

## Incluye
- Añadir y eliminar productos, cantidad y precio unitario opcional.
- Marcar productos como comprados.
- Filtros: todos, pendientes y comprados.
- Artículos pendientes, total estimado por comprar y total ya en la cesta.
- Deshacer al borrar artículos o al importar una lista.
- Exportación (en iPhone, mediante la hoja de compartir) e importación de la lista en JSON.
- Guardado local en el navegador y uso sin conexión.
- Diseño adaptado a móvil y configuración PWA para iOS.

## Publicar en GitHub Pages
El repositorio incluye un workflow (`.github/workflows/pages.yml`) que publica la app en cada push a `main`.

1. Entra en **Settings → Pages**.
2. En **Build and deployment → Source**, selecciona **GitHub Actions**.
3. Haz push a `main` (o lanza el workflow a mano desde **Actions**).
4. La URL tendrá el formato `https://TU-USUARIO.github.io/NOMBRE-REPOSITORIO/`.

Durante el despliegue, el workflow sustituye `__BUILD__` en `sw.js` por el commit publicado. Así cada publicación instala un service worker nuevo y los iPhones que ya tienen la app instalada reciben la actualización.

## Instalar en iPhone
1. Abre la URL publicada en **Safari**.
2. Pulsa **Compartir**.
3. Selecciona **Añadir a pantalla de inicio**.
4. Confirma **Añadir**. La aplicación aparecerá como un icono.

## Datos y privacidad
La lista se guarda en `localStorage` del navegador. No hay cuenta ni servidor, y no se sincroniza automáticamente con otros dispositivos.

Exporta la lista de vez en cuando si quieres conservar una copia; puedes restaurarla con **Importar lista**. En iOS, los datos de Safari y los de la app instalada en la pantalla de inicio están separados.
