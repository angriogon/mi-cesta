import { Trash2 } from "lucide-react";
import type { Certainty, Prediction } from "../../domain/autocesta";
import type { Category } from "../../domain/categories";
import type { StockLike } from "../../domain/lists";
import { CategorySelect, Stepper } from "../../ui/primitives";

const SEPARATOR =
  "relative before:absolute before:inset-x-0 before:left-4 before:top-0 before:h-[0.5px] before:bg-separator";

/**
 * Una fila de la Despensa. En mantenimiento se editan categoría, existencias y mínimo;
 * fuera de él solo se ve lo que falta para llegar al mínimo.
 */
export function StockRow({
  item,
  separated,
  maintenance,
  certainty,
  prediction,
  updateStock,
  changeCategory,
  onRemove,
}: {
  item: StockLike;
  separated: boolean;
  maintenance: boolean;
  certainty?: Certainty;
  prediction?: Prediction;
  updateStock: (id: string, change: (item: StockLike) => StockLike) => void;
  changeCategory: (item: StockLike, category: Category) => void;
  onRemove: () => void;
}) {
  const missing = Math.max(0, item.minimum - item.quantity);
  return (
    <div className={`px-2 py-1.5 ${separated ? SEPARATOR : ""}`}>
      {maintenance ? (
        <div className="flex min-h-10 flex-wrap items-center gap-1">
          <p className="min-w-[8rem] flex-1 truncate text-[12px] font-semibold">{item.name}</p>
          <div className="w-[6rem] shrink-0">
            <CategorySelect
              value={item.category}
              onChange={(category) => changeCategory(item, category)}
              label={`Cambiar categoría de ${item.name}`}
            />
          </div>
          <Stepper
            value={item.quantity}
            label={`existencias de ${item.name}`}
            minusDisabled={item.quantity <= 0}
            onMinus={() => updateStock(item.id, (entry) => ({ ...entry, quantity: Math.max(0, entry.quantity - 1) }))}
            onPlus={() => updateStock(item.id, (entry) => ({ ...entry, quantity: entry.quantity + 1 }))}
          />
          <div className="flex shrink-0 items-center gap-0.5" aria-label={`Mínimo de ${item.name}`}>
            <span className="text-xs font-semibold text-muted-foreground">MÍN.</span>
            <Stepper
              value={item.minimum}
              label={`mínimo de ${item.name}`}
              minusDisabled={item.minimum <= 0}
              onMinus={() => updateStock(item.id, (entry) => ({ ...entry, minimum: Math.max(0, entry.minimum - 1) }))}
              onPlus={() => updateStock(item.id, (entry) => ({ ...entry, minimum: entry.minimum + 1 }))}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Eliminar ${item.name} del almacén`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex min-h-10 items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {item.name}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {certainty?.label && certainty.currentStock > 0 && certainty.confidence < 0.82
                ? certainty.label
                : prediction
                  ? `cada ${prediction.averageDays} d`
                  : ""}
            </span>
          </p>
          <span className="max-w-[7.4rem] shrink truncate rounded-lg bg-muted px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {item.quantity} de {item.minimum}
          </span>
          <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold tabular-nums text-primary">
            Faltan {missing}
          </span>
        </div>
      )}
    </div>
  );
}
