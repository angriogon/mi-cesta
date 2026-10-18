import { Ban, Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { normalize } from "../lib/text";
import { Input } from "./primitives";

export interface PickerProduct {
  id: string;
  name: string;
  category: string;
}

/**
 * Elegir el producto del almacén al que corresponde un texto de ticket. Con buscador, porque el
 * catálogo tiene cientos de productos; opcionalmente, «No sumar al almacén» (bolsas, descuentos…).
 */
export function ProductPicker({
  title,
  products,
  selectedId,
  allowSkip = false,
  onPick,
  onClose,
}: {
  title: string;
  products: PickerProduct[];
  selectedId?: string | null;
  allowSkip?: boolean;
  onPick: (productId: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const words = normalize(query).split(" ").filter(Boolean);
    return products
      .filter((product) => words.every((word) => normalize(`${product.name} ${product.category}`).includes(word)))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 80);
  }, [products, query]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-background px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex size-11 items-center justify-center rounded-full bg-card"
        >
          <X className="size-5" />
        </button>
      </div>
      <label className="relative mt-3 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar producto"
          aria-label="Buscar producto"
          className="h-11 rounded-xl pl-9"
        />
      </label>
      <div className="mt-3 flex-1 overflow-y-auto rounded-xl bg-card">
        {allowSkip && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex min-h-11 w-full items-center gap-3 border-b-[0.5px] border-separator px-3 text-left text-sm text-muted-foreground active:bg-fill"
          >
            <Ban className="size-4" /> No sumar al almacén
          </button>
        )}
        {visible.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onPick(product.id)}
            className="flex min-h-11 w-full items-center gap-3 border-b-[0.5px] border-separator px-3 text-left active:bg-fill"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{product.name}</span>
              <span className="block text-xs text-muted-foreground">{product.category}</span>
            </span>
            {product.id === selectedId && <Check className="size-4 text-primary" />}
          </button>
        ))}
        {!visible.length && <p className="p-4 text-center text-xs text-muted-foreground">Ningún producto coincide.</p>}
      </div>
    </div>
  );
}
