import { CalendarDays, Check, ListPlus, LoaderCircle, RefreshCw, Shuffle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CestaApi } from "../../data/api";
import type { InventoryLot, Preferences } from "../../data/types";
import type { StockLike } from "../../domain/lists";
import { dietConflicts } from "../../domain/recipes";
import { planWeek } from "../../domain/week-plan";
import { LOAD_FAILED, SAVE_FAILED, notifyError } from "../../lib/errors";
import { readJson, removeKey } from "../../lib/storage";
import { daysUntil, todayIso } from "../../lib/text";

/** Plan guardado: el día en que empieza y la receta de cada hueco. */
interface SavedPlan {
  start: string;
  ids: string[];
}

/** Un plan sirve los 7 días desde que se hizo. */
const current = (plan: SavedPlan | null | undefined): plan is SavedPlan =>
  Boolean(plan && daysUntil(plan.start) > -7 && daysUntil(plan.start) <= 0);

const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric" });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Planificador de la semana: comida y cena de 7 días elegidas con lo que hay en casa (ver planWeek).
 * El plan es del hogar: lo ven igual todos los miembros, se guarda en el servidor hasta que alguien
 * lo rehace o pasa la semana, y se vuelve a leer al abrirlo o al volver a la app. Cada comida se
 * puede cambiar por otra sin tocar las demás.
 */
export function WeekPlanner({
  api,
  stock,
  lots,
  skipped,
  preferences,
  onAddMissing,
  onClose,
}: {
  api: CestaApi;
  stock: StockLike[];
  lots: InventoryLot[];
  skipped: Set<string>;
  preferences: Preferences;
  onAddMissing: (names: string[]) => void;
  onClose: () => void;
}) {
  // Plan que la versión anterior guardaba solo en este dispositivo: se sube al hogar si no hay otro.
  const legacyKey = `cesta-week-plan:${api.db.householdId}`;
  const [saved, setSaved] = useState<SavedPlan | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const remote = await api.weekPlan();
      if (!active) return;
      const legacy = readJson<SavedPlan | null>(legacyKey, null);
      removeKey(legacyKey);
      setSaved(current(remote) ? remote : current(legacy) ? legacy : null);
      setLoaded(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load().catch(notifyError("cargar el plan de la semana", LOAD_FAILED));
    };
    load().catch((error: unknown) => {
      notifyError("cargar el plan de la semana", LOAD_FAILED)(error);
      if (active) setLoaded(true);
    });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [api, legacyKey]);
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
      setSaved({ start, ids });
      api.saveWeekPlan(start, ids).catch(notifyError("guardar el plan de la semana", SAVE_FAILED));
    },
    [api],
  );

  // Lo que se ve queda guardado para todo el hogar (también la comida nueva tras «Cambiar»).
  // Hasta haber leído el plan del hogar no se guarda nada, para no pisar el de otro miembro.
  useEffect(() => {
    if (!loaded) return;
    const ids = plan.slots.map((slot) => slot.recipe?.id ?? "");
    if (!saved || ids.join() !== saved.ids.join()) keep(ids, saved?.start ?? todayIso());
  }, [plan, saved, keep, loaded]);

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
    setChanged(new Set());
    setSaved(null);
    setMessage("Plan nuevo con lo que hay ahora en casa.");
  }

  if (!loaded)
    return (
      <section
        className="mb-3 flex items-center gap-2 rounded-xl bg-card p-3 text-xs font-semibold text-muted-foreground"
        aria-label="Plan de la semana"
      >
        <LoaderCircle className="size-4 animate-spin text-primary" /> Cargando el plan del hogar…
      </section>
    );

  return (
    <section className="mb-3 rounded-xl bg-card p-3" aria-label="Plan de la semana">
      <div className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Tu semana</p>
          <p className="text-xs text-muted-foreground">Plan del hogar: lo ve igual toda la familia.</p>
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
