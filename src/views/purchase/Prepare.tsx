import type { Grouped } from "./types";
import { Archive, Check, ChevronDown, FileDown, ListChecks, Plus, ScanLine, Trash2, X } from "lucide-react";
import { useMemo, useState, type RefObject } from "react";
import type { Overview } from "../../domain/autocesta";
import type { Category } from "../../domain/categories";
import type { StockLike } from "../../domain/lists";
import type { ListItem, PriceRef, Product } from "../../data/types";
import { normalize, todayIso } from "../../lib/text";
import { Button, CategorySelect, EmptyState, Input, Stepper } from "../../ui/primitives";
import { priceFor, PriceTag } from "./prices";
import { sharePdf } from "./pdf";
import { Suggestions } from "./Suggestions";

export function Prepare(props: {
  items: ListItem[];
  grouped: Grouped;
  name: string;
  setName: (value: string) => void;
  stock: StockLike[];
  products: Product[];
  inputRef: RefObject<HTMLInputElement | null>;
  addNamedItem: (name: string) => void;
  updateItem: (id: string, change: (item: ListItem) => ListItem) => void;
  changeCategory: (item: ListItem, category: Category) => void;
  removeItem: (id: string) => void;
  duplicateCount: number;
  mergeDuplicates: () => void;
  generateChecklist: () => void;
  prices: PriceRef[];
  openScanner: () => void;
  onAvoided: () => void;
  suggestions: Overview["suggestions"];
  pendingSuggestions: Overview["pendingSuggestions"];
  acceptSuggestions: (items: Overview["suggestions"]) => void;
  suppressSuggestion: (productId: string) => void;
  onPlanned: (productId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const query = normalize(props.name);
  const matches = query ? props.stock.filter((item) => normalize(item.name).includes(query)).slice(0, 5) : [];
  const exact = query ? props.stock.some((item) => normalize(item.name) === query) : false;
  const productById = useMemo(() => new Map(props.products.map((product) => [product.id, product])), [props.products]);

  function toggle(category: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <>
      {props.duplicateCount > 0 && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={props.mergeDuplicates} className="h-9 rounded-xl px-2.5 text-xs">
            Unir repetidos · {props.duplicateCount}
          </Button>
        </div>
      )}

      <Suggestions
        suggestions={props.suggestions}
        pendingSuggestions={props.pendingSuggestions}
        acceptSuggestions={props.acceptSuggestions}
        suppressSuggestion={props.suppressSuggestion}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.addNamedItem(props.name);
        }}
        className="relative z-10 mb-4 mt-2 flex gap-2"
      >
        <label htmlFor="new-item" className="sr-only">
          Añadir producto
        </label>
        <div className="relative min-w-0 flex-1">
          <Input
            id="new-item"
            ref={props.inputRef}
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder="Añadir producto…"
            autoComplete="off"
            autoCorrect="on"
            enterKeyHint="done"
            maxLength={80}
            className="h-12 rounded-xl bg-card pl-3.5 pr-10 text-[1rem] focus-visible:ring-primary/20"
          />
          {props.name && (
            <button
              type="button"
              onClick={() => props.setName("")}
              aria-label="Borrar texto"
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <X className="size-4" />
            </button>
          )}
          {query && (
            <div className="absolute inset-x-0 top-[calc(100%+.35rem)] overflow-hidden rounded-xl bg-card shadow-float">
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => props.addNamedItem(item.name)}
                  className="flex w-full items-center gap-2 border-b-[0.5px] border-separator px-3 py-2.5 text-left last:border-0"
                >
                  <Archive className="size-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity > 0 ? `En casa · ${item.quantity}` : "En catálogo"}
                  </span>
                </button>
              ))}
              {!exact && (
                <button
                  type="button"
                  onClick={() => props.addNamedItem(props.name)}
                  className="flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left"
                >
                  <Plus className="size-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">Añadir “{props.name.trim()}”</span>
                  <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">NUEVO</span>
                </button>
              )}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-lg"
          onClick={props.openScanner}
          aria-label="Escanear código de barras"
          className="size-12 rounded-xl"
        >
          <ScanLine className="size-4.5" />
        </Button>
        <Button
          type="submit"
          size="icon-lg"
          disabled={!props.name.trim()}
          aria-label="Añadir a la lista"
          className="size-12 rounded-xl"
        >
          <Plus className="size-4.5" />
        </Button>
      </form>

      {props.items.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-1 overflow-hidden rounded-xl bg-card p-1">
          <Button
            variant="ghost"
            disabled={sharing}
            onClick={async () => {
              setSharing(true);
              try {
                await sharePdf(props.grouped);
              } finally {
                setSharing(false);
              }
            }}
            className="h-11 rounded-lg px-2 text-xs"
          >
            <FileDown className="size-3.5" /> {sharing ? "Preparando…" : "Compartir PDF"}
          </Button>
          <Button onClick={props.generateChecklist} className="h-11 rounded-lg px-2 text-xs">
            <ListChecks className="size-3.5" /> Generar lista
          </Button>
        </div>
      )}

      {props.items.length === 0 ? (
        <EmptyState
          icon={<Check className="size-7" />}
          title="Lista vacía"
          text="Añade lo que necesitas o revisa las necesidades del almacén."
        />
      ) : (
        <div className="space-y-4">
          {props.grouped.map((group) => (
            <section key={group.category} aria-labelledby={`shopping-${group.category}`}>
              <button
                type="button"
                onClick={() => toggle(group.category)}
                aria-expanded={!collapsed.has(group.category)}
                className="mb-1.5 flex w-full items-center justify-between px-1 py-1"
              >
                <h2 id={`shopping-${group.category}`} className="text-xs font-semibold uppercase text-muted-foreground">
                  {group.category} · {group.items.length}
                </h2>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground/70 transition-transform ${collapsed.has(group.category) ? "-rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {!collapsed.has(group.category) && (
                <div className="overflow-hidden rounded-lg bg-card">
                  {group.items.map((item, index) => {
                    const price = priceFor(item, props.prices);
                    const inStock = props.stock.find((product) => normalize(product.name) === normalize(item.name));
                    const plannedUntil = inStock ? productById.get(inStock.id)?.plannedUntil : null;
                    const overbuy =
                      !!inStock &&
                      item.quantity + inStock.quantity > Math.max(2, inStock.minimum * 2) &&
                      !(plannedUntil && plannedUntil >= todayIso());
                    return (
                      <div
                        key={item.id}
                        className={`group flex min-h-[52px] items-center gap-1.5 px-2 ${index ? "relative before:absolute before:inset-x-0 before:left-4 before:top-0 before:h-[0.5px] before:bg-separator" : ""}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5">
                          <span className="min-w-0 flex-1 text-left text-[0.8125rem] font-semibold">
                            <span className="block truncate">{item.name}</span>
                            <span className="flex flex-wrap items-center gap-1">
                              {price?.priceCents ? <PriceTag price={price} quantity={item.quantity} /> : null}
                              {inStock && inStock.quantity > 0 && (
                                <span className="rounded bg-danger-soft px-1 py-0.5 text-xs font-semibold text-danger">
                                  EN CASA · {inStock.quantity}
                                </span>
                              )}
                              {overbuy && inStock && (
                                <button
                                  type="button"
                                  onClick={() => props.onPlanned(inStock.id)}
                                  aria-label={`${item.name}: tendrás más del doble del mínimo. Toca si es una compra planificada.`}
                                  className="rounded bg-warning-soft px-1 py-0.5 text-xs font-semibold text-warning"
                                >
                                  ¿DE MÁS?
                                </button>
                              )}
                              {item.isNew && (
                                <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info">
                                  NUEVO
                                </span>
                              )}
                            </span>
                          </span>
                          <div className="max-w-[7.2rem] shrink">
                            <CategorySelect
                              value={item.category}
                              onChange={(category) => props.changeCategory(item, category)}
                              label={`Cambiar categoría de ${item.name}`}
                            />
                          </div>
                        </div>
                        <Stepper
                          value={item.quantity}
                          label={item.name}
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
                          onClick={() => {
                            if (inStock && inStock.quantity > 0) props.onAvoided();
                            props.removeItem(item.id);
                          }}
                          aria-label={`Eliminar ${item.name}`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-danger active:bg-red-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
