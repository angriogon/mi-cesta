/**
 * Textos compartidos de la interfaz, en un solo sitio para revisar el tono.
 *
 * Aquí van los textos que aparecen en varias pantallas o fuera de ellas (errores, avisos, botones
 * comunes). Los textos propios de una pantalla siguen en su componente, junto al diseño que los usa.
 *
 * Tono: tú, frases cortas, sin tecnicismos, y siempre qué puede hacer la persona a continuación.
 */
export const copy = {
  errors: {
    load: "No se han podido cargar algunos datos. Comprueba la conexión.",
    save: "No se ha podido guardar. Comprueba la conexión.",
    saveShort: "No se ha podido guardar.",
  },
  common: {
    undo: "Deshacer",
    close: "Cerrar",
    closeNotice: "Cerrar aviso",
  },
  update: {
    title: "Hay una versión nueva de Cesta",
    later: "Luego",
    apply: "Actualizar",
  },
  unconfigured: {
    title: "Cesta no está disponible",
    text: "Esta versión no tiene configurado el servidor de cuentas. Vuelve a intentarlo más tarde.",
  },
} as const;
