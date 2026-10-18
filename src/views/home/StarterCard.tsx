import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Product } from "../../data/types";
import { starterChoices } from "../../domain/starter";

/**
 * Primer uso: propone los básicos que no deberían faltar. Con un toque se marcan o desmarcan y al
 * guardar quedan con su mínimo; desde ahí Necesidades y AutoCesta ya saben qué reponer.
 */
export function StarterCard({
  products,
  onSave,
  onDismiss,
}: {
  products: Product[];
  onSave: (choices: { productId: string; minimum: number }[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const choices = useMemo(() => starterChoices(products), [products]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(choices.map((choice) => choice.product.id)));
  const [busy, setBusy] = useState(false);
  if (!choices.length) return null;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="rounded-xl bg-card p-4" aria-label="Empieza por lo básico">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">¿Qué no puede faltar en casa?</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Marca tus básicos: Cesta te avisará cuando se acaben. Podrás cambiarlos en Necesidades.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ahora no"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-fill"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {choices.map(({ product }) => {
          const on = selected.has(product.id);
          return (
            <button
              key={product.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(product.id)}
              className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
            >
              {on && <Check className="size-3.5" />}
              {product.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy || selected.size === 0}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(
              choices
                .filter(({ product }) => selected.has(product.id))
                .map(({ product, minimum }) => ({ productId: product.id, minimum })),
            );
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        Guardar {selected.size} {selected.size === 1 ? "básico" : "básicos"}
      </button>
    </section>
  );
}
