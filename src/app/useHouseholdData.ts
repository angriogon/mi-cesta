import { useCallback, useEffect, useState, type RefObject } from "react";
import type { CestaApi } from "../data/api";
import type { ListItem, PriceMeta, PriceRef } from "../data/types";
import type { Overview, Prediction } from "../domain/autocesta";
import { LOAD_FAILED, notifyError, reportError } from "../lib/errors";
import { useProducts } from "./useProducts";

const EMPTY_PRICE_META: PriceMeta = { postalCode: "", lastAttemptedAt: null, lastSuccessfulAt: null, updatedCount: 0 };

/**
 * Datos del hogar que dependen de la despensa: resumen de Inicio, precios, previsiones y
 * sustituciones rechazadas. También mantiene todo al día cuando otro dispositivo cambia algo.
 */
export function useHouseholdData(
  api: CestaApi,
  {
    ready,
    shopping,
    shoppingRef,
    pullLists,
  }: { ready: boolean; shopping: ListItem[]; shoppingRef: RefObject<ListItem[]>; pullLists: () => Promise<void> },
) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [prices, setPrices] = useState<PriceRef[]>([]);
  const [priceMeta, setPriceMeta] = useState<PriceMeta>(EMPTY_PRICE_META);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [rejected, setRejected] = useState<{ requestedName: string; productId: string }[]>([]);

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api.overview(shoppingRef.current));
    } catch (error) {
      // Se reintenta en el siguiente refresco.
      reportError(error, "cargar resumen", LOAD_FAILED);
    }
  }, [api, shoppingRef]);

  const products = useProducts(api, () => void refreshOverview());
  const { refreshProducts } = products;

  const refreshPrices = useCallback(async () => {
    const result = await api.prices();
    setPrices(result.prices);
    setPriceMeta(result.meta);
  }, [api]);

  // Lo secundario se carga con Inicio ya visible.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      refreshPrices().catch(notifyError("cargar precios", LOAD_FAILED));
      api.insights().then(setPredictions).catch(notifyError("cargar previsiones", LOAD_FAILED));
      api.rejectedSubstitutions().then(setRejected).catch(notifyError("cargar sustituciones", LOAD_FAILED));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ready, api, refreshPrices]);

  // Cambios hechos desde otros dispositivos (agrupados) y al volver a la app.
  useEffect(() => {
    if (!ready) return;
    let timer: number | null = null;
    const pending = new Set<string>();
    const unsubscribe = api.db.subscribe((table) => {
      pending.add(table);
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const tables = new Set(pending);
        pending.clear();
        if (tables.has("lists")) void pullLists();
        if (tables.has("products") || tables.has("inventory_lots") || tables.has("tickets") || tables.has("activity"))
          void refreshProducts();
        if (tables.has("prices")) refreshPrices().catch(notifyError("cargar precios", LOAD_FAILED));
      }, 400);
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void pullLists();
    };
    const interval = window.setInterval(onVisible, 8000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [ready, api, pullLists, refreshProducts, refreshPrices]);

  // El resumen lee varias tablas: se recalcula una vez que la lista deja de cambiar, no en cada toque.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void refreshOverview(), 500);
    return () => window.clearTimeout(timer);
  }, [shopping, ready, refreshOverview]);

  return {
    ...products,
    overview,
    setOverview,
    refreshOverview,
    prices,
    setPrices,
    priceMeta,
    setPriceMeta,
    refreshPrices,
    predictions,
    setPredictions,
    rejected,
    setRejected,
  };
}
