import { Trash2 } from "lucide-react";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { QuickItem } from "../../data/types";
import { categoryForLocation } from "../../domain/quick";
import { Input } from "../../ui/primitives";

/** Productos contados en la zona: nombre y cantidad editables, con aviso de los que conviene revisar. */
export function QuickItemList({
  items,
  setItems,
  location,
}: {
  items: QuickItem[];
  setItems: Dispatch<SetStateAction<QuickItem[]>>;
  location: string;
}) {
  const counts = useMemo(
    () => ({
      ready: items.filter((item) => item.confidence >= 0.8).length,
      review: items.filter((item) => item.confidence < 0.8).length,
    }),
    [items],
  );
  if (!items.length) return null;
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{items.length} productos</p>
        <p className="text-xs text-muted-foreground">
          <b className="text-primary">{counts.ready}</b> listos · <b className="text-warning">{counts.review}</b>{" "}
          revisar
        </p>
      </div>
      <div className="overflow-hidden rounded-lg bg-card">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`grid grid-cols-[1fr_4rem_2.2rem] items-center gap-1.5 px-2 py-2 ${index ? "border-t-[0.5px] border-separator" : ""}`}
          >
            <div className="min-w-0">
              <Input
                value={item.name}
                aria-label="Nombre del producto"
                onChange={(event) =>
                  setItems((list) =>
                    list.map((entry) =>
                      entry.id === item.id
                        ? {
                            ...entry,
                            name: event.target.value,
                            category: categoryForLocation(event.target.value, location),
                            confidence: 0.95,
                          }
                        : entry,
                    ),
                  )
                }
                className="h-9 border-0 bg-transparent px-1 text-[0.8125rem] font-semibold"
              />
              <p className={`px-1 text-xs font-semibold ${item.confidence >= 0.8 ? "text-primary" : "text-warning"}`}>
                {item.confidence >= 0.8 ? "Identificado" : "Revisar"} · {item.source} · {item.category}
              </p>
            </div>
            <Input
              inputMode="decimal"
              value={item.quantity}
              aria-label={`Cantidad de ${item.name}`}
              onChange={(event) =>
                setItems((list) =>
                  list.map((entry) =>
                    entry.id === item.id
                      ? {
                          ...entry,
                          quantity: Math.max(0.01, Number(event.target.value.replace(",", ".")) || 1),
                        }
                      : entry,
                  ),
                )
              }
              className="h-9 rounded-lg text-center text-sm font-semibold"
            />
            <button
              type="button"
              onClick={() => setItems((list) => list.filter((entry) => entry.id !== item.id))}
              aria-label={`Eliminar ${item.name}`}
              className="flex size-9 items-center justify-center text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
