import {
  Archive,
  Check,
  ChevronDown,
  FileDown,
  ListChecks,
  PackageCheck,
  Plus,
  ScanLine,
  Sparkles,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import type { Overview } from "../domain/autocesta";
import type { Category } from "../domain/categories";
import type { StockLike } from "../domain/lists";
import { similarNames } from "../domain/matching";
import type { Activity, ListItem, PriceRef, Product } from "../data/types";
import { formatCents, normalize, todayIso } from "../lib/text";
import { Button, CategorySelect, EmptyState, Input, Stepper } from "../ui/primitives";

type Grouped = { category: Category; items: ListItem[] }[];

export function priceFor(item: ListItem, prices: PriceRef[]): PriceRef | undefined {
  return prices
    .filter(
      (price) => normalize(price.productName) === normalize(item.name) || similarNames(price.productName, item.name),
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
}

function merchantTone(price: PriceRef): string {
  const merchant = normalize(price.merchant);
  if (merchant.includes("carrefour")) return "text-[#1769aa]";
  if (merchant.includes("mercadona") || merchant.includes("hacendado")) return "text-[#c46718]";
  return "text-primary";
}

function merchantBadge(price: PriceRef): string {
  const merchant = normalize(price.merchant);
  if (merchant.includes("carrefour")) return "C";
  if (merchant.includes("mercadona")) return "M";
  return price.merchant.slice(0, 1).toUpperCase() || "€";
}

function PriceTag({ price, quantity }: { price: PriceRef; quantity: number }) {
  return (
    <span className={`ml-1 text-[9px] font-bold ${merchantTone(price)}`} title={`Último precio en ${price.merchant}`}>
      <b className="mr-0.5 rounded bg-current/10 px-1 text-[7px]">{merchantBadge(price)}</b>≈{" "}
      {formatCents(price.priceCents * quantity)}
    </span>
  );
}

export function PurchaseShell({
  stage,
  onStageChange,
  preparingCount,
  storeCount,
  activity,
  prepare,
  store,
}: {
  stage: "prepare" | "store";
  onStageChange: (stage: "prepare" | "store") => void;
  preparingCount: number;
  storeCount: number;
  activity: Activity[];
  prepare: ReactNode;
  store: ReactNode;
}) {
  return (
    <>
      <div
        className="purchase-stage-switch grid grid-cols-2 rounded-[13px] border border-border bg-muted p-1 shadow-[0_1px_2px_rgba(32,47,38,.06)]"
        role="tablist"
        aria-label="Estado de Compra"
      >
        <button
          type="button"
          role="tab"
          onClick={() => onStageChange("prepare")}
          aria-selected={stage === "prepare"}
          className={`h-8 rounded-lg text-[11px] font-bold ${stage === "prepare" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
        >
          Preparar · {preparingCount}
        </button>
        <button
          type="button"
          role="tab"
          onClick={() => onStageChange("store")}
          aria-selected={stage === "store"}
          className={`h-8 rounded-lg text-[11px] font-bold ${stage === "store" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          En tienda · {storeCount}
        </button>
      </div>
      {stage === "store" && activity.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-hidden rounded-xl border border-[#d8e5d9] bg-[#eaf3eb] px-3 py-2 text-[#20462f] dark:border-border dark:bg-secondary dark:text-secondary-foreground">
          <Users className="size-3.5 shrink-0" />
          <p className="truncate text-[10px] font-semibold">
            {activity[0].deviceName} también está comprando · {activity[0].detail}
          </p>
        </div>
      )}
      {stage === "prepare" ? prepare : store}
    </>
  );
}

async function sharePdf(grouped: Grouped) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("Lista de la compra", 18, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(95, 107, 98);
  pdf.text(new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date()), 18, 30);
  let y = 43;
  for (const group of grouped) {
    const pending = group.items.filter((item) => !item.done);
    if (!pending.length) continue;
    if (y > 265) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(41, 91, 63);
    pdf.text(group.category.toUpperCase(), 18, y);
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(27, 34, 29);
    for (const item of pending) {
      if (y > 278) {
        pdf.addPage();
        y = 20;
      }
      pdf.rect(19, y - 3.5, 4, 4);
      pdf.text(`${item.quantity} × ${item.name}`, 28, y);
      y += 8;
    }
    y += 3;
  }
  const filename = `cesta-${todayIso()}.pdf`;
  const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Lista de la compra" });
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") pdf.save(filename);
    }
  } else pdf.save(filename);
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const query = normalize(props.name);
  const matches = query ? props.stock.filter((item) => normalize(item.name).includes(query)).slice(0, 5) : [];
  const exact = query ? props.stock.some((item) => normalize(item.name) === query) : false;
  const productById = useMemo(() => new Map(props.products.map((product) => [product.id, product])), [props.products]);

  useEffect(() => {
    setSelected(new Set(props.suggestions.map((item) => item.productId)));
  }, [props.suggestions]);

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
          <Button
            variant="outline"
            size="sm"
            onClick={props.mergeDuplicates}
            className="h-9 rounded-xl px-2.5 text-[10px]"
          >
            Unir repetidos · {props.duplicateCount}
          </Button>
        </div>
      )}

      {(props.suggestions.length > 0 || props.pendingSuggestions.length > 0) && (
        <section className="mb-3 rounded-[16px] border border-[#d8e5d9] bg-[#eef4ef] p-2.5 dark:border-border dark:bg-card">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold">Sugeridos por AutoCesta</p>
              <p className="text-[9px] text-muted-foreground">Preparados en segundo plano; tú decides qué añadir.</p>
            </div>
          </div>
          {props.suggestions.length > 0 && (
            <div className="mt-2 space-y-1">
              {props.suggestions.map((suggestion) => (
                <div
                  key={suggestion.productId}
                  className="flex items-center gap-2 rounded-xl bg-card px-2 py-1.5 dark:bg-muted"
                >
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
                    <p className="truncate text-[11px] font-bold">
                      {suggestion.quantity} × {suggestion.productName}
                    </p>
                    <p className="truncate text-[9px] text-muted-foreground">{suggestion.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.suppressSuggestion(suggestion.productId)}
                    className="px-1 py-2 text-[9px] font-bold text-muted-foreground"
                  >
                    No sugerir
                  </button>
                </div>
              ))}
            </div>
          )}
          {props.pendingSuggestions.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer py-1 text-[9px] font-bold text-[#8b672f]">
                {props.pendingSuggestions.length} pendientes por stock dudoso
              </summary>
              <div className="mt-1 space-y-1">
                {props.pendingSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.productId}
                    className="flex items-center gap-2 rounded-lg bg-[#faf7ef] px-2 py-1 dark:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-[9px]">
                      {suggestion.productName} · {Math.round(suggestion.confidence * 100)} % certeza
                    </span>
                    <button
                      type="button"
                      onClick={() => props.acceptSuggestions([suggestion])}
                      className="px-1 py-1.5 text-[9px] font-bold text-primary"
                    >
                      Añadir
                    </button>
                    <button
                      type="button"
                      onClick={() => props.suppressSuggestion(suggestion.productId)}
                      className="px-1 py-1.5 text-[9px] font-bold"
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
              className="mt-2 h-10 w-full rounded-xl text-[11px]"
            >
              <Plus className="size-3.5" /> Añadir seleccionados
            </Button>
          )}
        </section>
      )}

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
            className="h-12 rounded-xl border-border bg-card pl-3.5 pr-10 text-[16px] shadow-[0_1px_2px_rgba(32,47,38,.05)] focus-visible:ring-primary/20"
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
            <div className="absolute inset-x-0 top-[calc(100%+.35rem)] overflow-hidden rounded-xl border border-border bg-card shadow-[0_14px_34px_rgba(32,47,38,.14)]">
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => props.addNamedItem(item.name)}
                  className="flex w-full items-center gap-2 border-b border-border/70 px-3 py-2.5 text-left last:border-0"
                >
                  <Archive className="size-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.quantity > 0 ? `En casa · ${item.quantity}` : "En catálogo"}
                  </span>
                </button>
              ))}
              {!exact && (
                <button
                  type="button"
                  onClick={() => props.addNamedItem(props.name)}
                  className="flex w-full items-center gap-2 bg-[#f4f7f4] px-3 py-2.5 text-left dark:bg-muted"
                >
                  <Plus className="size-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">Añadir “{props.name.trim()}”</span>
                  <span className="rounded-full bg-[#efe5dc] px-2 py-0.5 text-[9px] font-bold text-[#8f4b2f]">
                    NUEVO
                  </span>
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
          className="size-12 rounded-xl shadow-[0_1px_2px_rgba(41,91,63,.18)]"
        >
          <Plus className="size-4.5" />
        </Button>
      </form>

      {props.items.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-1 overflow-hidden rounded-xl border border-border bg-card p-1">
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
            className="h-11 rounded-lg px-2 text-[11px]"
          >
            <FileDown className="size-3.5" /> {sharing ? "Preparando…" : "Compartir PDF"}
          </Button>
          <Button onClick={props.generateChecklist} className="h-11 rounded-lg px-2 text-[11px]">
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
                <h2
                  id={`shopping-${group.category}`}
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {group.category} · {group.items.length}
                </h2>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground/70 transition-transform ${collapsed.has(group.category) ? "-rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {!collapsed.has(group.category) && (
                <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[0_8px_24px_rgba(32,47,38,.045)]">
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
                        className={`group flex min-h-[52px] items-center gap-1.5 px-2 ${index ? "border-t border-border/75" : ""}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5">
                          <span className="min-w-0 flex-1 text-left text-[13px] font-semibold">
                            <span className="block truncate">{item.name}</span>
                            <span className="flex flex-wrap items-center gap-1">
                              {price?.priceCents ? <PriceTag price={price} quantity={item.quantity} /> : null}
                              {inStock && inStock.quantity > 0 && (
                                <span className="rounded bg-[#f8e2de] px-1 py-0.5 text-[8px] font-bold text-[#9b3f38]">
                                  EN CASA · {inStock.quantity}
                                </span>
                              )}
                              {overbuy && inStock && (
                                <button
                                  type="button"
                                  onClick={() => props.onPlanned(inStock.id)}
                                  aria-label={`${item.name}: tendrás más del doble del mínimo. Toca si es una compra planificada.`}
                                  className="rounded bg-[#f4ead8] px-1 py-0.5 text-[8px] font-bold text-[#8b672f]"
                                >
                                  ¿DE MÁS?
                                </button>
                              )}
                              {item.isNew && (
                                <span className="rounded-full bg-[#efe5dc] px-1.5 py-0.5 text-[8px] font-bold text-[#8f4b2f]">
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
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#a34141] active:bg-red-50"
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

export function StoreList(props: {
  items: ListItem[];
  grouped: Grouped;
  completed: number;
  updateItem: (id: string, change: (item: ListItem) => ListItem) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  storePurchased: () => Promise<void>;
  prices: PriceRef[];
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
    .reduce((sum, item) => sum + (priceFor(item, props.prices)?.priceCents ?? 0) * item.quantity, 0);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        {budget > 0 && (
          <span className="mr-auto rounded-xl bg-[#eaf3eb] px-3 py-2 text-[10px] font-bold text-primary dark:bg-secondary">
            Presupuesto · {formatCents(budget)}
          </span>
        )}
        <button
          type="button"
          onClick={props.openScanner}
          aria-label="Escanear código de barras"
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-primary"
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
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[#edd8d3] bg-[#fbf3f1] px-3 text-[10px] font-bold text-[#a34141] dark:border-border dark:bg-card"
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
              <h2 className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {group.category} · {group.items.length}
              </h2>
              <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[0_8px_24px_rgba(32,47,38,.045)]">
                {group.items.map((item, index) => {
                  const price = priceFor(item, props.prices);
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
                    <div key={item.id} className={index ? "border-t border-border/75" : ""}>
                      <div className="flex min-h-[52px] items-center gap-1.5 px-2">
                        <button
                          type="button"
                          onClick={toggle}
                          aria-label={item.done ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`}
                          aria-pressed={item.done}
                          className="-m-1 flex size-9 shrink-0 items-center justify-center"
                        >
                          <span
                            className={`flex size-7 items-center justify-center rounded-full border-2 transition-all ${item.done ? "border-primary bg-primary text-primary-foreground" : "border-[#c9d4cc] bg-white dark:bg-card"}`}
                          >
                            {item.done && <Check className="size-4" strokeWidth={3} />}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={toggle}
                          className={`min-w-0 flex-1 truncate py-2 text-left text-[13px] font-semibold ${item.done ? "text-muted-foreground line-through" : ""}`}
                        >
                          {item.name}
                          {price?.priceCents ? <PriceTag price={price} quantity={item.quantity} /> : null}
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
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#a34141] active:bg-red-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {alternativeFor === item.id && (
                        <div className="flex items-center gap-2 bg-[#faf7ef] px-3 py-2 text-[10px] text-[#76582b] dark:bg-muted dark:text-muted-foreground">
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
                                className="px-1 py-1.5 font-bold"
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
          className="mt-5 h-12 w-full rounded-2xl text-sm shadow-[0_10px_24px_rgba(41,91,63,.16)]"
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
