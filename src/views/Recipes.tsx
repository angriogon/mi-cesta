import {
  CalendarDays,
  Check,
  ChevronDown,
  Heart,
  Clock,
  CookingPot,
  Leaf,
  Search,
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
  scoreRecipes,
  type RecipeFilter,
  type RecipeGoal,
} from "../domain/recipes";
import { Input, NativeSelect } from "../ui/primitives";
import { LOAD_FAILED, SAVE_FAILED, notifyError } from "../lib/errors";
import { RecipeDetails } from "./recipes/RecipeDetails";
import { WeekPlanner } from "./recipes/WeekPlanner";
import { ChainedPlan } from "./recipes/ChainedPlan";

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [planning, setPlanning] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    specialDietEnabled: false,
    allergens: [],
    avoided: [],
  });

  useEffect(() => {
    api.preferences().then(setPreferences).catch(notifyError("cargar preferencias", LOAD_FAILED));
    api.lots().then(setLots).catch(notifyError("cargar existencias", LOAD_FAILED));
    api.skippedRecipes().then(setSkipped).catch(notifyError("cargar recetas descartadas", LOAD_FAILED));
    api.favoriteRecipes().then(setFavorites).catch(notifyError("cargar recetas favoritas", LOAD_FAILED));
  }, [api]);

  const scored = useMemo(
    () => scoreRecipes(stock.map((item) => ({ name: item.name, category: item.category, quantity: item.quantity }))),
    [stock],
  );
  const visible = filterRecipes(scored, { filter, goal, query, skipped, lots, favorites });
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

  function toggleFavorite(id: string) {
    const on = !favorites.has(id);
    setFavorites((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    void api.recipeFavorite(id, on).catch(notifyError("guardar favorita", SAVE_FAILED));
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
        className="mb-2 w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:bg-card [&_select]:text-[0.8125rem]"
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

      {planning ? (
        <WeekPlanner
          householdId={api.db.householdId}
          stock={stock}
          lots={lots}
          skipped={skipped}
          preferences={preferences}
          onAddMissing={onAddMissing}
          onClose={() => setPlanning(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlanning(true)}
          className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          <CalendarDays className="size-4" /> Planificar la semana
        </button>
      )}

      {plan && !planning && <ChainedPlan plan={plan} onAddMissing={onAddMissing} onSkip={skip} />}

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar receta o ingrediente…"
          aria-label="Buscar receta o ingrediente"
          className="h-11 rounded-xl bg-card pl-9 text-[0.9375rem]"
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
            className={`h-8 rounded-[7px] px-1 text-[0.8125rem] ${filter === value ? "bg-thumb font-semibold text-foreground shadow-thumb" : "font-medium text-foreground"}`}
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
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : recipe.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-3 pl-3 text-left"
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
                      <p className="truncate text-[0.8125rem] font-semibold">{recipe.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {recipe.meal} ·{" "}
                        {recipe.missing.length ? `Faltan ${recipe.missing.length}` : "Lista para cocinar"} ·{" "}
                        <Clock className="size-2.5" /> {recipe.minutes} min
                      </p>
                    </div>
                    {conflicts.length > 0 && (
                      <TriangleAlert className="size-3.5 text-danger" aria-label="Contiene ingredientes de tu perfil" />
                    )}
                    <ChevronDown className={`size-4 text-muted-foreground ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(recipe.id)}
                    aria-pressed={favorites.has(recipe.id)}
                    aria-label={`Favorita: ${recipe.title}`}
                    className="flex size-11 shrink-0 items-center justify-center text-danger"
                  >
                    <Heart
                      className={`size-4 ${favorites.has(recipe.id) ? "fill-current" : "text-muted-foreground"}`}
                    />
                  </button>
                </div>
                {expanded && (
                  <RecipeDetails
                    recipe={recipe}
                    goal={goal}
                    conflicts={conflicts}
                    servings={servings}
                    setServings={setServings}
                    cooking={cooking === recipe.id}
                    onAddMissing={onAddMissing}
                    onCook={() => void cook(recipe)}
                    onSkip={() => skip(recipe.id)}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
