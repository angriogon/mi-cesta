/**
 * Cesta se comporta como una app nativa: sin pellizcar para ampliar ni doble toque.
 * Safari en iOS ignora `user-scalable=no`, así que se cancelan sus gestos de zoom.
 * El tamaño del texto se ajusta con el del sistema (Dynamic Type), que sí respeta la accesibilidad.
 */
export function blockZoom() {
  const cancel = (event: Event) => event.preventDefault();
  // Gestos de pellizco propios de Safari.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(name, cancel);
  // Pellizco con dos dedos en otros navegadores.
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
}
