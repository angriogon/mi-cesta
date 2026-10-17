/** Tamaño del texto «cuerpo» de iOS con el ajuste de texto por defecto (17 pt). */
const IOS_DEFAULT_BODY = 17;
/** Por encima de esto las pantallas dejan de caber en un iPhone SE; iOS hace algo parecido en sus apps. */
const MAX_SCALE = 1.4;
const MIN_SCALE = 0.85;

/** Escala del texto respecto al tamaño por defecto, a partir del cuerpo de texto del sistema medido en px. */
export function textScale(systemBodyPx: number): number {
  if (!Number.isFinite(systemBodyPx) || systemBodyPx <= 0) return 1;
  const scale = systemBodyPx / IOS_DEFAULT_BODY;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) * 100) / 100;
}

/** Cuerpo de texto del sistema (Dynamic Type) en px; 0 si el navegador no lo conoce (fuera de Safari). */
function systemBodyPx(): number {
  if (!CSS.supports("font", "-apple-system-body")) return 0;
  const probe = document.createElement("span");
  probe.style.cssText = "font: -apple-system-body; position: absolute; visibility: hidden";
  probe.textContent = "A";
  document.body.append(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return size;
}

/**
 * Respeta el tamaño de texto elegido en Ajustes del iPhone (Dynamic Type).
 * Con el tamaño por defecto no cambia nada; si no, escala el texto (todo lo que va en rem).
 * Los espaciados van en px fijos (ver `--spacing` en index.css), así que solo crece el texto.
 * iOS no avisa del cambio: se vuelve a medir cada vez que se vuelve a la app.
 */
export function followSystemTextSize() {
  const apply = () => {
    const scale = textScale(systemBodyPx());
    document.documentElement.style.fontSize = scale === 1 ? "" : `${scale * 100}%`;
  };
  apply();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });
}
