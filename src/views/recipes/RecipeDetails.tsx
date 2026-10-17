import { Check, Leaf, ListPlus, PackageCheck, ThumbsDown, X } from "lucide-react";
import { goalReason, recipeSteps, type RecipeGoal, type ScoredRecipe } from "../../domain/recipes";
import { Button, NativeSelect } from "../../ui/primitives";
import { NutrientBars } from "./NutrientBars";

/** Detalle desplegado de una receta: ingredientes, nutrientes, pasos y cocinar. */
export function RecipeDetails({
  recipe,
  goal,
  conflicts,
  servings,
  setServings,
  cooking,
  onAddMissing,
  onCook,
  onSkip,
}: {
  recipe: ScoredRecipe;
  goal: RecipeGoal;
  conflicts: string[];
  servings: number;
  setServings: (value: number) => void;
  cooking: boolean;
  onAddMissing: (names: string[]) => void;
  onCook: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="border-t-[0.5px] border-separator px-3 pb-3">
      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-xs font-semibold text-warning">
        <Leaf className="size-3" />
        {goalReason(goal, recipe)}
      </p>
      {conflicts.length > 0 && (
        <p className="mt-2 rounded-lg bg-danger-soft px-2 py-1.5 text-xs font-semibold text-danger">
          Revisa tu perfil: {conflicts.join(", ")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {recipe.ingredients.map((ingredient) => {
          const present = recipe.present.includes(ingredient);
          return (
            <span
              key={ingredient}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${present ? "bg-primary-soft text-primary " : "bg-danger-soft text-danger"}`}
            >
              {present ? <Check className="size-2.5" /> : <X className="size-2.5" />}
              {ingredient}
            </span>
          );
        })}
      </div>
      {recipe.missing.length > 0 && (
        <Button
          variant="outline"
          onClick={() => onAddMissing(recipe.missing)}
          className="mt-3 h-10 w-full rounded-xl text-xs"
        >
          <ListPlus className="size-3.5" /> Añadir ingredientes a la lista
        </Button>
      )}
      <NutrientBars nutrients={recipe.nutrients} />
      <ol className="mt-3 space-y-1.5">
        {recipeSteps(recipe).map((step, index) => (
          <li key={step} className="flex gap-2 text-xs leading-4">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-3 grid grid-cols-[6rem_1fr] gap-2">
        <NativeSelect
          value={String(servings)}
          onChange={(event) => setServings(Number(event.target.value))}
          aria-label="Raciones"
          className="w-full [&_select]:h-10 [&_select]:rounded-xl [&_select]:text-xs"
        >
          {[1, 2, 3, 4].map((value) => (
            <option key={value} value={value}>
              {value} {value === 1 ? "ración" : "raciones"}
            </option>
          ))}
        </NativeSelect>
        <Button disabled={cooking || recipe.present.length === 0} onClick={onCook} className="h-10 rounded-xl text-xs">
          <PackageCheck className="size-3.5" /> {cooking ? "Actualizando…" : "Ya la he cocinado"}
        </Button>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-2 flex items-center gap-1 py-1 text-xs font-semibold text-muted-foreground"
      >
        <ThumbsDown className="size-3" /> No me apetece
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Se descuenta una unidad de cada ingrediente usado y las raciones sobrantes pasan al almacén.
      </p>
    </div>
  );
}
