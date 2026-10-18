import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PriceRef } from "../../data/types";
import { compareWithPlan, reviewTicketLines } from "../../domain/tickets";
import { centsToInput, formatCents, parseEuroToCents } from "../../lib/text";
import { Button, Input } from "../../ui/primitives";
import type { PickerProduct } from "../../ui/ProductPicker";
import { LineProduct, type TicketLine } from "./LineProduct";

export function LinesEditor({
  items,
  products,
  onChange,
}: {
  items: TicketLine[];
  /** Con productos, cada línea muestra y deja cambiar a qué producto del almacén va. */
  products?: PickerProduct[];
  onChange: (items: TicketLine[]) => void;
}) {
  const update = (index: number, patch: Partial<TicketLine>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_3.6rem_4.9rem_2rem] items-end gap-1.5 rounded-xl bg-muted/65 p-2"
        >
          <label className="min-w-0 text-xs font-semibold text-muted-foreground">
            Producto
            <Input
              value={item.description}
              onChange={(event) => update(index, { description: event.target.value })}
              className="mt-1 h-9 rounded-lg bg-card px-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Cant.
            <Input
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={item.quantity}
              onChange={(event) => update(index, { quantity: Math.max(0, Number(event.target.value) || 0) })}
              className="mt-1 h-9 rounded-lg bg-card px-1 text-center text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Importe
            <MoneyInput
              cents={item.lineTotalCents}
              onChange={(cents) => update(index, { lineTotalCents: cents })}
              className="mt-1 h-9 rounded-lg bg-card px-1 text-center text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Eliminar línea ${item.description}`}
            className="mb-0.5 flex size-8 items-center justify-center rounded-lg text-danger active:bg-red-50"
          >
            <Trash2 className="size-3.5" />
          </button>
          {products && <LineProduct item={item} products={products} onChange={(patch) => update(index, patch)} />}
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() => onChange([...items, { description: "", quantity: 1, lineTotalCents: 0 }])}
        className="h-10 w-full rounded-xl text-xs"
      >
        <Plus className="size-3.5" /> Añadir línea
      </Button>
    </div>
  );
}

/** Campo de importe que deja escribir "3,4" sin reformatear mientras se teclea. */
export function MoneyInput({
  cents,
  onChange,
  className,
}: {
  cents: number;
  onChange: (cents: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseEuroToCents(text) !== cents) setText(centsToInput(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const value = event.target.value.replace(/[^0-9.,]/g, "");
        setText(value);
        const parsed = parseEuroToCents(value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setText(centsToInput(cents))}
      className={className}
    />
  );
}

/** Avisos sobre las líneas leídas: duplicados, precios raros y lo planeado frente a lo comprado. */
export function LineChecks({
  lines,
  prices,
  planned,
  onReview,
}: {
  lines: TicketLine[];
  prices: PriceRef[];
  planned: { name: string; quantity: number }[];
  onReview?: () => void;
}) {
  const smartReview = useMemo(() => reviewTicketLines(lines, prices), [lines, prices]);
  const plan = useMemo(() => compareWithPlan(planned, lines), [planned, lines]);
  const unmatched = lines.filter((line) => !line.skip && line.productId === null);
  return (
    <>
      {unmatched.length > 0 && (
        <div className="mb-2 rounded-xl bg-warning-soft p-2 text-xs text-warning">
          <p className="font-semibold">
            {unmatched.length === 1 ? "1 línea sin producto" : `${unmatched.length} líneas sin producto`} del almacén
          </p>
          <p className="mt-1">
            {unmatched.map((line) => line.description).join(", ")}. {unmatched.length === 1 ? "Asígnala" : "Asígnalas"}{" "}
            para que el almacén y las recetas cuadren (Cesta lo recordará).
          </p>
          {onReview && (
            <button type="button" onClick={onReview} className="mt-1 min-h-9 font-semibold underline">
              Asignar productos
            </button>
          )}
        </div>
      )}
      {(smartReview.duplicates.length > 0 || smartReview.unexpected.length > 0) && (
        <div className="mb-2 rounded-xl bg-warning-soft p-2 text-xs text-warning">
          <p className="font-semibold">Revisión inteligente</p>
          {smartReview.duplicates.length > 0 && (
            <p className="mt-1">
              Posibles duplicados: {smartReview.duplicates.map((item) => item.description).join(", ")}
            </p>
          )}
          {smartReview.unexpected.length > 0 && (
            <p className="mt-1">
              Precio inesperado:{" "}
              {smartReview.unexpected.map((item) => `${item.name} (${formatCents(item.current)})`).join(", ")}
            </p>
          )}
        </div>
      )}
      {plan && (
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-muted p-2 text-center text-primary">
          <div>
            <b className="block text-sm">{plan.planned}</b>
            <span className="text-xs">Planeados</span>
          </div>
          <div>
            <b className="block text-sm">{plan.found}</b>
            <span className="text-xs">Verificados</span>
          </div>
          <div>
            <b className="block text-sm">{plan.missing}</b>
            <span className="text-xs">No vistos</span>
          </div>
        </div>
      )}
    </>
  );
}
