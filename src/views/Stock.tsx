import {
  Archive,
  Bookmark,
  CalendarClock,
  ChevronDown,
  CookingPot,
  FingerprintPattern,
  Gauge,
  ListChecks,
  Lock,
  LogOut,
  Minus,
  PackageCheck,
  PackageOpen,
  Plus,
  ScanLine,
  ShieldCheck,
  Snowflake,
  Trash2,
  Wrench,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CestaApi } from "../data/api";
import type { InventoryLot, LotState, Product } from "../data/types";
import { expiringLots, type Certainty, type Prediction } from "../domain/autocesta";
import { CATEGORIES, type Category } from "../domain/categories";
import type { StockLike } from "../domain/lists";
import { daysUntil, normalize } from "../lib/text";
import { readText, writeText } from "../lib/storage";
import { Button, CategorySelect, EmptyState, Input, NativeSelect, Stepper } from "../ui/primitives";
import type { Notify } from "../ui/Toast";
import type { AdminState } from "./AdminAccess";

export const STATE_LABEL: Record<LotState, string> = {
  closed: "Cerrado",
  opened: "Abierto",
  reserved: "Reservado",
  cooked: "Cocinado",
  frozen: "Congelado",
};
const STATES = Object.keys(STATE_LABEL) as LotState[];
const STATE_TONE: Record<LotState, string> = {
  closed: "border-[#d8e5d9] bg-[#eef4ef] text-[#295b3f] dark:border-[#2d3b31] dark:bg-[#1f2c23] dark:text-[#9fd0ae]",
  opened: "border-[#eadfc8] bg-[#faf4e8] text-[#8a652d] dark:border-[#3a3222] dark:bg-[#2d271c] dark:text-[#e2c08a]",
  reserved: "border-[#ddd9eb] bg-[#f2eff9] text-[#65518c] dark:border-[#332d44] dark:bg-[#252033] dark:text-[#c3b4e6]",
  cooked: "border-[#ecd7ce] bg-[#fbefeb] text-[#984b37] dark:border-[#40291f] dark:bg-[#2f201c] dark:text-[#e6a490]",
  frozen: "border-[#cfe1e9] bg-[#eaf4f8] text-[#356b82] dark:border-[#24363f] dark:bg-[#1b2a31] dark:text-[#93c4d9]",
};

function StateIcon({ state }: { state: LotState }) {
  if (state === "opened") return <PackageOpen className="size-3.5" />;
  if (state === "reserved") return <Bookmark className="size-3.5" />;
  if (state === "cooked") return <CookingPot className="size-3.5" />;
  if (state === "frozen") return <Snowflake className="size-3.5" />;
  return <Archive className="size-3.5" />;
}

/** Lotes con caducidad y estado; se puede cambiar el estado, poner fecha o retirarlos. */
function ExpiryStates({ api, notify, products }: { api: CestaApi; notify: Notify; products: Product[] }) {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [help, setHelp] = useState(() => !readText("cesta-longpress-help-v1"));
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    try {
      setLots(await api.lots());
    } catch {
      // Se reintenta con el siguiente refresco.
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("cesta-inventory-refresh", refresh);
    const unsubscribe = api.db.subscribe((table) => {
      if (table === "inventory_lots") refresh();
    });
    return () => {
      window.removeEventListener("cesta-inventory-refresh", refresh);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

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
      STATES.map((state) => ({ state, quantity: lots.filter((lot) => lot.state === state).reduce((sum, lot) => sum + lot.quantity, 0) })).filter(
        (item) => item.quantity > 0,
      ),
    [lots],
  );

  async function cycle(lot: InventoryLot) {
    const next = STATES[(STATES.indexOf(lot.state) + 1) % STATES.length];
    setLots((items) => items.map((item) => (item.id === lot.id ? { ...item, state: next } : item)));
    setStatus(`${lot.productName}: ${STATE_LABEL[next]}`);
    await api.setLotState(lot.id, next).catch(() => notify("No se ha podido guardar el estado."));
  }

  async function setExpiry(lot: InventoryLot, date: string) {
    setLots((items) => items.map((item) => (item.id === lot.id ? { ...item, expiryDate: date || null } : item)));
    await api.setLotExpiry(lot.id, date || null).catch(() => notify("No se ha podido guardar la fecha."));
  }

  async function retire(lot: InventoryLot) {
    setLots((items) => items.filter((item) => item.id !== lot.id));
    setEditing(null);
    try {
      await api.removeLot(lot.id);
      notify(`${lot.productName} retirado de caducidades.`, {
        label: "Deshacer",
        onClick: () => {
          void api.addLot(lot).then(() => load());
        },
      });
    } catch {
      notify("No se ha podido retirar.");
      void load();
    }
  }

  if (!visible.length) return null;
  return (
    <section className="mb-3 overflow-hidden rounded-[18px] border border-[#d8e5d9] bg-card dark:border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-3 text-left text-[#20462f] dark:text-foreground"
      >
        <CalendarClock className="size-4" />
        <span className="min-w-0 flex-1 text-xs font-bold">Caducidades y estados</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 px-2.5 py-2">
        {summary.map((item) => (
          <span key={item.state} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold ${STATE_TONE[item.state]}`}>
            <StateIcon state={item.state} />
            {STATE_LABEL[item.state]} · {item.quantity}
          </span>
        ))}
      </div>
      {open && (
        <div className="border-t border-border bg-card">
          {help && (
            <div className="flex items-center gap-2 bg-[#faf7ef] px-3 py-2.5 text-[11px] text-[#76582b] dark:bg-muted dark:text-muted-foreground">
              <span className="min-w-0 flex-1">
                Toca el estado para cambiarlo y la fecha para editarla o retirar el producto. El estado no cambia las unidades en existencias.
              </span>
              <button
                type="button"
                onClick={() => {
                  writeText("cesta-longpress-help-v1", "seen");
                  setHelp(false);
                }}
                className="px-1 py-2 font-bold"
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
              <div key={lot.id} className={index ? "border-t border-border/70" : ""}>
                <div className="flex w-full items-center gap-2 px-2.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">{lot.productName}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {lot.quantity} {lot.quantity === 1 ? "unidad" : "unidades"}
                      {lot.location ? ` · ${lot.location}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void cycle(lot)}
                    aria-label={`Cambiar estado de ${lot.productName}. Estado actual: ${STATE_LABEL[lot.state]}`}
                    className={`inline-flex min-h-9 min-w-[6.9rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold ${STATE_TONE[lot.state]}`}
                  >
                    <StateIcon state={lot.state} />
                    {STATE_LABEL[lot.state]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === lot.id ? null : lot.id)}
                    aria-expanded={editing === lot.id}
                    aria-label={`Editar fecha de ${lot.productName}${estimate ? " (fecha estimada)" : ""}`}
                    className={`min-h-9 min-w-[3.6rem] shrink-0 rounded-lg px-1.5 py-1.5 text-center text-[10px] font-bold ${days !== null && days <= 2 ? "bg-[#f8dfda] text-[#9b3f38] dark:bg-[#3a1f1c] dark:text-[#f0a49b]" : "bg-[#f3eadc] text-[#8b622b] dark:bg-[#2d271c] dark:text-[#e2c08a]"}`}
                  >
                    {days === null ? "Sin fecha" : days < 0 ? "Caducado" : days === 0 ? `${prefix}Hoy` : `${prefix}${days} d`}
                  </button>
                </div>
                {editing === lot.id && (
                  <div className="flex items-center gap-2 bg-muted/60 px-2.5 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] font-bold text-muted-foreground">
                      Caduca
                      <input
                        type="date"
                        value={lot.expiryDate ?? ""}
                        onChange={(event) => void setExpiry(lot, event.target.value)}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[12px] text-foreground"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void retire(lot)}
                      className="flex h-9 items-center gap-1 rounded-lg bg-[#fbefeb] px-2.5 text-[10px] font-bold text-[#a34141]"
                    >
                      <Trash2 className="size-3.5" /> Retirar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {status && <p className="border-t border-border/60 px-3 py-2 text-[10px] font-semibold text-primary" role="status">{status}</p>}
        </div>
      )}
    </section>
  );
}

export function Stock(props: {
  api: CestaApi;
  stock: StockLike[];
  products: Product[];
  needs: StockLike[];
  stockUnits: number;
  updateStock: (id: string, change: (item: StockLike) => StockLike) => void;
  changeCategory: (item: StockLike, category: Category) => void;
  removeStock: (item: StockLike) => Promise<boolean>;
  addStockProduct: (name: string, category: Category) => Promise<{ ok: boolean; error?: string }>;
  addNeedsToChecklist: () => void;
  admin: AdminState;
  predictions: Prediction[];
  certainty: Certainty[];
  openScanner: () => void;
  notify: Notify;
}) {
  const { admin } = props;
  const [biometricStatus, setBiometricStatus] = useState("");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [maintenance, setMaintenance] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("Despensa");
  const [status, setStatus] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyStocked, setOnlyStocked] = useState(false);
  const suppressed = props.products.filter((product) => product.suppressed);

  const groups = useMemo(() => {
    const key = normalize(query);
    const source = maintenance ? props.stock.filter((item) => !onlyStocked || item.quantity > 0 || item.minimum > 0) : props.needs;
    let budget = key ? 60 : Infinity;
    return CATEGORIES.map((category) => {
      const items = source.filter((item) => item.category === category && (!key || normalize(item.name).includes(key))).slice(0, budget);
      budget -= items.length;
      return { category, items };
    }).filter((group) => group.items.length > 0);
  }, [query, maintenance, onlyStocked, props.needs, props.stock]);

  useEffect(() => {
    if (!admin.unlocked) {
      setMaintenance(false);
      setCollapsed(new Set());
      return;
    }
    if (pending) {
      setMaintenance(true);
      setPending(false);
      setCollapsed(new Set(CATEGORIES));
    }
  }, [pending, admin.unlocked]);

  function toggleMaintenance() {
    setError("");
    setStatus("");
    if (maintenance) {
      setMaintenance(false);
      setCollapsed(new Set());
      return;
    }
    if (!admin.unlocked) {
      setPending(true);
      admin.request();
      return;
    }
    setMaintenance(true);
    setCollapsed(new Set(CATEGORIES));
  }

  function toggleGroup(category: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setStatus("Agregando…");
    const result = await props.addStockProduct(newName.trim(), newCategory);
    setStatus(result.ok ? "Producto agregado al almacén." : result.error || "No se ha podido agregar.");
    if (result.ok) {
      setNewName("");
      setSearch(newName.trim());
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(newCategory);
        return next;
      });
    }
  }

  async function remove(item: StockLike) {
    setError("");
    const ok = await props.removeStock(item);
    if (ok) setStatus(`${item.name} eliminado.`);
    else setError("No se ha podido eliminar. Comprueba la conexión e inténtalo de nuevo.");
  }

  const doubtful = props.certainty
    .filter((item) => item.currentStock > 0 && item.confidence < 0.82)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 3);
  const upcoming = props.predictions.filter((item) => item.daysUntil <= 7 && !item.lowNow).slice(0, 4);

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={toggleMaintenance}
          aria-pressed={maintenance}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold transition-colors ${maintenance ? "bg-primary text-primary-foreground" : "border border-border bg-card text-primary"}`}
        >
          {admin.unlocked || maintenance ? <Wrench className="size-3.5" /> : <Lock className="size-3.5" />} {maintenance ? "Listo" : "Mantenimiento"}
        </button>
        {maintenance && (
          <button
            type="button"
            onClick={admin.lock}
            aria-label="Bloquear mantenimiento"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(41,91,63,.2)]"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>

      {maintenance && (
        <section className="mb-3 rounded-[16px] border border-[#d8e5d9] bg-[#edf4ee] p-3 text-[#20462f] dark:border-border dark:bg-card dark:text-foreground">
          <div className="mb-2">
            <p className="text-xs font-bold">Mantenimiento del catálogo</p>
            <p className="mt-0.5 text-[11px] opacity-75">Agrega, elimina o ajusta existencias, mínimos y categoría de cada producto.</p>
          </div>
          <form onSubmit={add} className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nombre del producto"
              maxLength={80}
              className="h-10 rounded-lg bg-card text-sm"
            />
            <Button type="submit" disabled={!newName.trim()} className="h-10 rounded-lg px-3 text-xs">
              <Plus className="size-3.5" /> Añadir
            </Button>
            <NativeSelect value={newCategory} onChange={(event) => setNewCategory(event.target.value as Category)} className="col-span-2 w-full [&_select]:h-10 [&_select]:rounded-lg [&_select]:bg-card [&_select]:text-xs">
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </NativeSelect>
          </form>
          <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
            <input type="checkbox" checked={onlyStocked} onChange={(event) => setOnlyStocked(event.target.checked)} className="size-4 accent-primary" />
            Mostrar solo productos con existencias o mínimo
          </label>
          {status && (
            <p className="mt-2 text-[11px] font-bold" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="mt-2 text-[11px] font-bold text-[#a34141]" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {!maintenance && <ExpiryStates api={props.api} notify={props.notify} products={props.products} />}

      {!maintenance && doubtful.length > 0 && (
        <section className="mb-3 rounded-[16px] border border-[#d8e5d9] bg-[#eef4ef] px-3 py-2.5 text-[#20462f] dark:border-border dark:bg-card dark:text-foreground">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.08em]">
            <Gauge className="size-3.5" /> Radar de certeza
          </p>
          <div className="mt-1.5 space-y-1">
            {doubtful.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate font-semibold">{item.name}</span>
                <span className="shrink-0 opacity-70">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!maintenance && upcoming.length > 0 && (
        <section className="mb-3 rounded-[16px] border border-[#e6dfcf] bg-[#faf7ef] px-3 py-2.5 dark:border-border dark:bg-card">
          <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#8b672f]">Stock predictivo</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {upcoming.map((item) => (
              <span key={item.productId} className="rounded-lg bg-card px-2 py-1 text-[10px] font-semibold dark:bg-muted">
                {item.productName} · {item.daysUntil <= 0 ? "toca reponer" : `${item.daysUntil} d`}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mb-3 grid grid-cols-2 gap-2" aria-label="Resumen del almacén">
        <div className="rounded-[16px] border border-border bg-card px-3 py-2.5 shadow-[0_8px_24px_rgba(32,47,38,.045)]">
          <p className="text-[10px] font-semibold text-muted-foreground">Existencias</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{Number.isInteger(props.stockUnits) ? props.stockUnits : props.stockUnits.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">unidades en casa</p>
        </div>
        <div className="rounded-[16px] border border-[#d8e5d9] bg-[#eaf3eb] px-3 py-2.5 text-left text-[#20462f] shadow-[0_8px_24px_rgba(41,91,63,.05)] dark:border-border dark:bg-secondary dark:text-secondary-foreground">
          <p className="text-[10px] font-semibold opacity-70">Necesidades</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{props.needs.length}</p>
          <p className="text-[10px] opacity-70">por reponer</p>
        </div>
      </section>

      <label htmlFor="stock-search" className="sr-only">
        Buscar un producto en el almacén
      </label>
      <div className="mb-2 flex gap-2">
        <Input
          id="stock-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={maintenance ? "Buscar en el catálogo…" : "Buscar en lo que falta…"}
          className="h-11 min-w-0 flex-1 rounded-xl border-border bg-card px-3.5 text-[16px] shadow-[0_8px_24px_rgba(32,47,38,.045)]"
        />
        <button
          type="button"
          onClick={props.openScanner}
          aria-label="Escanear código de barras"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary"
        >
          <ScanLine className="size-4" />
        </button>
      </div>
      <p className="mb-4 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {maintenance ? "Todos los productos" : "Necesito comprar"}
      </p>

      {groups.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="size-7" />}
          title={search ? "Sin resultados" : maintenance ? "Almacén vacío" : "Todo está cubierto"}
          text={
            search
              ? "Prueba con otro nombre de producto."
              : maintenance
                ? "Agrega el primer producto desde Mantenimiento."
                : props.stock.some((item) => item.minimum > 0)
                  ? "Tienes suficientes existencias según los mínimos definidos."
                  : "Define mínimos en Mantenimiento y aquí verás lo que falta en casa."
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`stock-${group.category}`}>
              <button
                type="button"
                onClick={() => toggleGroup(group.category)}
                aria-expanded={!collapsed.has(group.category) || Boolean(normalize(query))}
                className="mb-1.5 flex w-full items-center justify-between px-1 py-1"
              >
                <h2 id={`stock-${group.category}`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.category} · {group.items.length}
                </h2>
                <ChevronDown className={`size-3.5 text-muted-foreground/70 transition-transform ${collapsed.has(group.category) && !normalize(query) ? "-rotate-90" : ""}`} />
              </button>
              {(!collapsed.has(group.category) || Boolean(normalize(query))) && (
                <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[0_8px_24px_rgba(32,47,38,.045)]">
                  {group.items.map((item, index) => {
                    const missing = Math.max(0, item.minimum - item.quantity);
                    const certainty = props.certainty.find((entry) => entry.id === item.id);
                    const prediction = props.predictions.find((entry) => entry.productId === item.id);
                    return (
                      <div key={item.id} className={`px-2 py-1.5 ${index ? "border-t border-border/75" : ""}`}>
                        {maintenance ? (
                          <div className="flex min-h-10 flex-wrap items-center gap-1">
                            <p className="min-w-[8rem] flex-1 truncate text-[12px] font-semibold">{item.name}</p>
                            <div className="w-[6rem] shrink-0">
                              <CategorySelect value={item.category} onChange={(category) => props.changeCategory(item, category)} label={`Cambiar categoría de ${item.name}`} />
                            </div>
                            <Stepper
                              value={item.quantity}
                              label={`existencias de ${item.name}`}
                              minusDisabled={item.quantity <= 0}
                              onMinus={() => props.updateStock(item.id, (entry) => ({ ...entry, quantity: Math.max(0, entry.quantity - 1) }))}
                              onPlus={() => props.updateStock(item.id, (entry) => ({ ...entry, quantity: entry.quantity + 1 }))}
                            />
                            <div className="flex shrink-0 items-center" aria-label={`Mínimo de ${item.name}`}>
                              <span className="mr-0.5 text-[8px] font-bold text-muted-foreground">MÍN.</span>
                              <button
                                type="button"
                                aria-label={`Reducir mínimo de ${item.name}`}
                                disabled={item.minimum <= 0}
                                onClick={() => props.updateStock(item.id, (entry) => ({ ...entry, minimum: Math.max(0, entry.minimum - 1) }))}
                                className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground disabled:opacity-40"
                              >
                                <Minus className="size-2.5" />
                              </button>
                              <span className="w-5 text-center text-[11px] font-bold tabular-nums">{item.minimum}</span>
                              <button
                                type="button"
                                aria-label={`Aumentar mínimo de ${item.name}`}
                                onClick={() => props.updateStock(item.id, (entry) => ({ ...entry, minimum: entry.minimum + 1 }))}
                                className="flex size-7 items-center justify-center rounded-md bg-muted text-primary"
                              >
                                <Plus className="size-2.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => void remove(item)}
                              aria-label={`Eliminar ${item.name} del almacén`}
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#fbefeb] text-[#a34141] active:bg-[#f2ddd5]"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex min-h-10 items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                              {item.name}
                              <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                                {certainty?.label && certainty.currentStock > 0 && certainty.confidence < 0.82
                                  ? certainty.label
                                  : prediction
                                    ? `cada ${prediction.averageDays} d`
                                    : ""}
                              </span>
                            </p>
                            <span className="max-w-[7.4rem] shrink truncate rounded-lg bg-muted px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                              {item.quantity} de {item.minimum}
                            </span>
                            <span className="shrink-0 rounded-lg bg-[#eef4ef] px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-primary dark:bg-secondary">
                              Faltan {missing}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {!maintenance && props.needs.length > 0 && (
        <Button onClick={props.addNeedsToChecklist} className="mt-6 h-13 w-full rounded-2xl text-[15px] shadow-[0_10px_24px_rgba(41,91,63,.16)]">
          <ListChecks className="size-5" /> Añadir necesidades a la lista
        </Button>
      )}

      {maintenance && suppressed.length > 0 && (
        <section className="mt-6 rounded-[20px] border border-border bg-card p-4">
          <h2 className="text-sm font-bold">Productos que AutoCesta no sugiere</h2>
          <div className="mt-2 space-y-1">
            {suppressed.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[12px]">
                <span className="truncate font-semibold">{product.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    void props.api
                      .unsuppress(product.id)
                      .then(() => props.notify(`${product.name} vuelve a poder sugerirse.`))
                      .catch(() => props.notify("No se ha podido guardar."))
                  }
                  className="shrink-0 px-1 py-1.5 text-[11px] font-bold text-primary"
                >
                  Volver a sugerir
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {maintenance && (
        <section className="mt-6 rounded-[20px] border border-border bg-card p-4 shadow-[0_10px_30px_rgba(32,47,38,.05)]" aria-labelledby="stock-security-title">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="stock-security-title" className="text-sm font-bold">
                Acceso de administrador
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">El stock y los mínimos solo pueden editarse después de identificarse en este dispositivo.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/75 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <FingerprintPattern className="size-4 text-primary" /> Face ID / Touch ID
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold ${admin.biometricEnabled ? "bg-[#dcebdd] text-[#285a3d]" : "bg-card text-muted-foreground"}`}
            >
              {admin.biometricEnabled ? "ACTIVA" : "NO ACTIVA"}
            </span>
          </div>
          {!admin.biometricEnabled && admin.biometricAvailable && (
            <Button
              variant="outline"
              onClick={async () =>
                setBiometricStatus(
                  (await admin.enableBiometrics()) ? "Biometría activada correctamente." : "No se pudo activar. Comprueba la configuración del dispositivo.",
                )
              }
              className="mt-3 h-11 w-full rounded-xl"
            >
              <FingerprintPattern className="size-4" /> Activar biometría
            </Button>
          )}
          {!admin.biometricAvailable && (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              La biometría no está disponible en este navegador. El acceso seguirá protegido mediante PIN.
            </p>
          )}
          {biometricStatus && (
            <p className="mt-3 text-xs font-semibold text-muted-foreground" role="status">
              {biometricStatus}
            </p>
          )}
          <Button variant="ghost" onClick={admin.lock} className="mt-2 h-10 w-full rounded-xl text-muted-foreground">
            <Lock className="size-4" /> Bloquear ahora
          </Button>
        </section>
      )}
    </>
  );
}
