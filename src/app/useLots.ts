import { useCallback, useEffect, useState } from "react";
import type { CestaApi } from "../data/api";
import type { InventoryLot, LotState } from "../data/types";
import { LOAD_FAILED, reportError } from "../lib/errors";
import { inventoryChanged, useChannel } from "./events";

export interface LotsState {
  lots: InventoryLot[];
  reload: () => Promise<void>;
  setState: (lot: InventoryLot, state: LotState) => Promise<void>;
  setExpiry: (lot: InventoryLot, date: string | null) => Promise<void>;
  /** Retira un lote; devuelve false si no se pudo (y recarga para deshacer el cambio optimista). */
  remove: (lot: InventoryLot) => Promise<boolean>;
  restore: (lot: InventoryLot) => Promise<void>;
}

/**
 * Lotes con estado y caducidad. Se recargan cuando otro dispositivo los cambia y cuando otra
 * pantalla avisa por `inventoryChanged`. Los cambios se ven al momento y se guardan después.
 */
export function useLots(api: CestaApi): LotsState {
  const [lots, setLots] = useState<InventoryLot[]>([]);

  const reload = useCallback(async () => {
    try {
      setLots(await api.lots());
    } catch (error) {
      // Se reintenta con el siguiente refresco.
      reportError(error, "cargar lotes", LOAD_FAILED);
    }
  }, [api]);

  useChannel(inventoryChanged, () => void reload());
  useEffect(() => {
    void reload();
    return api.db.subscribe((table) => {
      if (table === "inventory_lots") void reload();
    });
  }, [api, reload]);

  const patch = (id: string, change: Partial<InventoryLot>) =>
    setLots((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const setState = useCallback(
    async (lot: InventoryLot, state: LotState) => {
      patch(lot.id, { state });
      await api
        .setLotState(lot.id, state)
        .catch((error: unknown) => reportError(error, "estado de lote", "No se ha podido guardar el estado."));
    },
    [api],
  );

  const setExpiry = useCallback(
    async (lot: InventoryLot, date: string | null) => {
      patch(lot.id, { expiryDate: date });
      await api
        .setLotExpiry(lot.id, date)
        .catch((error: unknown) => reportError(error, "caducidad de lote", "No se ha podido guardar la fecha."));
    },
    [api],
  );

  const remove = useCallback(
    async (lot: InventoryLot) => {
      setLots((items) => items.filter((item) => item.id !== lot.id));
      try {
        await api.removeLot(lot.id);
        return true;
      } catch (error) {
        reportError(error, "retirar lote", "No se ha podido retirar.");
        void reload();
        return false;
      }
    },
    [api, reload],
  );

  const restore = useCallback(
    async (lot: InventoryLot) => {
      try {
        await api.addLot(lot);
      } catch (error) {
        reportError(error, "deshacer retirada", "No se ha podido deshacer.");
      }
      await reload();
    },
    [api, reload],
  );

  return { lots, reload, setState, setExpiry, remove, restore };
}
