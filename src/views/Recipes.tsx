import {
  Check,
  ChevronDown,
  Clock,
  CookingPot,
  Leaf,
  Link2,
  ListPlus,
  PackageCheck,
  Search,
  ThumbsDown,
  TriangleAlert,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CestaApi } from "../data/api";
import type { InventoryLot, Preferences } from "../data/types";
import type { StockLike } from "../domain/lists";
import {
  chainedPlan,
  dietConflicts,
  filterRecipes,
  goalReason,
  recipeSteps,
  scoreRecipes,
  type Nutrients,
  type RecipeFilter,
  type RecipeGoal,
} from "../domain/recipes";
import { Button, Input, NativeSelect } from "../ui/primitives";
import { LOAD_FAILED, SAVE_FAILED, notifyError } from "../lib/errors";

function NutrientBars({ nutrients }: { nutrients: Nutrients }) {
  const rows: [string, number, number, string][] = [
    ["Proteínas", nutrients.protein, 50, "#2f6b48"],
    ["Hidratos", nutrients.carbs, 260, "#b88b3f"],
    ["Grasas", nutrients.fat, 70, "#a25631"],
    ["Fibra", nutrients.fiber, 25, "#658154"],
  ];
  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Estimación por ración</p>
        <span className="text-xs font-semibold text-primary">{Math.round(nutrients.kcal)} kcal</span>
      </div>
      <div className="space-y-2">
        {rows.map(([label, value, daily, color]) => (
          <div key={label} className="grid grid-cols-[4.2rem_1fr_2.7rem] items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-card" role="presentation">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, (value / daily) * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums">{Math.round(value)} g</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecipesView({
  api,
  stock,
  onAddMissing,
  onCook,
}: {
  api: CestaApi;
  stock: StockLike[];
  onAddMissing: (names: string[]) => void;
  onCook: (title: string, ingredients: string[], servings: number) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<RecipeFilter>("all");
  const [goal, setGoal] = useState<RecipeGoal>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [servings, setServings] = useState(2);
  const [cooking, setCooking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    specialDietEnabled: false,
    allergens: [],
    avoided: [],
  });

  useEffect(() => {
    api.preferences().then(setPreferences).catch(notifyError("cargar preferencias", LOAD_FAILED));
    api.lots().then(setLots).catch(notifyError("cargar existencias", LOAD_FAILED));
    api.skippedRecipes().then(setSkipped).catch(notifyError("cargar recetas descartadas", LOAD_FAILED));
  }, [api]);

  const scored = useMemo(
    () => scoreRecipes(stock.map((item) => ({ name: item.name, category: item.category, quantity: item.quantity }))),
    [stock],
  );
  const visible = filterRecipes(scored, { filter, goal, query, skipped, lots });
  const plan = useMemo(() => chainedPlan(scored, skipped), [scored, skipped]);
  const ready = scored.filter((recipe) => !recipe.missing.length).length;

  async function cook(recipe: (typeof scored)[number]) {
    setCooking(recipe.id);
    setMessage("");
    const ok = await onCook(recipe.title, recipe.present, servings);
    setCooking(null);
    const left = Math.max(0, servings - 1);
    setMessage(
      ok
        ? `Despensa actualizada · ${left} ${left === 1 ? "ración guardada" : "raciones guardadas"}.`
        : "No se ha podido actualizar la despensa.",
    );
    if (ok) api.lots().then(setLots).catch(notifyError("cargar existencias", LOAD_FAILED));
  }

  function skip(id: string) {
    setSkipped((current) => new Set([...current, id]));
    setOpen(null);
    setMessage("Te propondré otra opción y recordaré esta preferencia.");
    void api.recipeSkip(id).catch(notifyError("descartar receta", SAVE_FAILED));
  }

  return (
    <>
      <section className="mb-3 flex items-center gap-3 rounded-xl bg-primary-soft p-3 text-primary">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Utensils className="size-4.5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Recetas para decidir</p>
          <p className="text-xs">
            {scored.length} recetas · {ready} {ready === 1 ? "lista" : "listas"} con tu stock
          </p>
        </div>
      </section>

      <NativeSelect
        value={goal}
        onChange={(event) => setGoal(event.target.value as RecipeGoal)}
        aria-label="Qué quieres resolver hoy"
        className="mb-2 w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:bg-card [&_select]:text-[13px]"
      >
        <option value="all">¿Qué quieres resolver hoy?</option>
        <option value="expiry">Gastar lo que caduca</option>
        <option value="no-shop">Cocinar sin comprar</option>
        <option value="quick">Cocinar en 15 minutos</option>
        <option value="tomorrow">Dejar comida para mañana</option>
        <option value="clean">Ensuciar menos</option>
        <option value="opened">Aprovechar productos abiertos</option>
        <option value="freeze">Cocinar para congelar</option>
        <option value="cheap">Completar gastando poco</option>
      </NativeSelect>

      {plan && (
        <section className="mb-2 rounded-lg bg-warning-soft p-3">
          <div className="flex items-center gap-2 text-warning">
            <Link2 className="size-3.5" />
            <p className="text-xs font-semibold uppercase">Dos comidas, un mismo ingrediente</p>
          </div>
          <p className="mt-1.5 text-[12px] font-semibold">Hoy · {plan.first.title}</p>
          <p className="mt-1 text-[12px] font-semibold">Mañana · {plan.second.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Abres {plan.shared.join(", ")} hoy y lo terminas mañana.
            {plan.missing.length ? ` Solo comprar: ${plan.missing.join(", ")}.` : " No necesitas comprar nada."}
          </p>
          <div className="mt-2 flex gap-3">
            {plan.missing.length > 0 && (
              <button
                type="button"
                onClick={() => onAddMissing(plan.missing)}
                className="flex items-center gap-1 py-1 text-xs font-semibold text-primary"
              >
                <ListPlus className="size-3" /> Añadir lo que falta
              </button>
            )}
            <button
              type="button"
              onClick={() => skip(plan.first.id)}
              className="flex items-center gap-1 py-1 text-xs font-semibold text-warning"
            >
              <ThumbsDown className="size-3" /> No me apetece
            </button>
          </div>
        </section>
      )}

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar receta o ingrediente…"
          aria-label="Buscar receta o ingrediente"
          className="h-11 rounded-xl bg-card pl-9 text-[15px]"
        />
      </div>
      <div className="mb-3 grid grid-cols-4 rounded-[9px] bg-fill p-0.5" role="tablist" aria-label="Filtrar recetas">
        {(
          [
            ["all", "Todas"],
            ["ready", "Listas"],
            ["near", "Falta poco"],
            ["low", "Faltan más"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`h-8 rounded-[7px] px-1 text-[13px] ${filter === value ? "bg-thumb font-semibold text-foreground shadow-thumb" : "font-medium text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <p className="mb-2 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-primary" role="status">
          {message}
        </p>
      )}

      {visible.length === 0 ? (
        <section className="rounded-xl bg-card p-7 text-center">
          <CookingPot className="mx-auto size-7 text-primary" />
          <p className="mt-3 text-sm font-semibold">No hay coincidencias</p>
          <p className="mt-1 text-xs text-muted-foreground">Prueba con otro filtro o añade productos a tu almacén.</p>
        </section>
      ) : (
        <div className="space-y-2">
          {visible.map((recipe) => {
            const expanded = open === recipe.id;
            const conflicts = dietConflicts(recipe.ingredients, preferences);
            return (
              <section key={recipe.id} className="overflow-hidden rounded-lg bg-card">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : recipe.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-2.5 p-3 text-left"
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${recipe.missing.length ? (recipe.score >= 50 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger") : "bg-primary-soft text-primary"}`}
                  >
                    {recipe.missing.length ? (
                      recipe.score >= 50 ? (
                        <Leaf className="size-3.5" />
                      ) : (
                        <X className="size-3.5" />
                      )
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{recipe.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {recipe.meal} · {recipe.missing.length ? `Faltan ${recipe.missing.length}` : "Lista para cocinar"}{" "}
                      · <Clock className="size-2.5" /> {recipe.minutes} min
                    </p>
                  </div>
                  {conflicts.length > 0 && (
                    <TriangleAlert className="size-3.5 text-danger" aria-label="Contiene ingredientes de tu perfil" />
                  )}
                  <ChevronDown className={`size-4 text-muted-foreground ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
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
                      <Button
                        disabled={cooking === recipe.id || recipe.present.length === 0}
                        onClick={() => void cook(recipe)}
                        className="h-10 rounded-xl text-xs"
                      >
                        <PackageCheck className="size-3.5" />{" "}
                        {cooking === recipe.id ? "Actualizando…" : "Ya la he cocinado"}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => skip(recipe.id)}
                      className="mt-2 flex items-center gap-1 py-1 text-xs font-semibold text-muted-foreground"
                    >
                      <ThumbsDown className="size-3" /> No me apetece
                    </button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Se descuenta una unidad de cada ingrediente usado y las raciones sobrantes pasan al almacén.
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
