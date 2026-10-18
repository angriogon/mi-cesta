import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CestaApi } from "../../data/api";
import type { Equivalence } from "../../data/api/equivalences";
import { LOAD_FAILED, notifyError, reportError } from "../../lib/errors";
import { Button, Input } from "../../ui/primitives";
import { ProductPicker, type PickerProduct } from "../../ui/ProductPicker";

/** Qué estamos asignando con el selector: una equivalencia nueva o el texto de una existente. */
type Picking = { alias: string } | null;

/**
 * Equivalencias «texto del ticket → producto del almacén». Con ellas, «PECHUGA FAMILIAR» suma a
 * «Pechuga de pollo» (o al producto que elijas) y las recetas ven lo que de verdad hay en casa.
 */
export function EquivalencesPage({ api }: { api: CestaApi }) {
  const [items, setItems] = useState<Equivalence[]>([]);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState<Picking>(null);
  const [message, setMessage] = useState("");
  const [showDefaults, setShowDefaults] = useState(false);

  const load = useCallback(() => {
    api.equivalences().then(setItems).catch(notifyError("cargar equivalencias", LOAD_FAILED));
  }, [api]);

  useEffect(() => {
    load();
    api.products().then(setProducts).catch(notifyError("cargar productos", LOAD_FAILED));
  }, [api, load]);

  async function save(alias: string, productId: string) {
    try {
      await api.setEquivalence(alias, productId);
      setMessage(`Guardado: «${alias.trim().toUpperCase()}» irá a ${products.find((p) => p.id === productId)?.name}.`);
      setDraft("");
      load();
    } catch (error) {
      reportError(error, "guardar equivalencia");
      setMessage(error instanceof Error ? error.message : "No se ha podido guardar.");
    }
  }

  async function remove(item: Equivalence) {
    try {
      await api.removeEquivalence(item.id);
      setMessage(`Borrada: «${item.alias}» volverá a reconocerse automáticamente.`);
      load();
    } catch (error) {
      reportError(error, "borrar equivalencia");
      setMessage("No se ha podido borrar.");
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Equivalencias de tickets</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Cómo se llama en el ticket cada producto de tu almacén. Al guardar un ticket, cada línea suma al producto que
        indiques aquí, y así el almacén y las recetas cuadran con lo que compras. También se guardan solas cuando
        cambias el producto de una línea al revisar un ticket.
      </p>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (draft.trim()) setPicking({ alias: draft });
        }}
        className="mt-4 flex gap-2"
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Texto del ticket, p. ej. PECHUGA FAMILIAR"
          aria-label="Texto del ticket"
          className="h-11 flex-1 rounded-xl"
        />
        <Button type="submit" disabled={!draft.trim()} className="h-11 rounded-xl px-3">
          <Plus className="size-4" /> Añadir
        </Button>
      </form>
      {message && (
        <p className="mt-2 text-xs font-semibold text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <p className="eyebrow mt-5 px-1">Tus equivalencias</p>
      <div className="mt-1.5 overflow-hidden rounded-xl bg-card">
        {items.length === 0 && (
          <p className="p-4 text-xs leading-5 text-muted-foreground">
            Aún no hay ninguna. Se crean al cambiar el producto de una línea al revisar un ticket, o aquí arriba.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-1 border-separator pl-3 not-first:border-t-[0.5px]">
            <button
              type="button"
              onClick={() => setPicking({ alias: item.alias })}
              aria-label={`Cambiar el producto de ${item.alias}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">{item.alias}</span>
                <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-primary">
                  <ArrowRight className="size-3.5 shrink-0" />
                  <span className="truncate">{item.productName}</span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void remove(item)}
              aria-label={`Borrar la equivalencia de ${item.alias}`}
              className="flex size-11 shrink-0 items-center justify-center text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowDefaults((value) => !value)}
        aria-expanded={showDefaults}
        className="mt-5 min-h-11 px-1 text-xs font-semibold text-primary"
      >
        {showDefaults ? "Ocultar las de serie" : "Ver las de serie"}
      </button>
      {showDefaults && (
        <div className="overflow-hidden rounded-xl bg-card">
          {api.defaultEquivalences().map((item) => (
            <button
              key={item.alias}
              type="button"
              onClick={() => setPicking({ alias: item.alias })}
              aria-label={`Cambiar el producto de ${item.alias}`}
              className="flex min-h-11 w-full items-center gap-2 border-separator px-3 py-2 text-left not-first:border-t-[0.5px]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">{item.alias}</span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">→ {item.productName}</span>
              </span>
              <span className="text-xs font-semibold text-primary">Cambiar</span>
            </button>
          ))}
        </div>
      )}

      {picking && (
        <ProductPicker
          title={picking.alias.toUpperCase()}
          products={products}
          selectedId={items.find((item) => item.alias === picking.alias)?.productId}
          onClose={() => setPicking(null)}
          onPick={(productId) => {
            const alias = picking.alias;
            setPicking(null);
            if (productId) void save(alias, productId);
          }}
        />
      )}
    </section>
  );
}
