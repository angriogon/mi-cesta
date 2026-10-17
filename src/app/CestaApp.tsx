import { Archive, Bell, Dog, House, LoaderCircle, PackageCheck, ReceiptText, ShoppingBasket, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import type { CestaApi } from "../data/api";
import type { DogReminder, PriceMeta, PriceRef } from "../data/types";
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
import { inventoryChanged } from "./events";
import { errorMessage } from "./errorMessage";
import { useLists } from "./useLists";
import { usePet } from "./usePet";
import { useProducts } from "./useProducts";
import { AdminAccess, useAdmin } from "../views/AdminAccess";
import { BarcodeScanner } from "../views/BarcodeScanner";
import { ExpiryDialog, type ExpiryItem } from "../views/ExpiryDialog";
import { Home } from "../views/Home";
import { Menu } from "../views/Menu";
import { Prepare, PurchaseShell, StoreList } from "../views/Purchase";
import { Stock } from "../views/Stock";
import { Toast, useToast } from "../ui/Toast";
import { LOAD_FAILED, SAVE_FAILED, logError, notifyError, reportError, setErrorNotifier } from "../lib/errors";

const DogView = lazy(() => import("../views/Dog").then((module) => ({ default: module.DogView })));
const TicketsView = lazy(() => import("../views/Tickets").then((module) => ({ default: module.TicketsView })));
const RecipesView = lazy(() => import("../views/Recipes").then((module) => ({ default: module.RecipesView })));
const QuickInventory = lazy(() =>
  import("../views/QuickInventory").then((module) => ({ default: module.QuickInventory })),
);

export type View = "home" | "purchase" | "stock" | "dog" | "tickets" | "recipes" | "inventory-quick";
type ScannerTarget = "shopping" | "checklist" | "stock";

export function CestaApp({ api, account }: { api: CestaApi; account: Account }) {
  const householdId = api.db.householdId;
  const memoryKey = `cesta-category-memory-v1:${householdId}`;
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<"prepare" | "store">("prepare");
  const [memory, setMemory] = useState<Record<string, string>>(() => readJson(memoryKey, {}));
  const [newName, setNewName] = useState("");
  const [ready, setReady] = useState(false);
  const { shopping, checklist, setShopping, setChecklist, pullLists, shoppingRef } = useLists(api, ready);
  const pet = usePet(api, ready);
  const { reminders, petName } = pet;
  const [splash, setSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [needsNotice, setNeedsNotice] = useState(true);
  const [savedCount, setSavedCount] = useState(0);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pull, setPull] = useState(0);
  const [dogAlert, setDogAlert] = useState<DogReminder | null>(null);
  const [prices, setPrices] = useState<PriceRef[]>([]);
  const [priceMeta, setPriceMeta] = useState<PriceMeta>({
    postalCode: "",
    lastAttemptedAt: null,
    lastSuccessfulAt: null,
    updatedCount: 0,
  });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scanner, setScanner] = useState<ScannerTarget | null>(null);
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rejected, setRejected] = useState<{ requestedName: string; productId: string }[]>([]);
  const admin = useAdmin(householdId);
  const toast = useToast();
  const showToast = toast.show;
  useEffect(() => setErrorNotifier((message) => showToast(message)), [showToast]);
  const inputRef = useRef<HTMLInputElement>(null);
  const device = useMemo(() => deviceId(), []);

  // ---- Carga de datos ----
  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api.overview(shoppingRef.current));
    } catch (error) {
      // Se reintenta en el siguiente refresco.
      reportError(error, "cargar resumen", LOAD_FAILED);
    }
  }, [api, shoppingRef]);

  const {
    products,
    setProducts,
    stock,
    needs,
    stockUnits,
    refreshProducts,
    updateStock,
    setCategory,
    removeProduct,
    createProduct,
  } = useProducts(api, () => void refreshOverview());

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
    const fadeTimer = window.setTimeout(
      () => {
        setSplashFading(true);
        window.setTimeout(() => setSplash(false), 220);
      },
      ready ? 0 : 1400,
    );
    return () => window.clearTimeout(fadeTimer);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      refreshPrices().catch(notifyError("cargar precios", LOAD_FAILED));
      api.insights().then(setPredictions).catch(notifyError("cargar previsiones", LOAD_FAILED));
      api.rejectedSubstitutions().then(setRejected).catch(notifyError("cargar sustituciones", LOAD_FAILED));
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
                new Notification(`Aviso de ${petName}`, {
                  body: reminder.title,
                  tag: `cesta-dog-${reminder.id}-${today}`,
                });
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
        .activity(
          device,
          deviceName(),
          `${pendingInStore} ${pendingInStore === 1 ? "producto pendiente" : "productos pendientes"}`,
        )
        .catch(logError("presencia en tienda"));
    ping();
    const interval = window.setInterval(ping, 25_000);
    return () => window.clearInterval(interval);
  }, [ready, view, stage, device, api, pendingInStore]);

  // El aviso de «guardado» empieza a contar cuando se cierra el diálogo de caducidades, para que se llegue a ver.
  const expiryOpen = expiryItems.length > 0;
  useEffect(() => {
    if (!savedCount || expiryOpen) return;
    const timer = window.setTimeout(() => setSavedCount(0), 3000);
    return () => window.clearTimeout(timer);
  }, [savedCount, expiryOpen]);

  // ---- Derivados ----
  const preparing = shopping.filter((item) => !item.done).length;
  const storeUnits = checklist.reduce((sum, item) => sum + item.quantity, 0);
  const completedUnits = checklist.filter((item) => item.done).reduce((sum, item) => sum + item.quantity, 0);
  const groupedShopping = useMemo(() => groupByCategory(shopping), [shopping]);
  const groupedChecklist = useMemo(() => groupByCategory(checklist), [checklist]);
  const duplicates = useMemo(() => duplicateCount(shopping), [shopping]);

  // ---- Acciones ----
  const remember = (name: string, category: Category) =>
    setMemory((current) => ({ ...current, [normalize(name)]: category }));

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
    void api
      .startPurchase(shopping.map(({ name, quantity }) => ({ name, quantity })))
      .catch(notifyError("iniciar compra", SAVE_FAILED));
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
      api.insights().then(setPredictions).catch(notifyError("cargar previsiones", LOAD_FAILED));
      const perishable = result.stored.filter((item) => PERISHABLE.includes(item.category));
      if (perishable.length)
        setExpiryItems(
          perishable.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity })),
        );
    } catch (error) {
      toast.show(errorMessage(error, "No se ha podido guardar en el almacén. Inténtalo de nuevo."));
    }
  }

  async function changeStockCategory(item: StockLike, category: Category) {
    setShopping((items) =>
      items.map((entry) => (normalize(entry.name) === normalize(item.name) ? { ...entry, category } : entry)),
    );
    remember(item.name, category);
    await setCategory(item.id, category);
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

  async function addScannedProduct(product: BarcodeProduct) {
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
        const result = await createProduct(product.name, guessCategory(product.name, memory));
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
    inventoryChanged.emit();
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
      await Promise.all([
        pullLists(),
        refreshProducts(),
        refreshPrices().catch(notifyError("cargar precios", LOAD_FAILED)),
      ]);
      void pet.reload();
      inventoryChanged.emit();
    }
    setPull(0);
  }

  const otherShoppers = overview?.activity.filter((item) => item.deviceId !== device) ?? [];
  const sectionTitle =
    view === "stock"
      ? "Necesidades"
      : view === "dog"
        ? "Mascota"
        : view === "tickets"
          ? "Tickets"
          : view === "recipes"
            ? "Recetas"
            : null;

  return (
    <main
      className="min-h-[100dvh] bg-background text-foreground"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
    >
      {splash && (
        <div
          className={`fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-card transition-opacity duration-300 ${splashFading ? "opacity-0" : "opacity-100"}`}
          aria-label="Iniciando Cesta"
        >
          <div className="flex size-[76px] items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBasket className="size-8" strokeWidth={1.8} />
          </div>
          <p className="mt-4 text-[17px] font-semibold text-primary">Cesta</p>
          <p className="absolute bottom-[calc(1.4rem+env(safe-area-inset-bottom))] text-xs font-semibold uppercase text-muted-foreground">
            Powered by AR
          </p>
        </div>
      )}

      {/* Franja opaca detrás de la cabecera: el contenido no se transparenta al desplazarse. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[19] h-[calc(3.6rem+env(safe-area-inset-top))] border-b-[0.5px] border-separator bg-background"
      />
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={!ready}
        aria-label="Abrir menú"
        className="fixed left-2 top-[calc(.7rem+env(safe-area-inset-top))] z-20 flex size-11 items-center justify-center rounded-full text-primary active:opacity-40 disabled:opacity-50"
      >
        <MenuIcon />
      </button>
      {sectionTitle && (
        <div className="pointer-events-none fixed inset-x-16 top-[calc(.7rem+env(safe-area-inset-top))] z-20 flex h-11 items-center justify-center truncate text-[17px] font-semibold text-foreground">
          {view === "dog" ? petName : sectionTitle}
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto flex max-w-[470px] items-end justify-center overflow-hidden text-primary transition-[height]"
        style={{ height: `${pull}px` }}
      >
        <div className="mb-2 flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-float">
          <LoaderCircle className={`size-3.5 ${pull >= 58 ? "animate-spin" : ""}`} />
          {pull >= 58 ? "Suelta para actualizar" : "Desliza para actualizar"}
        </div>
      </div>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-2.5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(3.8rem+env(safe-area-inset-top))] sm:px-3">
        {needsNotice && ready && needs.length > 0 && (view === "purchase" || view === "stock") && (
          <aside
            className="mb-5 flex items-start gap-3 rounded-xl bg-primary-soft p-3.5 text-primary"
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
              <span className="block text-sm font-semibold">
                Hay {needs.length} {needs.length === 1 ? "producto" : "productos"} por reponer
              </span>
              <span className="mt-0.5 block text-xs leading-5 opacity-75">Toca para ver lo que falta en casa.</span>
            </button>
            <button
              type="button"
              onClick={() => setNeedsNotice(false)}
              aria-label="Cerrar aviso"
              className="flex size-9 items-center justify-center rounded-lg opacity-60 active:bg-fill"
            >
              <X className="size-4" />
            </button>
          </aside>
        )}

        {dogAlert && (
          <aside
            className="mb-5 flex items-start gap-3 rounded-xl bg-warning-soft p-3.5 text-danger"
            aria-label={`Aviso de ${petName}`}
          >
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning text-white">
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
              <span className="block text-sm font-semibold">Aviso de {petName}</span>
              <span className="mt-0.5 block text-xs leading-5 opacity-75">{dogAlert.title}</span>
            </button>
            <button
              type="button"
              onClick={() => setDogAlert(null)}
              aria-label="Cerrar aviso"
              className="flex size-9 items-center justify-center rounded-lg opacity-60 active:bg-fill"
            >
              <X className="size-4" />
            </button>
          </aside>
        )}

        {savedCount > 0 && view === "purchase" && (
          <output className="mb-5 flex items-center gap-3 rounded-xl bg-card p-3.5 text-sm font-semibold">
            <PackageCheck className="size-5 text-primary" />{" "}
            {savedCount === 1 ? "Producto guardado" : `${savedCount} productos guardados`} en el almacén
            <button
              type="button"
              className="ml-auto text-muted-foreground"
              onClick={() => setSavedCount(0)}
              aria-label="Cerrar"
            >
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
            onAnswer={(productId, answer) =>
              void runAndRefresh(() => api.answer(productId, answer), "No se ha podido guardar la respuesta.")
            }
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
                updateItem={(id, change) =>
                  setShopping((items) => items.map((item) => (item.id === id ? change(item) : item)))
                }
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
                  void api.avoided().catch(notifyError("registrar compra evitada", SAVE_FAILED));
                  setOverview(
                    (current) =>
                      current && {
                        ...current,
                        weekly: { ...current.weekly, avoidedPurchases: current.weekly.avoidedPurchases + 1 },
                      },
                  );
                }}
                suggestions={overview?.mode === "autocesta" ? overview.suggestions : []}
                pendingSuggestions={overview?.mode === "autocesta" ? overview.pendingSuggestions : []}
                acceptSuggestions={acceptSuggestions}
                suppressSuggestion={(productId) =>
                  void runAndRefresh(() => api.suppress(productId), "No se ha podido guardar.")
                }
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
                updateItem={(id, change) =>
                  setChecklist((items) => items.map((item) => (item.id === id ? change(item) : item)))
                }
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
                  void api
                    .substitution(requestedName, productId, decision)
                    .catch(notifyError("guardar sustitución", SAVE_FAILED));
                }}
              />
            }
          />
        ) : view === "tickets" ? (
          <Suspense fallback={<Loading />}>
            <TicketsView api={api} prices={prices} onStockChanged={() => void refreshProducts()} notify={toast.show} />
          </Suspense>
        ) : view === "dog" ? (
          <Suspense fallback={<Loading />}>
            <DogView
              pet={pet}
              adminUnlocked={admin.unlocked}
              requestMaintenance={admin.request}
              lockAdmin={admin.lock}
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
                  inventoryChanged.emit();
                  return true;
                } catch (error) {
                  reportError(error, "cocinar receta");
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
                inventoryChanged.emit();
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
            removeStock={(item) => removeProduct(item.id)}
            addStockProduct={createProduct}
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
                className="ml-auto flex size-10 items-center justify-center rounded-xl bg-card text-muted-foreground"
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

        {scanner && (
          <BarcodeScanner
            api={api}
            onClose={() => setScanner(null)}
            onUse={(product) => void addScannedProduct(product)}
          />
        )}
        {expiryItems.length > 0 && (
          <ExpiryDialog
            api={api}
            items={expiryItems}
            onClose={() => {
              setExpiryItems([]);
              inventoryChanged.emit();
              void refreshOverview();
            }}
          />
        )}

        {view !== "inventory-quick" && (
          <nav
            aria-label="Navegación principal"
            className="fixed inset-x-0 bottom-0 z-20 border-t-[0.5px] border-separator bg-card pb-[env(safe-area-inset-bottom)]"
          >
            <div className="mx-auto grid h-[3.25rem] w-full max-w-[520px] grid-cols-5">
              <NavButton
                active={view === "home"}
                onClick={() => setView("home")}
                icon={<House className="size-6" strokeWidth={1.8} />}
                label="Inicio"
              />
              <NavButton
                active={view === "purchase"}
                onClick={() => setView("purchase")}
                icon={<ShoppingBasket className="size-6" strokeWidth={1.8} />}
                label="Compra"
                badge={preparing + storeUnits}
              />
              <NavButton
                active={view === "stock"}
                onClick={() => setView("stock")}
                icon={<Archive className="size-6" strokeWidth={1.8} />}
                label="Necesidades"
                badge={needs.length}
              />
              <NavButton
                active={view === "dog"}
                onClick={() => setView("dog")}
                icon={<Dog className="size-6" strokeWidth={1.8} />}
                label={petName}
              />
              <NavButton
                active={view === "tickets"}
                onClick={() => setView("tickets")}
                icon={<ReceiptText className="size-6" strokeWidth={1.8} />}
                label="Tickets"
              />
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 pt-0.5 text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      {icon}
      <span className="max-w-full truncate px-0.5">{label}</span>
      {badge > 0 && (
        <span
          className="absolute left-1/2 top-0.5 ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white tabular-nums"
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-4.5"
      aria-hidden="true"
    >
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
