import { useState } from "react";
import type { CestaApi } from "../data/api";
import { addDaysIso, todayIso } from "../lib/text";

export interface ExpiryItem {
  productId: string;
  name: string;
  quantity: number;
}

/** Tras guardar perecederos se ofrece anotar su caducidad (opcional). */
export function ExpiryDialog({ api, items, onClose }: { api: CestaApi; items: ExpiryItem[]; onClose: () => void }) {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const today = todayIso();

  async function save() {
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        items.map((item) =>
          api.addLot({ productId: item.productId, productName: item.name, quantity: item.quantity, expiryDate: dates[item.productId] || null, state: "closed" }),
        ),
      );
      onClose();
    } catch {
      setError("No se han podido guardar las fechas. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-background/95 px-4 py-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="expiry-title">
      <section className="mx-auto max-w-[420px] rounded-[22px] border border-border bg-card p-4">
        <h2 id="expiry-title" className="text-base font-bold">
          Caducidades de la compra
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Añade las fechas que conozcas. Si las dejas vacías, Cesta estimará una fecha y podrás corregirla en Necesidades.
        </p>
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <label key={item.productId} className="flex items-center gap-2 rounded-xl bg-muted/65 p-2">
              <span className="min-w-0 flex-1 truncate text-xs font-bold">
                {item.name} · {item.quantity}
              </span>
              <input
                type="date"
                min={today}
                value={dates[item.productId] || ""}
                onChange={(event) => setDates((current) => ({ ...current, [item.productId]: event.target.value }))}
                aria-label={`Caducidad de ${item.name}`}
                className="h-10 max-w-[9.5rem] rounded-lg border border-border bg-card px-1 text-[12px] text-foreground"
              />
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[3, 7, 14].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setDates(Object.fromEntries(items.map((item) => [item.productId, addDaysIso(today, days)])))}
              className="rounded-lg bg-muted px-2 py-1.5 text-[10px] font-bold text-muted-foreground"
            >
              Todo en {days} días
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-3 text-xs font-semibold text-[#a34141]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="h-11 rounded-xl border border-border text-xs font-bold">
            Sin fechas
          </button>
          <button
            type="button"
            disabled={saving || !Object.values(dates).some(Boolean)}
            onClick={() => void save()}
            className="h-11 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            Guardar fechas
          </button>
        </div>
      </section>
    </div>
  );
}
