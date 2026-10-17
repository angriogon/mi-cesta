import { Archive, Bell, Dog, House, LoaderCircle, PackageCheck, ReceiptText, ShoppingBasket, X } from "lucide-react";
import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { ApiError, type CestaApi } from "../data/api";
import type { DogReminder, ListItem, PriceMeta, PriceRef, Product } from "../data/types";
import type { Overview, Prediction } from "../domain/autocesta";
import type { Category } from "../domain/categories";
import { PERISHABLE, guessCategory } from "../domain/categories";
import {
  addNamesToChecklist,
  addNeeds,
  addSuggestions,
  addToShopping,
  duplicateCount,
  groupByCategory,
  mergeByName,
  mergeDuplicates,
  moveToChecklist,
  type StockLike,
} from "../domain/lists";
import { normalize, todayIso } from "../lib/text";
import { deviceId, deviceName, readJson, writeJson } from "../lib/storage";
import type { BarcodeProduct } from "../data/types";
import type { Account } from "./account";
import { APP_VERSION } from "./config";
import { AdminAccess, useAdmin } from "../views/AdminAccess";
import { BarcodeScanner } from "../views/BarcodeScanner";
import { ExpiryDialog, type ExpiryItem } from "../views/ExpiryDialog";
import { Home } from "../views/Home";
import { Menu } from "../views/Menu";
import { Prepare, PurchaseShell, StoreList } from "../views/Purchase";
import { Stock } from "../views/Stock";
import { Toast, useToast } from "../ui/Toast";

const DogView = lazy(() => import("../views/Dog").then((module) => ({ default: module.DogView })));
const TicketsView = lazy(() => import("../views/Tickets").then((module) => ({ default: module.TicketsView })));
const RecipesView = lazy(() => import("../views/Recipes").then((module) => ({ default: module.RecipesView })));
const QuickInventory = lazy(() => import("../views/QuickInventory").then((module) => ({ default: module.QuickInventory })));

export type View = "home" | "purchase" | "stock" | "dog" | "tickets" | "recipes" | "inventory-quick";
type ScannerTarget = "shopping" | "checklist" | "stock";

const toStock = (product: Product): StockLike => ({
  id: product.id,
  name: product.name,
  category: product.category,
  quantity: product.currentStock,
  minimum: product.minimumStock,
});

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (!navigator.onLine) return "Sin conexión. Los cambios se guardarán cuando vuelva internet.";
  return fallback;
}

export function CestaApp({ api, account }: { api: CestaApi; account: Account }) {
  const householdId = api.db.householdId;
  const memoryKey = `cesta-category-memory-v1:${householdId}`;
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<"prepare" | "store">("prepare");
  const [shopping, setShopping] = useState<ListItem[]>([]);
  const [checklist, setChecklist] = useState<ListItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [memory, setMemory] = useState<Record<string, string>>(() => readJson(memoryKey, {}));
  const [newName, setNewName] = useState("");
  const [ready, setReady] = useState(false);
  const [splash, setSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [needsNotice, setNeedsNotice] = useState(true);
  const [savedCount, setSavedCount] = useState(0);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pull, setPull] = useState(0);
  const [dogAlert, setDogAlert] = useState<DogReminder | null>(null);
  const [reminders, setReminders] = useState<DogReminder[]>([]);
  const [prices, setPrices] = useState<PriceRef[]>([]);
  const [priceMeta, setPriceMeta] = useState<PriceMeta>({ postalCode: "", lastAttemptedAt: null, lastSuccessfulAt: null, updatedCount: 0 });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scanner, setScanner] = useState<ScannerTarget | null>(null);
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [petName, setPetName] = useState("Mascota");
  const [rejected, setRejected] = useState<{ requestedName: string; productId: string }[]>([]);
  const admin = useAdmin(householdId);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;
  const writes = useRef(new Map<string, Promise<unknown>>());
  const device = useMemo(() => deviceId(), []);

  // ---- Sincronización de listas (revisión + mezcla por nombre, como la versión original) ----
  const revision = useRef(0);
  const loaded = useRef(false);
  const dirty = useRef(false);
  const fromRemote = useRef(false);
  const saveTimer = useRef<number | null>(null);
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
      const changed = saved.revision !== revision.current + 1;
      revision.current = saved.revision;
      dirty.current = false;
      if (changed) {
        fromRemote.current = true;
        setShopping(saved.shopping);
        setChecklist(saved.checklist);
      }
    } catch {
      dirty.current = true;
    }
  }, [api]);

  const pullLists = useCallback(async () => {
    if (dirty.current) return void pushLists();
    try {
      const lists = await api.lists();
      if (lists.revision > revision.current || !loaded.current) {
        revision.current = lists.revision;
        fromRemote.current = true;
        setShopping(lists.shopping);
        setChecklist(lists.checklist);
      }
      loaded.current = true;
    } catch {
      loaded.current = true;
    }
  }, [api, pushLists]);

  useEffect(() => {
    if (!ready || !loaded.current) return;
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    dirty.current = true;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void pushLists(), 650);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [shopping, checklist, ready, pushLists]);

  // ---- Carga de datos ----
  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api.overview(shoppingRef.current));
    } catch {
      // Se reintenta en el siguiente refresco.
    }
  }, [api]);

  const refreshProducts = useCallback(async () => {
    try {
      const next = await api.products();
      startTransition(() => setProducts(next));
    } catch {
      // Se reintenta en el siguiente refresco.
    }
    await refreshOverview();
  }, [api, refreshOverview]);

  const refreshPrices = useCallback(async () => {
    const result = await api.prices();
    setPrices(result.prices);
    setPriceMeta(result.meta);
  }, [api]);

  useEffect(() => {
    void (async () => {
      await Promise.all([pullLists(), refreshProducts()]);
      setReady(true);
    })();
  }, [pullLists, refreshProducts]);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setSplashFading(true);
      window.setTimeout(() => setSplash(false), 220);
    }, ready ? 0 : 1400);
    return () => window.clearTimeout(fadeTimer);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      api.reminders().then(setReminders).catch(() => undefined);
      refreshPrices().catch(() => undefined);
      api.insights().then(setPredictions).catch(() => undefined);
      api.rejectedSubstitutions().then(setRejected).catch(() => undefined);
      api.household().then((household) => setPetName(household.petName || "Mascota")).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ready, api, refreshPrices]);

  // Actualización automática de precios cada 72 h si hay código postal y wifi (o sin información de red).
  const autoPricesStarted = useRef(false);
  useEffect(() => {
    if (!ready || autoPricesStarted.current || !priceMeta.postalCode) return;
    const last = priceMeta.lastSuccessfulAt ? new Date(priceMeta.lastSuccessfulAt).getTime() : 0;
    if (Date.now() - last < 72 * 3600 * 1000) return;
    const connection = (navigator as Navigator & { connection?: { type?: string } }).connection;
    if (!navigator.onLine || (connection?.type && connection.type !== "wifi")) return;
    autoPricesStarted.current = true;
    api
      .refreshPrices()
      .then((result) => {
        setPrices(result.prices);
        setPriceMeta(result.meta);
      })
      .catch(() => {
        autoPricesStarted.current = false;
      });
  }, [ready, api, priceMeta]);

  // Cambios hechos desde otros dispositivos.
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
        if (tables.has("dog_reminders")) api.reminders().then(setReminders).catch(() => undefined);
        if (tables.has("prices")) refreshPrices().catch(() => undefined);
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

  useEffect(() => {
    if (ready) void refreshOverview();
  }, [shopping, ready, refreshOverview]);

  useEffect(() => writeJson(memoryKey, memory), [memory, memoryKey]);

  // Avisos de Serranito: se muestran dentro de la app y como notificación si hay permiso.
  useEffect(() => {
    if (!ready || !reminders.some((reminder) => reminder.enabled)) return;
    function check() {
      const now = new Date();
      const today = todayIso(now);
      for (const reminder of reminders.filter((item) => item.enabled)) {
        const [hours, minutes] = reminder.reminderTime.split(":").map(Number);
        const due = now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes);
        const key = `cesta-dog-reminder-${reminder.id}-${today}`;
        if (!due || readJson(key, null)) continue;
        writeJson(key, "shown");
        setDogAlert((current) => current ?? reminder);
        if ("Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.ready
            .then((registration) =>
              registration.showNotification(`Aviso de ${petName}`, {
                body: reminder.title,
                icon: `${import.meta.env.BASE_URL}apple-touch-icon.png`,
                tag: `cesta-dog-${reminder.id}-${today}`,
              }),
            )
            .catch(() => {
              try {
                new Notification(`Aviso de ${petName}`, { body: reminder.title, tag: `cesta-dog-${reminder.id}-${today}` });
              } catch {
                // iOS solo permite notificaciones desde el service worker.
              }
            });
        }
      }
    }
    check();
    const interval = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [reminders, ready, petName]);

  // Indica a los demás del hogar que alguien está comprando ahora.
  const pendingInStore = checklist.filter((item) => !item.done).length;
  useEffect(() => {
    if (!ready || view !== "purchase" || stage !== "store") return;
    const ping = () =>
      void api
        .activity(device, deviceName(), `${pendingInStore} ${pendingInStore === 1 ? "producto pendiente" : "productos pendientes"}`)
        .catch(() => undefined);
    ping();
    const interval = window.setInterval(ping, 25_000);
    return () => window.clearInterval(interval);
  }, [ready, view, stage, device, api, pendingInStore]);

  useEffect(() => {
    if (!savedCount) return;
    const timer = window.setTimeout(() => setSavedCount(0), 2600);
    return () => window.clearTimeout(timer);
  }, [savedCount]);

  // ---- Derivados ----
  const stock = useMemo(() => products.map(toStock), [products]);
  const needs = useMemo(() => stock.filter((item) => item.quantity < item.minimum), [stock]);
  const stockUnits = useMemo(() => stock.reduce((sum, item) => sum + item.quantity, 0), [stock]);
  const preparing = shopping.filter((item) => !item.done).length;
  const storeUnits = checklist.reduce((sum, item) => sum + item.quantity, 0);
  const completedUnits = checklist.filter((item) => item.done).reduce((sum, item) => sum + item.quantity, 0);
  const groupedShopping = useMemo(() => groupByCategory(shopping), [shopping]);
  const groupedChecklist = useMemo(() => groupByCategory(checklist), [checklist]);
  const duplicates = useMemo(() => duplicateCount(shopping), [shopping]);

  // ---- Acciones ----
  const remember = (name: string, category: Category) => setMemory((current) => ({ ...current, [normalize(name)]: category }));

  function addNamed(name: string) {
    if (!name.trim()) return;
    setShopping((items) => addToShopping(items, name, stock, memory));
    setNewName("");
    inputRef.current?.focus();
  }

  function generateChecklist() {
    if (!shopping.length) {
      setStage("store");
      setView("purchase");
      return;
    }
    void api.startPurchase(shopping.map(({ name, quantity }) => ({ name, quantity }))).catch(() => undefined);
    setChecklist((items) => moveToChecklist(shopping, items));
    setShopping([]);
    setStage("store");
    setView("purchase");
  }

  async function storePurchased() {
    const bought = checklist.filter((item) => item.done);
    if (!bought.length) return;
    try {
      const result = await api.storePurchased(bought);
      setMemory((current) => {
        const next = { ...current };
        for (const item of bought) next[normalize(item.name)] = item.category;
        return next;
      });
      const ids = new Set(bought.map((item) => item.id));
      setChecklist((items) => items.filter((item) => !ids.has(item.id)));
      setSavedCount(bought.length);
      setProducts(result.products);
      void refreshOverview();
      api.insights().then(setPredictions).catch(() => undefined);
      const perishable = result.stored.filter((item) => PERISHABLE.includes(item.category));
      if (perishable.length) setExpiryItems(perishable.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity })));
    } catch (error) {
      toast.show(errorMessage(error, "No se ha podido guardar en el almacén. Inténtalo de nuevo."));
    }
  }

  /** Toques rápidos en +/−: se parte siempre del último valor y se guardan en orden. */
  async function updateStock(id: string, change: (item: StockLike) => StockLike) {
    const product = productsRef.current.find((item) => item.id === id);
    if (!product) return;
    const next = change(toStock(product));
    productsRef.current = productsRef.current.map((item) =>
      item.id === id ? { ...item, currentStock: next.quantity, minimumStock: next.minimum } : item,
    );
    setProducts(productsRef.current);
    const previous = writes.current.get(id) ?? Promise.resolve();
    const write = previous.then(() => api.updateProduct(id, { currentStock: next.quantity, minimumStock: next.minimum }));
    writes.current.set(id, write.catch(() => undefined));
    try {
      await write;
      void refreshOverview();
    } catch (error) {
      toast.show(errorMessage(error, "No se ha podido guardar el cambio."));
      void refreshProducts();
    }
  }

  async function changeStockCategory(item: StockLike, category: Category) {
    setProducts((items) => items.map((product) => (product.id === item.id ? { ...product, category } : product)));
    setShopping((items) => items.map((entry) => (normalize(entry.name) === normalize(item.name) ? { ...entry, category } : entry)));
    remember(item.name, category);
    await api.updateProduct(item.id, { category }).catch((error) => toast.show(errorMessage(error, "No se ha podido cambiar la categoría.")));
  }

  async function removeStock(item: StockLike): Promise<boolean> {
    try {
      await api.deleteProduct(item.id);
      setProducts((items) => items.filter((product) => product.id !== item.id));
      return true;
    } catch {
      return false;
    }
  }

  async function addStockProduct(name: string, category: Category): Promise<{ ok: boolean; error?: string }> {
    try {
      const product = await api.createProduct({ name, category });
      setProducts((items) => [...items, product].sort((a, b) => a.name.localeCompare(b.name, "es")));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Comprueba la conexión e inténtalo de nuevo.") };
    }
  }

  function addNeedsToChecklist() {
    setChecklist((items) => addNeeds(items, needs));
    setStage("store");
    setView("purchase");
    setNeedsNotice(false);
  }

  function addMissingIngredients(names: string[]) {
    setChecklist((items) => addNamesToChecklist(items, names, stock, memory));
    setStage("store");
    setView("purchase");
    toast.show(`${names.length} ${names.length === 1 ? "ingrediente añadido" : "ingredientes añadidos"} a En tienda.`);
  }

  async function clearChecklist() {
    const previous = checklist;
    setChecklist([]);
    toast.show("Lista vaciada.", {
      label: "Deshacer",
      onClick: () => setChecklist((items) => mergeByName(previous, items)),
    });
  }

  function acceptSuggestions(selected: Overview["suggestions"]) {
    if (!selected.length) return;
    setShopping((items) => addSuggestions(items, selected, stock));
    setStage("prepare");
    setView("purchase");
  }

  async function useScanned(product: BarcodeProduct) {
    const target = scanner;
    setScanner(null);
    if (target === "shopping") return addNamed(product.name);
    if (target === "checklist") {
      setChecklist((items) => addNamesToChecklist(items, [product.name], stock, memory));
      return;
    }
    if (target === "stock") {
      const existing = stock.find((item) => normalize(item.name) === normalize(product.name));
      if (existing) await updateStock(existing.id, (item) => ({ ...item, quantity: item.quantity + 1 }));
      else {
        const result = await addStockProduct(product.name, guessCategory(product.name, memory));
        if (result.ok) {
          const created = (await api.products()).find((item) => normalize(item.name) === normalize(product.name));
          if (created) await updateStock(created.id, (item) => ({ ...item, quantity: 1 }));
        } else toast.show(result.error ?? "No se ha podido añadir.");
      }
    }
  }

  async function runAndRefresh(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch (error) {
      toast.show(errorMessage(error, failure));
    }
    await refreshProducts();
  }

  async function undo() {
    try {
      const summary = await api.undo();
      if (summary) toast.show(`Deshecho: ${summary}.`);
    } catch (error) {
      toast.show(errorMessage(error, "No se ha podido deshacer."));
    }
    await refreshProducts();
    window.dispatchEvent(new Event("cesta-inventory-refresh"));
  }

  // ---- Deslizar para actualizar ----
  function onTouchStart(event: TouchEvent) {
    if (window.scrollY <= 0 && !menuOpen && !scanner) setPullStart(event.touches[0]?.clientY ?? null);
  }
  function onTouchMove(event: TouchEvent) {
    if (pullStart === null || window.scrollY > 0) return;
    setPull(Math.min(88, Math.max(0, ((event.touches[0]?.clientY ?? pullStart) - pullStart) * 0.55)));
  }
  async function onTouchEnd() {
    setPullStart(null);
    if (pull >= 58) {
      setPull(88);
      await Promise.all([pullLists(), refreshProducts(), refreshPrices().catch(() => undefined)]);
      api.reminders().then(setReminders).catch(() => undefined);
      window.dispatchEvent(new Event("cesta-inventory-refresh"));
    }
    setPull(0);
  }

  const otherShoppers = overview?.activity.filter((item) => item.deviceId !== device) ?? [];
  const sectionTitle =
    view === "stock" ? "Necesidades" : view === "dog" ? "Mascota" : view === "tickets" ? "Tickets" : view === "recipes" ? "Recetas" : null;

  return (
    <main className="min-h-[100dvh] bg-background text-foreground" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => void onTouchEnd()}>
      {splash && (
        <div
          className={`fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-[#f6f8f3] transition-opacity duration-300 dark:bg-background ${splashFading ? "opacity-0" : "opacity-100"}`}
          aria-label="Iniciando Cesta"
        >
          <div className="flex size-[76px] items-center justify-center rounded-[24px] bg-primary text-primary-foreground shadow-[0_18px_44px_rgba(41,91,63,.22)]">
            <ShoppingBasket className="size-8" strokeWidth={1.8} />
          </div>
          <p className="mt-4 text-[17px] font-bold tracking-[-0.02em] text-[#1f2d23] dark:text-foreground">Cesta</p>
          <p className="absolute bottom-[calc(1.4rem+env(safe-area-inset-bottom))] text-[7px] font-semibold uppercase tracking-[0.18em] text-[#7f8a81]">
            Powered by AR
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={!ready}
        aria-label="Abrir menú"
        className="fixed left-4 top-[calc(.8rem+env(safe-area-inset-top))] z-20 flex size-10 items-center justify-center rounded-xl border border-border bg-card/95 text-primary shadow-[0_8px_24px_rgba(32,47,38,.08)] backdrop-blur disabled:opacity-50"
      >
        <MenuIcon />
      </button>
      {sectionTitle && (
        <div className="fixed left-[4.1rem] top-[calc(.8rem+env(safe-area-inset-top))] z-20 flex h-10 items-center rounded-xl border border-border bg-card/92 px-3 text-[10px] font-bold text-primary shadow-[0_8px_24px_rgba(32,47,38,.06)] backdrop-blur">
          {view === "dog" ? petName : sectionTitle}
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto flex max-w-[470px] items-end justify-center overflow-hidden text-primary transition-[height]"
        style={{ height: `${pull}px` }}
      >
        <div className="mb-2 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold shadow-lg">
          <LoaderCircle className={`size-3.5 ${pull >= 58 ? "animate-spin" : ""}`} />
          {pull >= 58 ? "Suelta para actualizar" : "Desliza para actualizar"}
        </div>
      </div>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-2.5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(3.8rem+env(safe-area-inset-top))] sm:px-3">
        {needsNotice && ready && needs.length > 0 && (view === "purchase" || view === "stock") && (
          <aside
            className="mb-5 flex items-start gap-3 rounded-[20px] border border-[#d8e5d9] bg-[#eaf3eb] p-3.5 text-[#20462f] shadow-[0_10px_30px_rgba(41,91,63,.08)] dark:border-border dark:bg-secondary dark:text-secondary-foreground"
            aria-label="Aviso de reposición"
          >
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bell className="size-4" />
            </div>
            <button
              type="button"
              onClick={() => {
                setView("stock");
                setNeedsNotice(false);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-sm font-bold">
                Hay {needs.length} {needs.length === 1 ? "producto" : "productos"} por reponer
              </span>
              <span className="mt-0.5 block text-xs leading-5 opacity-75">Toca para ver lo que falta en casa.</span>
            </button>
            <button
              type="button"
              onClick={() => setNeedsNotice(false)}
              aria-label="Cerrar aviso"
              className="flex size-9 items-center justify-center rounded-lg opacity-60 active:bg-white/60"
            >
              <X className="size-4" />
            </button>
          </aside>
        )}

        {dogAlert && (
          <aside
            className="mb-5 flex items-start gap-3 rounded-[20px] border border-[#ead8d1] bg-[#fbf4f1] p-3.5 text-[#713e2a] shadow-[0_10px_30px_rgba(113,62,42,.08)] dark:border-border dark:bg-card dark:text-foreground"
            aria-label={`Aviso de ${petName}`}
          >
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#a25631] text-white">
              <Bell className="size-4" />
            </div>
            <button
              type="button"
              onClick={() => {
                setView("dog");
                setDogAlert(null);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-sm font-bold">Aviso de {petName}</span>
              <span className="mt-0.5 block text-xs leading-5 opacity-75">{dogAlert.title}</span>
            </button>
            <button
              type="button"
              onClick={() => setDogAlert(null)}
              aria-label="Cerrar aviso"
              className="flex size-9 items-center justify-center rounded-lg opacity-60 active:bg-white/60"
            >
              <X className="size-4" />
            </button>
          </aside>
        )}

        {savedCount > 0 && view === "purchase" && (
          <output className="mb-5 flex items-center gap-3 rounded-[18px] border border-border bg-card p-3.5 text-sm font-semibold shadow-[0_8px_26px_rgba(32,47,38,.06)]">
            <PackageCheck className="size-5 text-primary" /> {savedCount === 1 ? "Producto guardado" : `${savedCount} productos guardados`} en el almacén
            <button type="button" className="ml-auto text-muted-foreground" onClick={() => setSavedCount(0)} aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </output>
        )}

        {view === "home" ? (
          <Home
            data={overview}
            stock={stock}
            needs={needs}
            onModeChange={(mode) => {
              setOverview((current) => current && { ...current, mode });
              void runAndRefresh(() => api.setMode(mode), "No se ha podido cambiar el modo.");
            }}
            onAnswer={(productId, answer) => void runAndRefresh(() => api.answer(productId, answer), "No se ha podido guardar la respuesta.")}
            onOpenExpiring={() => setView("stock")}
            onOpenStock={() => setView("stock")}
            onOpenPurchase={() => {
              setStage("prepare");
              setView("purchase");
            }}
            onUndo={() => void undo()}
          />
        ) : view === "purchase" ? (
          <PurchaseShell
            stage={stage}
            onStageChange={setStage}
            preparingCount={preparing}
            storeCount={storeUnits}
            activity={otherShoppers}
            prepare={
              <Prepare
                items={shopping}
                grouped={groupedShopping}
                name={newName}
                setName={setNewName}
                stock={stock}
                inputRef={inputRef}
                addNamedItem={addNamed}
                updateItem={(id, change) => setShopping((items) => items.map((item) => (item.id === id ? change(item) : item)))}
                changeCategory={(item, category) => {
                  setShopping((items) => items.map((entry) => (entry.id === item.id ? { ...entry, category } : entry)));
                  remember(item.name, category);
                }}
                removeItem={(id) => {
                  const removed = shopping.find((item) => item.id === id);
                  setShopping((items) => items.filter((item) => item.id !== id));
                  if (removed)
                    toast.show(`${removed.name} eliminado.`, {
                      label: "Deshacer",
                      onClick: () => setShopping((items) => mergeByName(items, [removed])),
                    });
                }}
                duplicateCount={duplicates}
                mergeDuplicates={() => setShopping((items) => mergeDuplicates(items))}
                generateChecklist={generateChecklist}
                prices={prices}
                products={products}
                openScanner={() => setScanner("shopping")}
                onAvoided={() => {
                  void api.avoided().catch(() => undefined);
                  setOverview(
                    (current) => current && { ...current, weekly: { ...current.weekly, avoidedPurchases: current.weekly.avoidedPurchases + 1 } },
                  );
                }}
                suggestions={overview?.mode === "autocesta" ? overview.suggestions : []}
                pendingSuggestions={overview?.mode === "autocesta" ? overview.pendingSuggestions : []}
                acceptSuggestions={acceptSuggestions}
                suppressSuggestion={(productId) => void runAndRefresh(() => api.suppress(productId), "No se ha podido guardar.")}
                onPlanned={(productId) => {
                  setProducts((items) =>
                    items.map((item) => (item.id === productId ? { ...item, plannedUntil: todayIso() } : item)),
                  );
                  void runAndRefresh(() => api.planned(productId), "No se ha podido guardar.");
                }}
              />
            }
            store={
              <StoreList
                items={checklist}
                grouped={groupedChecklist}
                completed={completedUnits}
                updateItem={(id, change) => setChecklist((items) => items.map((item) => (item.id === id ? change(item) : item)))}
                removeItem={(id) => {
                  const removed = checklist.find((item) => item.id === id);
                  setChecklist((items) => items.filter((item) => item.id !== id));
                  if (removed)
                    toast.show(`${removed.name} eliminado.`, {
                      label: "Deshacer",
                      onClick: () => setChecklist((items) => mergeByName(items, [removed])),
                    });
                }}
                clearItems={() => void clearChecklist()}
                storePurchased={storePurchased}
                prices={prices}
                stock={stock}
                rejected={rejected}
                openScanner={() => setScanner("checklist")}
                onSubstitution={(requestedName, productId, decision) => {
                  if (decision === "reject") setRejected((items) => [...items, { requestedName, productId }]);
                  void api.substitution(requestedName, productId, decision).catch(() => undefined);
                }}
              />
            }
          />
        ) : view === "tickets" ? (
          <Suspense fallback={<Loading />}>
            <TicketsView api={api} onStockChanged={() => void refreshProducts()} notify={toast.show} />
          </Suspense>
        ) : view === "dog" ? (
          <Suspense fallback={<Loading />}>
            <DogView
              api={api}
              adminUnlocked={admin.unlocked}
              requestMaintenance={admin.request}
              lockAdmin={admin.lock}
              onRemindersChange={setReminders}
              onPetNameChange={setPetName}
            />
          </Suspense>
        ) : view === "recipes" ? (
          <Suspense fallback={<Loading />}>
            <RecipesView
              api={api}
              stock={stock}
              onAddMissing={addMissingIngredients}
              onCook={async (title, ingredients, servings) => {
                try {
                  await api.cook(title, ingredients, servings);
                  await refreshProducts();
                  window.dispatchEvent(new Event("cesta-inventory-refresh"));
                  return true;
                } catch {
                  return false;
                }
              }}
            />
          </Suspense>
        ) : view === "inventory-quick" ? (
          <Suspense fallback={<Loading />}>
            <QuickInventory
              api={api}
              onClose={() => setView("home")}
              onCommitted={async () => {
                await refreshProducts();
                window.dispatchEvent(new Event("cesta-inventory-refresh"));
              }}
            />
          </Suspense>
        ) : (
          <Stock
            api={api}
            stock={stock}
            products={products}
            needs={needs}
            stockUnits={stockUnits}
            updateStock={(id, change) => void updateStock(id, change)}
            changeCategory={(item, category) => void changeStockCategory(item, category)}
            removeStock={removeStock}
            addStockProduct={addStockProduct}
            addNeedsToChecklist={addNeedsToChecklist}
            admin={admin}
            predictions={predictions}
            certainty={overview?.certainty ?? []}
            openScanner={() => setScanner("stock")}
            notify={toast.show}
          />
        )}

        {admin.requested && !admin.unlocked && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 px-4 py-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm">
            <div className="mx-auto max-w-[470px]">
              <button
                type="button"
                onClick={admin.cancel}
                aria-label="Cerrar acceso administrativo"
                className="ml-auto flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
              >
                <X className="size-4" />
              </button>
              <AdminAccess admin={admin} account={account} />
            </div>
          </div>
        )}

        {menuOpen && (
          <Menu
            api={api}
            account={account}
            version={APP_VERSION}
            priceMeta={priceMeta}
            onOpenRecipes={() => {
              setView("recipes");
              setMenuOpen(false);
            }}
            onOpenQuickInventory={() => {
              setView("inventory-quick");
              setMenuOpen(false);
            }}
            onRefreshPrices={async () => {
              const result = await api.refreshPrices();
              setPrices(result.prices);
              setPriceMeta(result.meta);
              return result;
            }}
            onPostalCodeChange={(postalCode) => setPriceMeta((meta) => ({ ...meta, postalCode }))}
            onReset={() => window.location.reload()}
            onClose={() => setMenuOpen(false)}
          />
        )}

        {scanner && <BarcodeScanner api={api} onClose={() => setScanner(null)} onUse={(product) => void useScanned(product)} />}
        {expiryItems.length > 0 && (
          <ExpiryDialog
            api={api}
            items={expiryItems}
            onClose={() => {
              setExpiryItems([]);
              window.dispatchEvent(new Event("cesta-inventory-refresh"));
              void refreshOverview();
            }}
          />
        )}

        {view !== "inventory-quick" && (
          <nav
            aria-label="Navegación principal"
            className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[520px] bg-gradient-to-t from-background from-75% to-transparent px-2.5 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-3"
          >
            <div className="grid grid-cols-5 gap-0.5 rounded-[20px] border border-border bg-card/95 p-1 shadow-[0_12px_36px_rgba(32,47,38,.11)] backdrop-blur">
              <NavButton active={view === "home"} onClick={() => setView("home")} icon={<House className="size-4" />} label="Inicio" />
              <NavButton
                active={view === "purchase"}
                onClick={() => setView("purchase")}
                icon={<ShoppingBasket className="size-4" />}
                label="Compra"
                badge={preparing + storeUnits}
              />
              <NavButton
                active={view === "stock"}
                onClick={() => setView("stock")}
                icon={<Archive className="size-4" />}
                label="Necesidades"
                badge={needs.length}
                small
              />
              <NavButton active={view === "dog"} onClick={() => setView("dog")} icon={<Dog className="size-4" />} label={petName} />
              <NavButton active={view === "tickets"} onClick={() => setView("tickets")} icon={<ReceiptText className="size-4" />} label="Tickets" />
            </div>
          </nav>
        )}
      </div>
      <Toast state={toast.state} onDismiss={toast.hide} />
    </main>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge = 0,
  small,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-[15px] font-bold transition-colors ${small ? "text-[9px]" : "text-[10px]"} ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
    >
      {icon}
      <span className="max-w-full truncate px-0.5">{label}</span>
      {badge > 0 && (
        <span
          className={`absolute right-1 top-1 rounded-full px-1 text-[8px] ${active ? "bg-white/18" : "bg-[#e5eee6] text-primary dark:bg-muted"}`}
          aria-label={`${badge} pendientes`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4.5" aria-hidden="true">
      <path d="M4 5h16M4 12h16M4 19h16" />
    </svg>
  );
}

function Loading() {
  return (
    <div className="flex min-h-48 items-center justify-center text-primary" role="status" aria-label="Cargando sección">
      <LoaderCircle className="size-5 animate-spin" />
    </div>
  );
}
