/**
 * Textos legales de Cesta. Borrador a revisar por un profesional antes de publicar la app.
 * Los datos del responsable van en OWNER: rellénalos antes del lanzamiento.
 */
export const OWNER = {
  name: "[Nombre y apellidos o razón social]",
  taxId: "[NIF]",
  address: "[Dirección postal]",
  email: "[Email de contacto para privacidad]",
};

export const LEGAL_UPDATED = "18 de octubre de 2026";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  id: "privacy" | "terms" | "cookies";
  title: string;
  sections: LegalSection[];
}

const privacy: LegalDocument = {
  id: "privacy",
  title: "Política de privacidad",
  sections: [
    {
      heading: "Quién trata tus datos",
      paragraphs: [
        `Responsable: ${OWNER.name}, NIF ${OWNER.taxId}, ${OWNER.address}. Para cualquier cuestión de privacidad escribe a ${OWNER.email}.`,
      ],
    },
    {
      heading: "Qué datos guardamos",
      paragraphs: [
        "Cuenta: tu email y tu contraseña (guardada cifrada; nadie puede leerla).",
        "Hogar: el nombre del hogar, sus miembros, productos, almacén, caducidades, listas de la compra, tickets con sus líneas, importes y fotos, precios, código postal y los datos de la mascota que añadas.",
        "Alimentación especial: alergias y alimentos a evitar. Son datos de salud y solo se guardan si das tu consentimiento explícito en esa pantalla.",
        "Uso: un historial de movimientos del almacén (para prever cuándo se acaba cada producto) y de las últimas acciones (para poder deshacerlas).",
      ],
    },
    {
      heading: "Para qué y con qué base",
      paragraphs: [
        "Para prestarte el servicio que pides al registrarte: listas compartidas con tu hogar, control del almacén, lectura de tickets y avisos. La base es el contrato que aceptas al crear la cuenta.",
        "Los datos de alimentación especial se tratan solo con tu consentimiento explícito, para marcar los ingredientes que te afectan en las recetas. Puedes retirarlo cuando quieras borrándolos o desactivando el consentimiento.",
        "No usamos tus datos para publicidad, no hacemos perfiles comerciales y no los vendemos.",
      ],
    },
    {
      heading: "Dónde están y quién más los ve",
      paragraphs: [
        "Los datos se guardan en Supabase, en servidores de la Unión Europea (París), que actúa como encargado del tratamiento.",
        "La app se sirve desde GitHub Pages, que recibe tu dirección IP al descargarla, como cualquier web.",
        "Las fotos de los tickets se leen en tu propio dispositivo: el texto no sale de él salvo lo que guardas.",
        "Al escanear un código de barras, el código se consulta en Open Food Facts; no se envía tu email ni otros datos tuyos.",
        "Los miembros de tu hogar ven los datos del hogar, incluidas las alergias guardadas en él.",
      ],
    },
    {
      heading: "Cuánto tiempo",
      paragraphs: [
        "Mientras tengas la cuenta. El historial de movimientos del almacén se borra a los 400 días y el de acciones para deshacer, a los 30.",
        "Si eliminas tu cuenta se borra en el momento; los hogares en los que eras el único miembro se borran con todos sus datos y fotos.",
      ],
    },
    {
      heading: "Tus derechos",
      paragraphs: [
        "Puedes acceder a tus datos, corregirlos, borrarlos, llevártelos (Menú → Exportar mis datos), oponerte o limitar su uso. Desde la app puedes exportarlos y eliminar la cuenta; para lo demás escribe a " +
          `${OWNER.email}.`,
        "Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
      ],
    },
    {
      heading: "Edad mínima",
      paragraphs: ["Para crear una cuenta debes tener al menos 14 años."],
    },
  ],
};

const terms: LegalDocument = {
  id: "terms",
  title: "Condiciones de uso",
  sections: [
    {
      heading: "El servicio",
      paragraphs: [
        `Cesta es una app para organizar la compra, el almacén y los tickets de un hogar, ofrecida por ${OWNER.name}. Es gratuita mientras no se indique lo contrario.`,
      ],
    },
    {
      heading: "Tu cuenta",
      paragraphs: [
        "Eres responsable de guardar tu contraseña y de lo que se hace con tu cuenta. Invita a tu hogar solo a personas de confianza: verán y podrán cambiar sus datos.",
        "Puedes eliminar tu cuenta en cualquier momento desde el menú.",
      ],
    },
    {
      heading: "Lo que hace y lo que no hace Cesta",
      paragraphs: [
        "La lectura de tickets, las caducidades estimadas, las previsiones y los precios son orientativos y pueden contener errores: revísalos antes de fiarte de ellos.",
        "Los avisos de alergias son una ayuda, no una garantía: comprueba siempre el etiquetado de los productos.",
        "Los precios son los que has pagado en tus tickets; en otra tienda o en otro momento pueden ser distintos.",
      ],
    },
    {
      heading: "Uso correcto",
      paragraphs: [
        "No uses Cesta para guardar contenido ilegal ni para intentar acceder a datos de otros hogares.",
        "Podemos suspender cuentas que hagan un uso abusivo del servicio.",
      ],
    },
    {
      heading: "Cambios y ley aplicable",
      paragraphs: [
        "Si cambian estas condiciones te lo avisaremos en la app. Se rigen por la ley española.",
        `Contacto: ${OWNER.email}.`,
      ],
    },
  ],
};

const cookies: LegalDocument = {
  id: "cookies",
  title: "Cookies y almacenamiento",
  sections: [
    {
      heading: "Qué guardamos en tu dispositivo",
      paragraphs: [
        "Cesta no usa cookies de publicidad ni de analítica, ni cookies de terceros.",
        "Guarda en el almacenamiento del navegador solo lo necesario para funcionar: tu sesión, el hogar elegido, el tema claro u oscuro, borradores y una copia para usar la app sin conexión.",
        "Al ser estrictamente necesario para el servicio que pides, no requiere tu consentimiento (artículo 22.2 de la LSSI). Se borra al cerrar sesión, al eliminar la cuenta o al borrar los datos del sitio en Ajustes.",
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [privacy, terms, cookies];
