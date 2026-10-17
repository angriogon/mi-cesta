# Mi Cesta — PWA para iPhone

Aplicación web instalable para gestionar una lista de la compra en iPhone, iPad y escritorio.

## Incluye
- Añadir y eliminar productos, cantidad y precio unitario opcional.
- Marcar productos como comprados.
- Filtros: todos, pendientes y comprados.
- Total estimado y número de unidades pendientes.
- Exportación de la lista en JSON.
- Guardado local en el navegador y caché básica para uso sin conexión.
- Diseño adaptado a móvil y configuración PWA para iOS.

## Publicar en GitHub Pages
1. Crea un repositorio público nuevo en GitHub.
2. Sube **el contenido de este ZIP** a la raíz del repositorio (no el ZIP como archivo).
3. Entra en **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
5. Espera a que GitHub publique la página. La URL tendrá el formato `https://TU-USUARIO.github.io/NOMBRE-REPOSITORIO/`.

## Instalar en iPhone
1. Abre la URL publicada en **Safari**.
2. Pulsa **Compartir**.
3. Selecciona **Añadir a pantalla de inicio**.
4. Confirma **Añadir**. La aplicación aparecerá como un icono.

## Datos y privacidad
La lista se guarda en `localStorage` del navegador. No hay cuenta ni servidor y no se sincroniza automáticamente con otros dispositivos. Exporta la lista periódicamente si quieres conservar una copia.

## Nota
Esta es una versión funcional autónoma reconstruida para poder publicarla; no es posible confirmar que sea idéntica a la versión que se creó anteriormente.
