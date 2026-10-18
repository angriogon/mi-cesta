import { ArrowRight, Ban, CircleAlert } from "lucide-react";
import { useState } from "react";
import type { TicketItem } from "../../data/types";
import { ProductPicker, type PickerProduct } from "../../ui/ProductPicker";

/** Línea de ticket con el nombre del producto del almacén al que va (si se conoce). */
export type TicketLine = TicketItem & { productName?: string | null };

/**
 * A qué producto del almacén va una línea. Tocándolo se elige otro; al guardar el ticket, Cesta
 * recuerda la elección para los próximos tickets (Menú → Equivalencias).
 */
export function LineProduct({
  item,
  products,
  onChange,
}: {
  item: TicketLine;
  products: PickerProduct[];
  onChange: (patch: Partial<TicketLine>) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = item.skip
    ? "No se suma al almacén"
    : item.productName
      ? item.productName
      : item.productId === undefined
        ? "Se asignará al guardar"
        : "Sin producto: elige uno";
  const missing = !item.skip && item.productId === null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Producto del almacén para ${item.description || "la línea"}: ${label}`}
        className={`col-span-4 flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold ${missing ? "bg-warning-soft text-warning" : "bg-card text-primary"}`}
      >
        {item.skip ? (
          <Ban className="size-3.5 shrink-0" />
        ) : missing ? (
          <CircleAlert className="size-3.5 shrink-0" />
        ) : (
          <ArrowRight className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-muted-foreground">Cambiar</span>
      </button>
      {open && (
        <ProductPicker
          title={item.description || "Producto"}
          products={products}
          selectedId={item.productId}
          allowSkip
          onClose={() => setOpen(false)}
          onPick={(productId) => {
            setOpen(false);
            if (!productId) onChange({ skip: true, productId: null, productName: null });
            else
              onChange({
                skip: false,
                productId,
                productName: products.find((product) => product.id === productId)?.name ?? null,
              });
          }}
        />
      )}
    </>
  );
}
