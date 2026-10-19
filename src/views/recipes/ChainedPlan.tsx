import { Link2, ListPlus, ThumbsDown } from "lucide-react";
import type { chainedPlan } from "../../domain/recipes";

/** Dos comidas que comparten ingrediente: se abre hoy y se termina mañana. */
export function ChainedPlan({
  plan,
  onAddMissing,
  onSkip,
}: {
  plan: NonNullable<ReturnType<typeof chainedPlan>>;
  onAddMissing: (names: string[]) => void;
  onSkip: (id: string) => void;
}) {
  return (
    <section className="mb-2 rounded-lg bg-warning-soft p-3">
      <div className="flex items-center gap-2 text-warning">
        <Link2 className="size-3.5" />
        <p className="text-xs font-semibold uppercase">Dos comidas, un mismo ingrediente</p>
      </div>
      <p className="mt-1.5 text-[0.75rem] font-semibold">Hoy · {plan.first.title}</p>
      <p className="mt-1 text-[0.75rem] font-semibold">Mañana · {plan.second.title}</p>
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
          onClick={() => onSkip(plan.first.id)}
          className="flex items-center gap-1 py-1 text-xs font-semibold text-warning"
        >
          <ThumbsDown className="size-3" /> No me apetece
        </button>
      </div>
    </section>
  );
}
