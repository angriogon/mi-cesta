import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { CestaApi } from "../../data/api";
import type { PriceMeta } from "../../data/types";
import { STORES } from "../../domain/stores";
import { reportError } from "../../lib/errors";
import { Button } from "../../ui/primitives";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

/**
 * Precios: el supermercado por defecto (sus precios se ven en Compra → Preparar y En tienda) y
 * repasar lo aprendido de los tickets. La elección es del hogar: la ve toda la familia.
 */
export function PricesPage({
  api,
  priceMeta,
  onPriceMetaChange,
  onRefreshPrices,
}: {
  api: CestaApi;
  priceMeta: PriceMeta;
  onPriceMetaChange: (meta: PriceMeta) => void;
  onRefreshPrices: () => Promise<{ learned: number }>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const preferred = priceMeta.preferredStore ?? "";

  async function choose(store: string) {
    if (store === preferred || busy) return;
    setBusy(true);
    try {
      onPriceMetaChange(await api.setPreferredStore(store));
      setMessage(
        store
          ? `En la compra verás los precios de ${store}. Si allí aún no has comprado algo, el último que pagaste en otro súper.`
          : "En la compra verás el último precio que pagaste, sea del súper que sea.",
      );
    } catch (error) {
      reportError(error, "súper por defecto");
      setMessage("No se ha podido guardar. Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setMessage("Actualizando precios…");
    try {
      const result = await onRefreshPrices();
      setMessage(
        result.learned
          ? `${result.learned} precios al día con lo que pagaste en tus tickets del último mes.`
          : "No hay precios nuevos. Guarda tickets para que Cesta aprenda lo que pagas.",
      );
    } catch (error) {
      reportError(error, "actualizar precios");
      setMessage("No se han podido actualizar. Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: "", label: "El último que pagué" },
    ...STORES.map((store) => ({ value: store, label: store })),
  ];
  return (
    <section>
      <h2 className="text-lg font-semibold">Precios</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Cesta aprende lo que pagas de tus tickets. Elige tu supermercado por defecto y en Compra (Preparar y En tienda)
        verás sus precios.
      </p>
      <div className="mt-4 rounded-xl bg-card p-4">
        <p className="text-xs font-semibold" id="preferred-store">
          Supermercado por defecto
        </p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="preferred-store">
          {options.map((option) => {
            const selected = option.value === preferred;
            return (
              <button
                key={option.value || "auto"}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => void choose(option.value)}
                className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-60 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
              >
                {selected && <Check className="size-3.5" />}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <Button onClick={() => void refresh()} disabled={busy} className="mt-3 h-11 w-full rounded-xl">
        {busy && <LoaderCircle className="size-4 animate-spin" />} Actualizar precios
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Precios de lo que pagas en tus tickets
        {priceMeta.lastSuccessfulAt && ` · revisados el ${dateTime.format(new Date(priceMeta.lastSuccessfulAt))}`}
      </p>
      {message && (
        <p className="mt-2 text-xs font-semibold text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
