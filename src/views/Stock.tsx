import { ChevronDown, Gauge, ListChecks, Lock, LogOut, PackageCheck, ScanLine, Wrench } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CestaApi } from "../data/api";
import type { Product } from "../data/types";
import { type Certainty, type Prediction } from "../domain/autocesta";
import { CATEGORIES, type Category } from "../domain/categories";
import type { StockLike } from "../domain/lists";
import { normalize } from "../lib/text";
import { Button, EmptyState, Input, StatCard } from "../ui/primitives";
import type { Notify } from "../ui/Toast";
import type { AdminState } from "./admin/useAdmin";
import { ExpiryStates } from "./stock/ExpiryStates";
import { AdminSection, MaintenancePanel, SuppressedList } from "./stock/MaintenanceSections";
import { StockRow } from "./stock/StockRow";

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
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search);
  const [maintenance, setMaintenance] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyStocked, setOnlyStocked] = useState(false);
  const suppressed = props.products.filter((product) => product.suppressed);

  const groups = useMemo(() => {
    const key = normalize(query);
    const source = maintenance
      ? props.stock.filter((item) => !onlyStocked || item.quantity > 0 || item.minimum > 0)
      : props.needs;
    let budget = key ? 60 : Infinity;
    return CATEGORIES.map((category) => {
      const items = source
        .filter((item) => item.category === category && (!key || normalize(item.name).includes(key)))
        .slice(0, budget);
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

  async function add(name: string, category: Category): Promise<boolean> {
    setStatus("Agregando…");
    const result = await props.addStockProduct(name, category);
    setStatus(result.ok ? "Producto agregado al almacén." : result.error || "No se ha podido agregar.");
    if (result.ok) {
      setSearch(name);
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(category);
        return next;
      });
    }
    return result.ok;
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
          className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${maintenance ? "bg-primary text-primary-foreground" : " bg-card text-primary"}`}
        >
          {admin.unlocked || maintenance ? <Wrench className="size-3.5" /> : <Lock className="size-3.5" />}{" "}
          {maintenance ? "Listo" : "Mantenimiento"}
        </button>
        {maintenance && (
          <button
            type="button"
            onClick={admin.lock}
            aria-label="Bloquear mantenimiento"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>

      {maintenance && (
        <MaintenancePanel
          onAdd={add}
          onlyStocked={onlyStocked}
          setOnlyStocked={setOnlyStocked}
          status={status}
          error={error}
        />
      )}

      {!maintenance && <ExpiryStates api={props.api} notify={props.notify} products={props.products} />}

      {!maintenance && doubtful.length > 0 && (
        <section className="mb-3 rounded-lg bg-primary-soft px-3 py-2.5 text-primary">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase">
            <Gauge className="size-3.5" /> Radar de certeza
          </p>
          <div className="mt-1.5 space-y-1">
            {doubtful.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-semibold">{item.name}</span>
                <span className="shrink-0">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!maintenance && upcoming.length > 0 && (
        <section className="mb-3 rounded-lg bg-warning-soft px-3 py-2.5">
          <p className="text-xs font-semibold uppercase text-warning">Stock predictivo</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {upcoming.map((item) => (
              <span key={item.productId} className="rounded-lg bg-card px-2 py-1 text-xs font-semibold">
                {item.productName} · {item.daysUntil <= 0 ? "toca reponer" : `${item.daysUntil} d`}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mb-3 grid grid-cols-2 gap-2" aria-label="Resumen del almacén">
        <StatCard
          label="Existencias"
          value={Number.isInteger(props.stockUnits) ? props.stockUnits : props.stockUnits.toFixed(1)}
          hint="unidades en casa"
        />
        <StatCard label="Necesidades" value={props.needs.length} hint="por reponer" tone="primary" />
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
          className="h-11 min-w-0 flex-1 rounded-xl bg-card px-3.5 text-[1rem]"
        />
        <button
          type="button"
          onClick={props.openScanner}
          aria-label="Escanear código de barras"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary"
        >
          <ScanLine className="size-4" />
        </button>
      </div>
      <p className="mb-4 px-1 text-xs font-semibold uppercase text-muted-foreground">
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
                <h2 id={`stock-${group.category}`} className="text-xs font-semibold uppercase text-muted-foreground">
                  {group.category} · {group.items.length}
                </h2>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground/70 transition-transform ${collapsed.has(group.category) && !normalize(query) ? "-rotate-90" : ""}`}
                />
              </button>
              {(!collapsed.has(group.category) || Boolean(normalize(query))) && (
                <div className="overflow-hidden rounded-lg bg-card">
                  {group.items.map((item, index) => (
                    <StockRow
                      key={item.id}
                      item={item}
                      separated={index > 0}
                      maintenance={maintenance}
                      certainty={props.certainty.find((entry) => entry.id === item.id)}
                      prediction={props.predictions.find((entry) => entry.productId === item.id)}
                      updateStock={props.updateStock}
                      changeCategory={props.changeCategory}
                      onRemove={() => void remove(item)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {!maintenance && props.needs.length > 0 && (
        <Button onClick={props.addNeedsToChecklist} className="mt-6 h-13 w-full rounded-xl text-[0.9375rem]">
          <ListChecks className="size-5" /> Añadir necesidades a la lista
        </Button>
      )}

      {maintenance && <SuppressedList api={props.api} notify={props.notify} products={suppressed} />}

      {maintenance && <AdminSection admin={admin} />}
    </>
  );
}
