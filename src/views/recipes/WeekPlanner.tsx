import { CalendarDays, Check, ListPlus, RefreshCw, Shuffle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryLot, Preferences } from "../../data/types";
import type { StockLike } from "../../domain/lists";
import { dietConflicts } from "../../domain/recipes";
import { planWeek } from "../../domain/week-plan";
import { readJson, removeKey, writeJson } from "../../lib/storage";
import { daysUntil, todayIso } from "../../lib/text";

/** Plan guardado en el dispositivo: el día en que empieza y la receta de cada hueco. */
interface SavedPlan {
  start: string;
  ids: string[];
}

const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric" });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Planificador de la semana: comida y cena de 7 días elegidas con lo que hay en casa (ver planWeek).
 * El plan se guarda en el dispositivo hasta que se rehace o pasa la semana; cada comida se puede
 * cambiar por otra sin tocar las demás.
 */
export function WeekPlanner({
  householdId,
  stock,
  lots,
  skipped,
  preferences,
  onAddMissing,
  onClose,
}: {
  householdId: string;
  stock: StockLike[];
  lots: InventoryLot[];
  skipped: Set<string>;
  preferences: Preferences;
  onAddMissing: (names: string[]) => void;
  onClose: () => void;
}) {
  const key = `cesta-week-plan:${householdId}`;
  const [saved, setSaved] = useState<SavedPlan | null>(() => {
    const stored = readJson<SavedPlan | null>(key, null);
    // Un plan sirve los 7 días desde que se hizo.
    return stored && daysUntil(stored.start) > -7 && daysUntil(stored.start) <= 0 ? stored : null;
  });
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  const plan = useMemo(() => {
    const now = saved ? new Date(`${saved.start}T12:00:00`) : new Date();
    const fixed: Record<number, string> = {};
    saved?.ids.forEach((id, index) => {
      if (id) fixed[index] = id;
    });
    return planWeek({
      stock: stock.map((item) => ({ name: item.name, category: item.category, quantity: item.quantity })),
      lots,
      now,
      exclude: new Set([...skipped, ...changed]),
      blocked: (recipe) => dietConflicts(recipe.ingredients, preferences).length > 0,
      fixed,
    });
  }, [saved, stock, lots, skipped, changed, preferences]);

  const keep = useCallback(
    (ids: string[], start: string) => {
      const next = { start, ids };
      writeJson(key, next);
      setSaved(next);
    },
    [key],
  );

  // Lo que se ve queda guardado (también la comida nueva tras «Cambiar»): así no cambia al volver.
  useEffect(() => {
    const ids = plan.slots.map((slot) => slot.recipe?.id ?? "");
    if (!saved || ids.join() !== saved.ids.join()) keep(ids, saved?.start ?? todayIso());
  }, [plan, saved, keep]);

  function change(index: number) {
    const current = plan.slots[index].recipe;
    if (!current) return;
    setChanged((set) => new Set([...set, current.id]));
    keep(
      plan.slots.map((slot, i) => (i === index ? "" : (slot.recipe?.id ?? ""))),
      saved?.start ?? todayIso(),
    );
    setMessage("Comida cambiada. Las demás siguen igual.");
  }

  function redo() {
    removeKey(key);
    setChanged(new Set());
    setSaved(null);
    setMessage("Plan nuevo con lo que hay ahora en casa.");
  }

  return (
    <section className="mb-3 rounded-xl bg-card p-3" aria-label="Plan de la semana">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Tu semana</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {plan.ready} de {plan.slots.length} comidas sin comprar nada · aprovecha {plan.used}{" "}
            {plan.used === 1 ? "producto" : "productos"} de casa
            {plan.missing.length ? ` · faltan ${plan.missing.length} ingredientes` : ""}.
          </p>
          {plan.used === 0 && (
            <p className="mt-1 text-xs leading-5 text-warning">
              No hay comida en el almacén: propone recetas con pocos ingredientes. Al guardar la compra o un ticket, el
              plan aprovechará lo que tengas.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar plan de la semana"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!plan.missing.length}
          onClick={() => onAddMissing(plan.missing)}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <ListPlus className="size-3.5" /> Añadir lo que falta
        </button>
        <button
          type="button"
          onClick={redo}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-muted px-2 text-xs font-semibold text-primary"
        >
          <RefreshCw className="size-3.5" /> Rehacer el plan
        </button>
      </div>
      {message && (
        <p className="mt-2 text-xs font-semibold text-primary" role="status">
          {message}
        </p>
      )}
      <ol className="mt-3 space-y-2">
        {Array.from({ length: plan.slots.length / 2 }, (_, day) => {
          const meals = plan.slots.slice(day * 2, day * 2 + 2);
          return (
            <li key={day} className="rounded-lg bg-muted/60 p-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {day === 0 ? "Hoy · " : ""}
                {capitalize(weekday.format(new Date(`${meals[0].date}T12:00:00`)))}
              </p>
              {meals.map((slot, offset) => (
                <div key={slot.meal} className="mt-1 flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${slot.missing.length ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"}`}
                  >
                    {slot.missing.length ? <ListPlus className="size-3" /> : <Check className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-semibold leading-5">
                      <span className="text-muted-foreground">{slot.meal} · </span>
                      {slot.recipe?.title ?? "Sin propuesta"}
                    </p>
                    <p className="text-xs leading-4 text-muted-foreground">
                      {slot.missing.length ? `Falta: ${slot.missing.join(", ")}` : "Con lo que hay en casa"}
                      {slot.saves.length ? ` · gasta antes de que caduque: ${slot.saves.join(", ")}` : ""}
                    </p>
                  </div>
                  {slot.recipe && (
                    <button
                      type="button"
                      onClick={() => change(day * 2 + offset)}
                      aria-label={`Cambiar ${slot.meal.toLowerCase()} del ${weekday.format(new Date(`${slot.date}T12:00:00`))}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-primary"
                    >
                      <Shuffle className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
