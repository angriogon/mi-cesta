import type { Recipe } from "./recipes";
import { normalizeWords } from "../lib/text";

export interface Nutrients {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  kcal: number;
}

export function ingredientNutrients(ingredient: string): Nutrients {
  const t = normalizeWords(ingredient);
  if (
    /pollo|pavo|merluza|atun|bacalao|lubina|sepia|gamba|langostino|calamar|pulpo|mejillon|almeja|dorada|sardina|caballa|bonito|pescado/.test(
      t,
    )
  )
    return { protein: 19, carbs: 0, fat: 3, fiber: 0, kcal: 105 };
  if (/salmon/.test(t)) return { protein: 20, carbs: 0, fat: 11, fiber: 0, kcal: 185 };
  if (/carne|lomo|hamburguesa/.test(t)) return { protein: 21, carbs: 0, fat: 7, fiber: 0, kcal: 150 };
  if (/huevo/.test(t)) return { protein: 7, carbs: 1, fat: 5, fiber: 0, kcal: 75 };
  if (/garbanzo|lenteja|judia|alubia|hummus/.test(t)) return { protein: 9, carbs: 20, fat: 2, fiber: 7, kcal: 130 };
  if (/tofu/.test(t)) return { protein: 12, carbs: 2, fat: 7, fiber: 1, kcal: 120 };
  if (/queso|mozzarella|cottage/.test(t)) return { protein: 7, carbs: 2, fat: 4, fiber: 0, kcal: 75 };
  if (/arroz|pasta|espagueti|macarron|quinoa|cuscus|fideo|noodle/.test(t))
    return { protein: 4, carbs: 26, fat: 1, fiber: 2, kcal: 130 };
  if (/patata|boniato|pan|tortilla|fajita|arepa/.test(t))
    return { protein: 3, carbs: 20, fat: 1.5, fiber: 2, kcal: 105 };
  if (/aguacate|guacamole|anacardo|aceituna/.test(t)) return { protein: 2, carbs: 4, fat: 7, fiber: 4, kcal: 85 };
  return { protein: 1.5, carbs: 5, fat: 0.4, fiber: 2, kcal: 30 };
}

/** Estimación por ración; incluye una cucharadita de aceite de base. */
export function recipeNutrients(ingredients: string[]): Nutrients {
  return ingredients.reduce<Nutrients>(
    (total, ingredient) => {
      const n = ingredientNutrients(ingredient);
      return {
        protein: total.protein + n.protein,
        carbs: total.carbs + n.carbs,
        fat: total.fat + n.fat,
        fiber: total.fiber + n.fiber,
        kcal: total.kcal + n.kcal,
      };
    },
    { protein: 0, carbs: 0, fat: 2, fiber: 0, kcal: 18 },
  );
}

export function recipeSteps(recipe: Pick<Recipe, "title">): string[] {
  const t = normalizeWords(recipe.title);
  if (/pollo.*horno|pollo asado/.test(t))
    return [
      "Precalienta el horno a 200 °C y coloca pollo y verduras sazonados en una fuente.",
      "Hornea 35–45 min, girando el pollo a mitad de cocción; debe quedar bien hecho en el centro.",
      "Deja reposar 5 min y sirve con las verduras y sus jugos.",
    ];
  if (/pescado.*horno|papillote/.test(t))
    return [
      "Precalienta a 190 °C y prepara una cama de verduras finas.",
      "Añade el pescado, sazona y hornea 15–22 min según el grosor.",
      "Comprueba que se separa en lascas y sirve inmediatamente.",
    ];
  if (/ensalada/.test(t))
    return [
      "Lava, seca y corta todos los vegetales.",
      "Cocina la proteína hasta su punto y déjala templar.",
      "Mezcla justo antes de comer y aliña con moderación.",
    ];
  if (/crema|pure|sopa/.test(t))
    return [
      "Trocea de forma uniforme y rehoga 3–4 min con poco aceite.",
      "Cubre con agua o caldo y cuece 18–25 min hasta que esté tierno.",
      "Tritura, ajusta la textura y añade la proteína preparada.",
    ];
  if (/gazpacho|salmorejo/.test(t))
    return [
      "Trocea y tritura los ingredientes fríos hasta obtener una crema fina.",
      "Ajusta agua, sal y vinagre y enfría al menos 20 min.",
      "Prepara el acompañamiento y añádelo al servir.",
    ];
  if (/tortilla|revuelto|crepe/.test(t))
    return [
      "Corta el relleno y cocínalo primero con poco aceite hasta que esté tierno.",
      "Bate el huevo, mezcla y cocina a fuego medio-bajo.",
      "Cuaja por ambos lados o remueve hasta el punto deseado y sirve.",
    ];
  if (/pasta|espagueti|noodle|arroz|quinoa/.test(t))
    return [
      "Cuece el cereal o la pasta según el envase y reserva un poco de agua de cocción.",
      "Cocina verduras y proteína por separado hasta que estén hechas.",
      "Integra todo 2–3 min, ajusta la textura y sirve.",
    ];
  if (/wok|salteado/.test(t))
    return [
      "Corta todo en tiras finas y ten las salsas a mano: el wok va muy rápido.",
      "Saltea la proteína a fuego fuerte 3–4 min y resérvala.",
      "Saltea las verduras 3 min, devuelve la proteína, añade la salsa y sirve al momento.",
    ];
  if (/guiso|garbanzos|lentejas|potaje/.test(t))
    return [
      "Sofríe cebolla y el resto de verduras picadas 8–10 min a fuego medio.",
      "Añade las legumbres cocidas, las especias y caldo o agua hasta cubrir.",
      "Cuece 15–20 min a fuego suave, rectifica de sal y deja reposar 5 min.",
    ];
  if (/fajita|taco|burrito|wrap/.test(t))
    return [
      "Corta la proteína y las verduras en tiras y saltéalas con especias 6–8 min.",
      "Calienta las tortillas 20 s por cada lado en una sartén.",
      "Rellena, añade los acompañamientos frescos y enrolla.",
    ];
  if (/plancha/.test(t))
    return [
      "Seca bien la pieza y sazónala justo antes de cocinar.",
      "Plancha muy caliente con unas gotas de aceite: 2–4 min por lado según el grosor.",
      "Sirve con la guarnición recién hecha.",
    ];
  return [
    "Lava, corta y organiza los ingredientes antes de encender el fuego.",
    "Cocina primero la proteína y después las verduras con poco aceite.",
    "Combina, comprueba el punto de cocción, sazona y sirve.",
  ];
}

export function recipeMinutes(recipe: Pick<Recipe, "title">): number {
  const t = normalizeWords(recipe.title);
  if (/pollo.*horno|pollo asado/.test(t)) return 50;
  if (/guiso|paella|potaje|curry/.test(t)) return 45;
  if (/pescado.*horno|papillote|berenjena rellena|pizza/.test(t) || /crema|pure|sopa|patata|boniato/.test(t)) return 30;
  if (/pasta|espagueti|arroz|quinoa/.test(t)) return 25;
  if (/tortilla|revuelto|crepe|wok|plancha/.test(t)) return 18;
  if (/ensalada|gazpacho|salmorejo/.test(t)) return 15;
  return 25;
}
