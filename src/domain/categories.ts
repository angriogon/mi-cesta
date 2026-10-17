import { normalize } from "../lib/text";

export const CATEGORIES = [
  "Fruta y verdura",
  "Panadería",
  "Refrigerados",
  "Carne y pescado",
  "Congelados",
  "Bebidas",
  "Despensa",
  "Higiene y hogar",
  "Mascotas",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function asCategory(value: unknown): Category {
  if (value === "Frío") return "Refrigerados";
  return isCategory(value) ? value : "Despensa";
}

const RULES: { category: Category; words: string[] }[] = [
  {
    category: "Fruta y verdura",
    words: [
      "tomate", "platano", "manzana", "lechuga", "cebolla", "patata", "naranja", "limon", "aguacate",
      "pera", "calabacin", "zanahoria", "fruta", "verdura", "pimiento", "pepino", "ajo", "espinaca",
      "brocoli", "puerro", "berenjena", "uva", "fresa", "melon", "sandia", "mango", "kiwi", "champinon",
      "seta", "calabaza", "boniato", "lima", "rucula", "canonigo", "coliflor", "alcachofa", "judia verde",
    ],
  },
  { category: "Panadería", words: ["pan", "croissant", "baguette", "bollo", "magdalena", "tortilla trigo", "tostada", "picos"] },
  {
    category: "Refrigerados",
    words: ["leche", "yogur", "queso", "mantequilla", "huevo", "jamon", "nata", "kefir", "fiambre", "pavo cocido", "hummus", "gazpacho", "salmorejo"],
  },
  {
    category: "Carne y pescado",
    words: ["pollo", "ternera", "cerdo", "pavo", "carne", "salmon", "merluza", "atun fresco", "pescado", "gamba", "lomo", "bacalao", "lubina", "sepia", "dorada"],
  },
  { category: "Congelados", words: ["congelado", "helado", "pizza", "hielo"] },
  { category: "Bebidas", words: ["agua", "zumo", "refresco", "cerveza", "vino", "cafe", "te ", "bebida", "infusion"] },
  {
    category: "Higiene y hogar",
    words: [
      "papel", "detergente", "jabon", "champu", "bolsa", "limpiador", "lejia", "esponja", "pasta de dientes",
      "desodorante", "suavizante", "lavavajillas", "fregasuelos", "gel", "cuchilla", "servilleta",
    ],
  },
  { category: "Mascotas", words: ["pienso", "gato", "perro", "arena", "snack perro"] },
];

/** Deduce la categoría a partir del nombre, recordando antes las correcciones del usuario. */
export function guessCategory(name: string, memory: Record<string, string> = {}): Category {
  const key = normalize(name);
  const remembered = memory[key];
  if (isCategory(remembered)) return remembered;
  return RULES.find((rule) => rule.words.some((word) => key.includes(word)))?.category ?? "Despensa";
}

/** Categorías perecederas: al guardarlas se ofrece anotar la caducidad. */
export const PERISHABLE: Category[] = ["Fruta y verdura", "Refrigerados", "Carne y pescado"];

/** Vida útil estimada en días cuando el usuario no indica fecha de caducidad. */
export const ESTIMATED_SHELF_LIFE: Partial<Record<Category, number>> = {
  "Fruta y verdura": 7,
  Panadería: 3,
  Refrigerados: 10,
  "Carne y pescado": 3,
};
