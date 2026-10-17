import {
  Archive,
  Bookmark,
  CalendarClock,
  ChevronDown,
  CookingPot,
  PackageOpen,
  Snowflake,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CestaApi } from "../../data/api";
import type { InventoryLot, LotState, Product } from "../../data/types";
import { expiringLots } from "../../domain/autocesta";
import { daysUntil } from "../../lib/text";
import { readText, writeText } from "../../lib/storage";
import type { Notify } from "../../ui/Toast";
import { useLots } from "../../app/useLots";

export const STATE_LABEL: Record<LotState, string> = {
  closed: "Cerrado",
  opened: "Abierto",
  reserved: "Reservado",
  cooked: "Cocinado",
  frozen: "Congelado",
};

export const STATES = Object.keys(STATE_LABEL) as LotState[];

export const STATE_TONE: Record<LotState, string> = {
  closed: "border-primary-line bg-primary-soft text-primary",
  opened: "border-warning-line bg-warning-soft text-warning",
  reserved: "border-info-line bg-info-soft text-info",
  cooked: "border-danger-line bg-danger-soft text-danger",
  frozen: "border-info-line bg-info-soft text-info",
};

export function StateIcon({ state }: { state: LotState }) {
  if (state === "opened") return <PackageOpen className="size-3.5" />;
  if (state === "reserved") return <Bookmark className="size-3.5" />;
  if (state === "cooked") return <CookingPot className="size-3.5" />;
  if (state === "frozen") return <Snowflake className="size-3.5" />;
  return <Archive className="size-3.5" />;
}

/** Lotes con caducidad y estado; se puede cambiar el estado, poner fecha o retirarlos. */
export function ExpiryStates({ api, notify, products }: { api: CestaApi; notify: Notify; products: Product[] }) {
  const { lots, setState, setExpiry: saveExpiry, remove, restore } = useLots(api);
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [help, setHelp] = useState(() => !readText("cesta-longpress-help-v1"));
  const [editing, setEditing] = useState<string | null>(null);

  // Fecha real o, si no hay, la estimada por categoría (la misma que usa Inicio).
  const estimates = useMemo(() => new Map(expiringLots(lots, products).map((lot) => [lot.id, lot])), [lots, products]);
  const effective = (lot: InventoryLot) => lot.expiryDate || estimates.get(lot.id)?.expiryDate || "9999";
  const visible = useMemo(
    () => [...lots].sort((a, b) => effective(a).localeCompare(effective(b))).slice(0, 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lots, estimates],
  );
  const summary = useMemo(
    () =>
      STATES.map((state) => ({
        state,
        quantity: lots.filter((lot) => lot.state === state).reduce((sum, lot) => sum + lot.quantity, 0),
      })).filter((item) => item.quantity > 0),
    [lots],
  );

  async function cycle(lot: InventoryLot) {
    const next = STATES[(STATES.indexOf(lot.state) + 1) % STATES.length];
    setStatus(`${lot.productName}: ${STATE_LABEL[next]}`);
    await setState(lot, next);
  }

  async function setExpiry(lot: InventoryLot, date: string) {
    await saveExpiry(lot, date || null);
  }

  async function retire(lot: InventoryLot) {
    setEditing(null);
    if (await remove(lot))
      notify(`${lot.productName} retirado de caducidades.`, {
        label: "Deshacer",
        onClick: () => void restore(lot),
      });
  }

  if (!visible.length) return null;
  return (
    <section className="mb-3 overflow-hidden rounded-xl bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-3 text-left text-primary"
      >
        <CalendarClock className="size-4" />
        <span className="min-w-0 flex-1 text-xs font-semibold">Caducidades y estados</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="flex gap-1.5 overflow-x-auto border-t-[0.5px] border-separator px-2.5 py-2">
        {summary.map((item) => (
          <span
            key={item.state}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${STATE_TONE[item.state]}`}
          >
            <StateIcon state={item.state} />
            {STATE_LABEL[item.state]} · {item.quantity}
          </span>
        ))}
      </div>
      {open && (
        <div className="border-t bg-card">
          {help && (
            <div className="flex items-center gap-2 bg-warning-soft px-3 py-2.5 text-xs text-warning">
              <span className="min-w-0 flex-1">
                Toca el estado para cambiarlo y la fecha para editarla o retirar el producto. El estado no cambia las
                unidades en existencias.
              </span>
              <button
                type="button"
                onClick={() => {
                  writeText("cesta-longpress-help-v1", "seen");
                  setHelp(false);
                }}
                className="px-1 py-2 font-semibold"
              >
                Entendido
              </button>
            </div>
          )}
          {visible.map((lot, index) => {
            const estimate = lot.expiryDate ? null : estimates.get(lot.id);
            const days = lot.expiryDate ? daysUntil(lot.expiryDate) : (estimate?.daysUntil ?? null);
            const prefix = estimate ? "≈" : "";
            return (
              <div key={lot.id} className={index ? "border-t-[0.5px] border-separator" : ""}>
                <div className="flex w-full items-center gap-2 px-2.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.75rem] font-semibold">{lot.productName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {lot.quantity} {lot.quantity === 1 ? "unidad" : "unidades"}
                      {lot.location ? ` · ${lot.location}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void cycle(lot)}
                    aria-label={`Cambiar estado de ${lot.productName}. Estado actual: ${STATE_LABEL[lot.state]}`}
                    className={`inline-flex min-h-9 min-w-[6.9rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold ${STATE_TONE[lot.state]}`}
                  >
                    <StateIcon state={lot.state} />
                    {STATE_LABEL[lot.state]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === lot.id ? null : lot.id)}
                    aria-expanded={editing === lot.id}
                    aria-label={`Editar fecha de ${lot.productName}${estimate ? " (fecha estimada)" : ""}`}
                    className={`min-h-9 min-w-[3.6rem] shrink-0 rounded-lg px-1.5 py-1.5 text-center text-xs font-semibold ${days !== null && days <= 2 ? "bg-danger-soft text-danger " : "bg-warning-soft text-warning "}`}
                  >
                    {days === null
                      ? "Sin fecha"
                      : days < 0
                        ? "Caducado"
                        : days === 0
                          ? `${prefix}Hoy`
                          : `${prefix}${days} d`}
                  </button>
                </div>
                {editing === lot.id && (
                  <div className="flex items-center gap-2 bg-muted/60 px-2.5 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-muted-foreground">
                      Caduca
                      <input
                        type="date"
                        value={lot.expiryDate ?? ""}
                        onChange={(event) => void setExpiry(lot, event.target.value)}
                        className="h-9 min-w-0 flex-1 rounded-lg bg-card px-2 text-[0.75rem] text-foreground"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void retire(lot)}
                      className="flex h-9 items-center gap-1 rounded-lg bg-danger-soft px-2.5 text-xs font-semibold text-danger"
                    >
                      <Trash2 className="size-3.5" /> Retirar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {status && (
            <p className="border-t-[0.5px] border-separator px-3 py-2 text-xs font-semibold text-primary" role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
