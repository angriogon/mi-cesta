/**
 * Registro de cambios que se enseña en Menú → Novedades. Es la fuente de la versión de la app:
 * la primera entrada es la versión actual (APP_VERSION y package.json deben coincidir con ella).
 *
 * Cada cambio que se publique añade una entrada nueva arriba (o amplía la de la versión aún sin
 * publicar): qué cambia para quien usa Cesta, en una frase por punto y sin jerga técnica.
 * `npm run check:novedades` (en el CI de cada PR) falla si se cambia la app sin tocar este archivo.
 */
export interface Release {
  version: string;
  /** Día de publicación, AAAA-MM-DD. */
  date: string;
  title: string;
  changes: string[];
}

export const RELEASES: Release[] = [
  {
    version: "5.11.1",
    date: "2026-10-18",
    title: "Marcas propias con código que empieza por 2",
    changes: [
      "Los envasados de marca propia cuyo código empieza por 2 (algunos de Alcampo o Lidl) ya se reconocen: antes se tomaban por etiquetas de la balanza.",
    ],
  },
  {
    version: "5.11.0",
    date: "2026-10-18",
    title: "Códigos de barras de cualquier súper",
    changes: [
      "Escáner nuevo, más rápido y certero: lee códigos pequeños, curvos, girados o con poca luz.",
      "Lee también los códigos de los packs (ITF-14), los GS1 DataBar de la fruta y la carne y los QR GS1 nuevos.",
      "«Hacer una foto del código» para los que la cámara en vídeo no pilla: la foto es más nítida y lee también códigos en blanco sobre oscuro.",
      "Reconoce productos de Mercadona, DIA, Lidl, Aldi, Eroski, Consum, Carrefour, Supeco, Alcampo y más, y dice de qué cadena es cada marca propia.",
      "Si no es comida, lo busca también en las bases abiertas de limpieza, cosmética y comida de mascotas.",
      "Etiquetas de la balanza (fruta, carne, charcutería…): dile qué es una vez y la reconocerá siempre, aunque cambie el precio o el peso.",
      "Si un producto sale con un nombre equivocado, «Corregir el nombre» lo arregla para tu hogar.",
      "Al escribir un código a mano, avisa si algún número está mal.",
    ],
  },
  {
    version: "5.10.0",
    date: "2026-10-18",
    title: "Novedades al día",
    changes: [
      "Novedades cuenta, versión a versión, lo que cambia de verdad en Cesta.",
      "La versión publicada se anota aquí siempre: no se publica nada sin su nota.",
    ],
  },
  {
    version: "5.9.0",
    date: "2026-10-18",
    title: "Sin conexión, administradores y más recetas",
    changes: [
      "Sin red puedes contar existencias, artículos de la mascota y guardar tickets: se envían solos al volver la conexión y un aviso dice cuántos cambios esperan.",
      "Aviso de pienso y otros artículos de la mascota bajo mínimos, al abrir la app y por notificación entre las 10:00 y las 12:00.",
      "«Administrador» es ahora un rol de la cuenta: el responsable lo da o lo quita en Mi hogar y ya no hace falta PIN.",
      "Los precios son solo los que pagas en tus tickets.",
      "54 productos más en el catálogo (aceitunas, setas, fideos, tofu, ambientadores…) y sus equivalencias de ticket.",
      "100 recetas: dos semanas más de menús, con todos sus ingredientes en el catálogo.",
    ],
  },
  {
    version: "5.8.0",
    date: "2026-10-18",
    title: "Menú que se desplaza",
    changes: [
      "Privacidad, Condiciones, Novedades y Equivalencias se pueden leer hasta el final.",
      "Si se publica una versión con la app abierta, se recarga sola en vez de fallar al cambiar de pantalla.",
    ],
  },
  {
    version: "5.7.0",
    date: "2026-10-18",
    title: "Equivalencias de tickets",
    changes: [
      "Cada línea del ticket suma al producto correcto: «PECHUGA FAMILIAR» va a Pechuga de pollo.",
      "En Menú → Equivalencias ves las de serie y las tuyas, y puedes cambiar o borrar cualquiera.",
      "Al corregir una equivalencia antigua, el producto creado desde el ticket se fusiona con el elegido (existencias, caducidades y precios) y se quitan las repetidas.",
    ],
  },
  {
    version: "5.6.0",
    date: "2026-10-18",
    title: "Tickets en PDF",
    changes: ["El ticket digital en PDF se lee por su texto, sin cámara: cada línea sale tal cual."],
  },
  {
    version: "5.5.0",
    date: "2026-10-18",
    title: "Primer uso y recetas favoritas",
    changes: [
      "En un hogar nuevo, Cesta propone los básicos que no pueden faltar.",
      "Recetas favoritas, guardadas para todo el hogar.",
      "Al abrir la app instalada, la pantalla de arranque ya no destella.",
      "Catálogo base sin productos repetidos.",
    ],
  },
  {
    version: "5.4.0",
    date: "2026-10-18",
    title: "Avisos de la mascota",
    changes: ["Los recordatorios de la mascota llegan como notificación aunque Cesta esté cerrada."],
  },
  {
    version: "5.3.0",
    date: "2026-10-18",
    title: "Tu cuenta y tus datos",
    changes: [
      "Eliminar cuenta y exportar mis datos desde el menú.",
      "Política de privacidad y condiciones de uso.",
      "Las alergias y alimentos a evitar solo se guardan con tu consentimiento, y se borran si lo retiras.",
    ],
  },
  {
    version: "5.2.0",
    date: "2026-10-18",
    title: "Lectura de tickets",
    changes: [
      "Los tickets fotografiados se leen mejor: se recorta el papel, se iguala la luz y se toleran manchas y arrugas.",
      "Sin zoom: ni pellizco ni doble toque, como una app nativa.",
      "Aquí se ve la fecha de la versión instalada y el botón «Buscar actualización».",
    ],
  },
  {
    version: "5.1.0",
    date: "2026-10-17",
    title: "Aviso de actualización",
    changes: [
      "Cuando hay una versión nueva aparece un aviso con «Actualizar».",
      "Hace falta cuenta para usar Cesta: los datos viven en tu hogar, no solo en el iPhone.",
      "Respeta el tamaño de texto que tengas elegido en el iPhone.",
    ],
  },
  {
    version: "5.0.0",
    date: "2026-10-17",
    title: "Cesta 5",
    changes: [
      "Cuentas y hogares compartidos: toda la familia ve la misma lista al momento.",
      "Se instala en la pantalla de inicio y aspecto nativo de iOS, con modo oscuro.",
      "Almacén con caducidades editables, deshacer al borrar y aviso al guardar la compra.",
      "Tickets con sus líneas, que aprenden tus correcciones.",
      "Mascota con artículos, mínimos y recordatorios.",
      "Arranque más rápido y mejor accesibilidad.",
    ],
  },
  {
    version: "4",
    date: "",
    title: "Cesta 4",
    changes: [
      "Inventario rápido por zonas, voz, tickets, cámara y fotografías.",
      "Memoria de consumo y caducidades estimadas.",
      "Sugerencias explicadas y controlables.",
      "Compra provisional conciliada con el ticket para evitar duplicados.",
      "Recetas encadenadas con tiempos e instrucciones realistas.",
    ],
  },
];
