import { useEffect, useMemo, useRef, useState } from "react";
import type { CestaApi } from "../data/api";
import { duplicateCount, groupByCategory } from "../domain/lists";
import { setErrorNotifier } from "../lib/errors";
import { deviceId, readJson, writeJson } from "../lib/storage";
import { useToast } from "../ui/Toast";
import { useAdmin } from "../views/AdminAccess";
import type { ExpiryItem } from "../views/ExpiryDialog";
import type { Account } from "./account";
import { usePetAlerts, usePreloadScreens, useSavedNotice, useSplash, useStorePresence } from "./useAppEffects";
import { useHouseholdData } from "./useHouseholdData";
import { useLists } from "./useLists";
import { usePet } from "./usePet";

export type View = "home" | "purchase" | "stock" | "dog" | "tickets" | "recipes" | "inventory-quick";
export type ScannerTarget = "shopping" | "checklist" | "stock";

/**
 * Todo el estado de la app de un hogar: dominios (listas, despensa, mascota, datos del hogar),
 * navegación y avisos. Las pantallas lo leen con `useCesta()`; aquí no hay lógica de pantalla.
 */
export function useCestaCore(api: CestaApi, account: Account) {
  const householdId = api.db.householdId;
  const memoryKey = `cesta-category-memory-v1:${householdId}`;
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<"prepare" | "store">("prepare");
  const [memory, setMemory] = useState<Record<string, string>>(() => readJson(memoryKey, {}));
  const [newName, setNewName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [needsNotice, setNeedsNotice] = useState(true);
  const [scanner, setScanner] = useState<ScannerTarget | null>(null);
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const device = useMemo(() => deviceId(), []);
  const admin = useAdmin(householdId);
  const toast = useToast();
  const showToast = toast.show;
  useEffect(() => setErrorNotifier((message) => showToast(message)), [showToast]);
  useEffect(() => writeJson(memoryKey, memory), [memory, memoryKey]);

  const lists = useLists(api, ready);
  const pet = usePet(api, ready);
  const data = useHouseholdData(api, {
    ready,
    shopping: lists.shopping,
    shoppingRef: lists.shoppingRef,
    pullLists: lists.pullLists,
  });

  // Carga inicial: listas y despensa antes de quitar la pantalla de bienvenida.
  const { pullLists } = lists;
  const { refreshProducts } = data;
  useEffect(() => {
    void Promise.all([pullLists(), refreshProducts()]).then(() => setReady(true));
  }, [pullLists, refreshProducts]);

  const splash = useSplash(ready);
  usePreloadScreens(ready);
  const petAlert = usePetAlerts(ready, pet.reminders, pet.petName);
  const pendingInStore = lists.checklist.filter((item) => !item.done).length;
  useStorePresence(api, device, ready && view === "purchase" && stage === "store", pendingInStore);
  const saved = useSavedNotice(expiryItems.length > 0);

  const derived = {
    preparing: lists.shopping.filter((item) => !item.done).length,
    storeUnits: lists.checklist.reduce((sum, item) => sum + item.quantity, 0),
    completedUnits: lists.checklist.filter((item) => item.done).reduce((sum, item) => sum + item.quantity, 0),
    groupedShopping: useMemo(() => groupByCategory(lists.shopping), [lists.shopping]),
    groupedChecklist: useMemo(() => groupByCategory(lists.checklist), [lists.checklist]),
    duplicates: useMemo(() => duplicateCount(lists.shopping), [lists.shopping]),
    otherShoppers: data.overview?.activity.filter((item) => item.deviceId !== device) ?? [],
  };

  return {
    api,
    account,
    admin,
    toast,
    ready,
    view,
    setView,
    stage,
    setStage,
    memory,
    setMemory,
    newName,
    setNewName,
    inputRef,
    menuOpen,
    setMenuOpen,
    needsNotice,
    setNeedsNotice,
    scanner,
    setScanner,
    expiryItems,
    setExpiryItems,
    ...lists,
    pet,
    ...data,
    splash,
    petAlert,
    ...saved,
    ...derived,
  };
}

export type CestaCore = ReturnType<typeof useCestaCore>;
