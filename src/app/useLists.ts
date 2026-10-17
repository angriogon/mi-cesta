import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CestaApi } from "../data/api";
import type { ListItem } from "../data/types";
import { mergeByName } from "../domain/lists";
import { LOAD_FAILED, reportError } from "../lib/errors";

/** Tiempo de espera tras el último cambio antes de guardar: agrupa toques seguidos en una sola escritura. */
export const SAVE_DELAY_MS = 650;

export interface ListsState {
  shopping: ListItem[];
  checklist: ListItem[];
  setShopping: Dispatch<SetStateAction<ListItem[]>>;
  setChecklist: Dispatch<SetStateAction<ListItem[]>>;
  /** Trae la versión del servidor (o envía la local si hay cambios sin guardar). */
  pullLists: () => Promise<void>;
  /** Última lista «Preparar» sin esperar a un render, para cálculos asíncronos. */
  shoppingRef: RefObject<ListItem[]>;
}

/**
 * Listas «Preparar» y «En tienda» de un hogar, sincronizadas entre dispositivos.
 *
 * Cada guardado lleva la revisión que se leyó; si otro dispositivo guardó antes, se mezcla por
 * nombre y se reintenta (como la versión original). Los cambios locales se guardan solos tras
 * `SAVE_DELAY_MS`, y no se guardan de vuelta los que acaban de llegar del servidor.
 *
 * `active` es falso hasta que la app termina la carga inicial: antes no se guarda nada.
 */
export function useLists(api: CestaApi, active: boolean): ListsState {
  const [shopping, setShopping] = useState<ListItem[]>([]);
  const [checklist, setChecklist] = useState<ListItem[]>([]);
  const revision = useRef(0);
  const loaded = useRef(false);
  const dirty = useRef(false);
  const fromRemote = useRef(false);
  const shoppingRef = useRef(shopping);
  const checklistRef = useRef(checklist);
  shoppingRef.current = shopping;
  checklistRef.current = checklist;

  const pushLists = useCallback(async () => {
    if (!loaded.current) return;
    const localShopping = shoppingRef.current;
    const localChecklist = checklistRef.current;
    try {
      const saved = await api.saveLists(localShopping, localChecklist, revision.current, (remote) => ({
        ...remote,
        shopping: mergeByName(remote.shopping, localShopping),
        checklist: mergeByName(remote.checklist, localChecklist),
      }));
      const merged = saved.revision !== revision.current + 1;
      revision.current = saved.revision;
      dirty.current = false;
      if (merged) {
        fromRemote.current = true;
        setShopping(saved.shopping);
        setChecklist(saved.checklist);
      }
    } catch (error) {
      dirty.current = true;
      reportError(error, "guardar listas", "Sin conexión: la lista se guardará en cuanto vuelva.");
    }
  }, [api]);

  const pullLists = useCallback(async () => {
    if (dirty.current) return pushLists();
    try {
      const lists = await api.lists();
      if (lists.revision > revision.current || !loaded.current) {
        revision.current = lists.revision;
        fromRemote.current = true;
        setShopping(lists.shopping);
        setChecklist(lists.checklist);
      }
    } catch (error) {
      reportError(error, "cargar listas", LOAD_FAILED);
    } finally {
      loaded.current = true;
    }
  }, [api, pushLists]);

  // Autoguardado de los cambios hechos en este dispositivo.
  useEffect(() => {
    if (!active || !loaded.current) return;
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    dirty.current = true;
    const timer = window.setTimeout(() => void pushLists(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [shopping, checklist, active, pushLists]);

  return { shopping, checklist, setShopping, setChecklist, pullLists, shoppingRef };
}
