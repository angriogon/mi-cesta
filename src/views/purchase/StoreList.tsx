import type { Grouped } from "./types";
import { Check, ListChecks, PackageCheck, ScanLine, Sparkles, Store, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { StockLike } from "../../domain/lists";
import type { ListItem, PriceRef } from "../../data/types";
import { formatCents, normalize } from "../../lib/text";
import { Button, EmptyState, Stepper } from "../../ui/primitives";
import { priceFor, PriceTag } from "./prices";

export function StoreList(props: {
  items: ListItem[];
  grouped: Grouped;
  completed: number;
  updateItem: (id: string, change: (item: ListItem) => ListItem) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  storePurchased: () => Promise<void>;
  prices: PriceRef[];
  /** Supermercado elegido en Menú → Precios (vacío: el último precio pagado en cualquiera). */
  preferredStore?: string;
  stock: StockLike[];
  rejected: { requestedName: string; productId: string }[];
  openScanner: () => void;
  onSubstitution: (requestedName: string, productId: string, decision: "accept" | "reject") => void;
}) {
  const [saving, setSaving] = useState(false);
  const [alternativeFor, setAlternativeFor] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const budget = props.items
    .filter((item) => !item.done)
    .reduce(
      (sum, item) => sum + (priceFor(item, props.prices, props.preferredStore)?.priceCents ?? 0) * item.quantity,
      0,
    );

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        {budget > 0 && (
          <span className="mr-auto rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-primary">
            Presupuesto{props.preferredStore ? ` en ${props.preferredStore}` : ""} · {formatCents(budget)}
          </span>
        )}
        <button
          type="button"
          onClick={props.openScanner}
          aria-label="Escanear código de barras"
          className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"
        >
          <ScanLine className="size-3.5" />
        </button>
        {props.items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmClear) {
                setConfirmClear(false);
                props.clearItems();
              } else setConfirmClear(true);
            }}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-danger-soft px-3 text-xs font-semibold text-danger"
          >
            <Trash2 className="size-3.5" /> {confirmClear ? "¿Vaciar? Toca otra vez" : "Vaciar"}
          </button>
        )}
      </div>

      {props.items.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-7" />}
          title="Lista vacía"
          text="Añade productos desde Preparar o desde las necesidades del almacén."
        />
      ) : (
        <div className="space-y-4">
          {props.grouped.map((group) => (
            <section key={group.category}>
              <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase text-muted-foreground">
                {group.category} · {group.items.length}
              </h2>
              <div className="overflow-hidden rounded-lg bg-card">
                {group.items.map((item, index) => {
                  const price = priceFor(item, props.prices, props.preferredStore);
                  const alternative = props.stock.find(
                    (product) =>
                      product.category === item.category &&
                      product.quantity > 0 &&
                      normalize(product.name) !== normalize(item.name) &&
                      !props.rejected.some(
                        (rejected) =>
                          rejected.productId === product.id &&
                          normalize(rejected.requestedName) === normalize(item.name),
                      ),
                  );
                  const toggle = () => props.updateItem(item.id, (entry) => ({ ...entry, done: !entry.done }));
                  return (
                    <div
                      key={item.id}
                      className={
                        index
                          ? "relative before:absolute before:inset-x-0 before:left-4 before:top-0 before:h-[0.5px] before:bg-separator"
                          : ""
                      }
                    >
                      <div className="flex min-h-[52px] items-center gap-1.5 px-2">
                        <button
                          type="button"
                          onClick={toggle}
                          aria-label={item.done ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`}
                          aria-pressed={item.done}
                          className="-m-1 flex size-9 shrink-0 items-center justify-center"
                        >
                          <span
                            className={`flex size-7 items-center justify-center rounded-full border-[1.5px] transition-colors ${item.done ? "border-primary bg-primary text-primary-foreground" : "border-separator"}`}
                          >
                            {item.done && <Check className="size-4" strokeWidth={3} />}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={toggle}
                          className={`min-w-0 flex-1 truncate py-2 text-left text-[0.8125rem] font-semibold ${item.done ? "text-muted-foreground line-through" : ""}`}
                        >
                          {item.name}
                          {price?.priceCents ? (
                            <PriceTag price={price} quantity={item.quantity} preferredStore={props.preferredStore} />
                          ) : null}
                        </button>
                        {!item.done && (
                          <button
                            type="button"
                            onClick={() => setAlternativeFor(alternativeFor === item.id ? null : item.id)}
                            aria-label={`Mostrar alternativa para ${item.name}`}
                            aria-expanded={alternativeFor === item.id}
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
                          >
                            <Store className="size-3.5" />
                          </button>
                        )}
                        <Stepper
                          value={item.quantity}
                          label={`unidades compradas de ${item.name}`}
                          minusDisabled={item.quantity <= 1}
                          onMinus={() =>
                            props.updateItem(item.id, (entry) => ({
                              ...entry,
                              quantity: Math.max(1, entry.quantity - 1),
                            }))
                          }
                          onPlus={() =>
                            props.updateItem(item.id, (entry) => ({
                              ...entry,
                              quantity: Math.min(99, entry.quantity + 1),
                            }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => props.removeItem(item.id)}
                          aria-label={`Eliminar ${item.name} de la lista`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-danger active:bg-red-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {alternativeFor === item.id && (
                        <div className="flex items-center gap-2 bg-warning-soft px-3 py-2 text-xs text-warning">
                          <Sparkles className="size-3 shrink-0" />
                          <span className="min-w-0 flex-1">
                            {alternative
                              ? `Plan B: utiliza ${alternative.name}, ya disponible en casa.`
                              : "Sin alternativa en casa. Prueba otro producto de la misma categoría."}
                          </span>
                          {alternative && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  props.onSubstitution(item.name, alternative.id, "accept");
                                  props.removeItem(item.id);
                                  setAlternativeFor(null);
                                }}
                                className="px-1 py-1.5 font-semibold"
                              >
                                No comprar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  props.onSubstitution(item.name, alternative.id, "reject");
                                  setAlternativeFor(null);
                                }}
                                aria-label="No sugerir esta alternativa"
                                className="flex size-7 items-center justify-center"
                              >
                                <X className="size-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {props.completed > 0 && (
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await props.storePurchased();
            } finally {
              setSaving(false);
            }
          }}
          className="mt-5 h-12 w-full rounded-xl text-sm"
        >
          <PackageCheck className="size-4" />{" "}
          {saving
            ? "Actualizando almacén…"
            : `Guardar ${props.completed} ${props.completed === 1 ? "unidad" : "unidades"} en el almacén`}
        </Button>
      )}
    </>
  );
}
