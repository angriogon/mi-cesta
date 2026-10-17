import { Check, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Overview } from "../../domain/autocesta";
import { Button } from "../../ui/primitives";

/** Sugerencias de AutoCesta: se eligen las que se quieren añadir; las de stock dudoso quedan aparte. */
export function Suggestions(props: {
  suggestions: Overview["suggestions"];
  pendingSuggestions: Overview["pendingSuggestions"];
  acceptSuggestions: (items: Overview["suggestions"]) => void;
  suppressSuggestion: (productId: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(props.suggestions.map((item) => item.productId)));
  }, [props.suggestions]);

  if (!props.suggestions.length && !props.pendingSuggestions.length) return null;
  return (
    <section className="mb-3 rounded-lg bg-primary-soft p-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Sugeridos por AutoCesta</p>
          <p className="text-xs text-muted-foreground">Preparados en segundo plano; tú decides qué añadir.</p>
        </div>
      </div>
      {props.suggestions.length > 0 && (
        <div className="mt-2 space-y-1">
          {props.suggestions.map((suggestion) => (
            <div key={suggestion.productId} className="flex items-center gap-2 rounded-xl bg-card px-2 py-1.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={selected.has(suggestion.productId)}
                aria-label={`Seleccionar ${suggestion.productName}`}
                onClick={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(suggestion.productId)) next.delete(suggestion.productId);
                    else next.add(suggestion.productId);
                    return next;
                  })
                }
                className="-m-1.5 flex size-8 shrink-0 items-center justify-center"
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-md border ${selected.has(suggestion.productId) ? "border-primary bg-primary text-white" : "border-border"}`}
                >
                  {selected.has(suggestion.productId) && <Check className="size-3" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {suggestion.quantity} × {suggestion.productName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{suggestion.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => props.suppressSuggestion(suggestion.productId)}
                className="px-1 py-2 text-xs font-semibold text-muted-foreground"
              >
                No sugerir
              </button>
            </div>
          ))}
        </div>
      )}
      {props.pendingSuggestions.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer py-1 text-xs font-semibold text-warning">
            {props.pendingSuggestions.length} pendientes por stock dudoso
          </summary>
          <div className="mt-1 space-y-1">
            {props.pendingSuggestions.map((suggestion) => (
              <div key={suggestion.productId} className="flex items-center gap-2 rounded-lg bg-warning-soft px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-xs">
                  {suggestion.productName} · {Math.round(suggestion.confidence * 100)} % certeza
                </span>
                <button
                  type="button"
                  onClick={() => props.acceptSuggestions([suggestion])}
                  className="px-1 py-1.5 text-xs font-semibold text-primary"
                >
                  Añadir
                </button>
                <button
                  type="button"
                  onClick={() => props.suppressSuggestion(suggestion.productId)}
                  className="px-1 py-1.5 text-xs font-semibold"
                >
                  No sugerir
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {props.suggestions.length > 0 && (
        <Button
          disabled={!selected.size}
          onClick={() => props.acceptSuggestions(props.suggestions.filter((item) => selected.has(item.productId)))}
          className="mt-2 h-10 w-full rounded-xl text-xs"
        >
          <Plus className="size-3.5" /> Añadir seleccionados
        </Button>
      )}
    </section>
  );
}
