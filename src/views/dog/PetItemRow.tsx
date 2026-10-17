import { Dog, Trash2 } from "lucide-react";
import type { DogItem } from "../../data/types";
import { Button, Stepper } from "../../ui/primitives";

/**
 * Un artículo de la mascota. Fuera de mantenimiento solo se «da 1»; en mantenimiento se
 * ajustan existencias y mínimo con el mismo Stepper que el resto de la app.
 */
export function PetItemRow({
  item,
  maintenance,
  confirmingDelete,
  onSave,
  onDelete,
}: {
  item: DogItem;
  maintenance: boolean;
  confirmingDelete: boolean;
  onSave: (previous: DogItem, next: DogItem, message: string) => void;
  onDelete: () => void;
}) {
  const lowStock = item.currentStock <= item.minimumStock;
  const setStock = (currentStock: number, message: string) => onSave(item, { ...item, currentStock }, message);
  const setMinimum = (minimumStock: number) => onSave(item, { ...item, minimumStock }, "Stock mínimo actualizado.");
  return (
    <section
      className={`rounded-lg border px-2.5 py-2 ${lowStock ? "border-danger-line bg-warning-soft" : "border-transparent bg-card"}`}
    >
      <div className="flex min-h-10 items-center gap-1.5">
        <Dog className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-semibold">{item.name}</p>
          <p className={`text-xs font-semibold ${lowStock ? "text-warning" : "text-muted-foreground"}`}>
            {lowStock ? `Reponer · mínimo ${item.minimumStock}` : `Mínimo ${item.minimumStock}`}
          </p>
        </div>
        {maintenance ? (
          <>
            <Stepper
              value={item.currentStock}
              label={`existencias de ${item.name}`}
              minusDisabled={item.currentStock <= 0}
              onMinus={() => setStock(Math.max(0, item.currentStock - 1), "Existencias actualizadas.")}
              onPlus={() => setStock(item.currentStock + 1, "Existencias actualizadas.")}
            />
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Eliminar ${item.name}`}
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${confirmingDelete ? "bg-danger text-white" : "bg-danger-soft text-danger"}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold tabular-nums">
              {item.currentStock}
            </span>
            <Button
              disabled={item.currentStock === 0}
              onClick={() => setStock(Math.max(0, item.currentStock - 1), `1 unidad de ${item.name} descontada.`)}
              className="h-10 rounded-xl px-3 text-xs"
            >
              Dar 1
            </Button>
          </>
        )}
      </div>
      {maintenance && (
        <div className="mt-1.5 flex items-center justify-end gap-1 rounded-lg bg-muted/70 px-2 py-1">
          <span className="mr-auto text-xs font-medium text-muted-foreground">Stock mínimo</span>
          <Stepper
            value={item.minimumStock}
            label={`mínimo de ${item.name}`}
            minusDisabled={item.minimumStock <= 0}
            onMinus={() => setMinimum(Math.max(0, item.minimumStock - 1))}
            onPlus={() => setMinimum(item.minimumStock + 1)}
          />
        </div>
      )}
    </section>
  );
}
