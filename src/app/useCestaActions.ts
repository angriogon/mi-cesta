import type { BarcodeProduct } from "../data/types";
import type { Overview } from "../domain/autocesta";
import { guessCategory, PERISHABLE, type Category } from "../domain/categories";
import {
  addNamesToChecklist,
  addNeeds,
  addSuggestions,
  addToShopping,
  mergeByName,
  moveToChecklist,
  type StockLike,
} from "../domain/lists";
import { LOAD_FAILED, notifyError, SAVE_FAILED } from "../lib/errors";
import { normalize } from "../lib/text";
import { errorMessage } from "./errorMessage";
import { inventoryChanged } from "./events";
import type { CestaCore } from "./useCestaCore";

/** Lo que el usuario hace en la app y que toca varios dominios a la vez (listas, despensa, navegación). */
export function useCestaActions(core: CestaCore) {
  const { api, toast, stock, memory, setShopping, setChecklist, setStage, setView } = core;

  const remember = (name: string, category: Category) =>
    core.setMemory((current) => ({ ...current, [normalize(name)]: category }));

  const openPurchase = (stage: "prepare" | "store") => {
    setStage(stage);
    setView("purchase");
  };

  function addNamed(name: string) {
    if (!name.trim()) return;
    setShopping((items) => addToShopping(items, name, stock, memory));
    core.setNewName("");
    core.inputRef.current?.focus();
  }

  function generateChecklist() {
    if (core.shopping.length) {
      void api
        .startPurchase(core.shopping.map(({ name, quantity }) => ({ name, quantity })))
        .catch(notifyError("iniciar compra", SAVE_FAILED));
      setChecklist((items) => moveToChecklist(core.shopping, items));
      setShopping([]);
    }
    openPurchase("store");
  }

  async function storePurchased() {
    const bought = core.checklist.filter((item) => item.done);
    if (!bought.length) return;
    try {
      const result = await api.storePurchased(bought);
      core.setMemory((current) => {
        const next = { ...current };
        for (const item of bought) next[normalize(item.name)] = item.category;
        return next;
      });
      const ids = new Set(bought.map((item) => item.id));
      setChecklist((items) => items.filter((item) => !ids.has(item.id)));
      core.setSavedCount(bought.length);
      core.setProducts(result.products);
      void core.refreshOverview();
      api.insights().then(core.setPredictions).catch(notifyError("cargar previsiones", LOAD_FAILED));
      const perishable = result.stored.filter((item) => PERISHABLE.includes(item.category));
      if (perishable.length)
        core.setExpiryItems(
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
    await core.setCategory(item.id, category);
  }

  function addNeedsToChecklist() {
    setChecklist((items) => addNeeds(items, core.needs));
    openPurchase("store");
    core.setNeedsNotice(false);
  }

  function addMissingIngredients(names: string[]) {
    setChecklist((items) => addNamesToChecklist(items, names, stock, memory));
    openPurchase("store");
    toast.show(`${names.length} ${names.length === 1 ? "ingrediente añadido" : "ingredientes añadidos"} a En tienda.`);
  }

  function clearChecklist() {
    const previous = core.checklist;
    setChecklist([]);
    toast.show("Lista vaciada.", {
      label: "Deshacer",
      onClick: () => setChecklist((items) => mergeByName(previous, items)),
    });
  }

  function acceptSuggestions(selected: Overview["suggestions"]) {
    if (!selected.length) return;
    setShopping((items) => addSuggestions(items, selected, stock));
    openPurchase("prepare");
  }

  async function addScannedProduct(product: BarcodeProduct) {
    const target = core.scanner;
    core.setScanner(null);
    if (target === "shopping") return addNamed(product.name);
    if (target === "checklist") {
      setChecklist((items) => addNamesToChecklist(items, [product.name], stock, memory));
      return;
    }
    if (target !== "stock") return;
    const existing = stock.find((item) => normalize(item.name) === normalize(product.name));
    if (existing) return core.updateStock(existing.id, (item) => ({ ...item, quantity: item.quantity + 1 }));
    const result = await core.createProduct(product.name, guessCategory(product.name, memory));
    if (!result.ok) return toast.show(result.error ?? "No se ha podido añadir.");
    const created = (await api.products()).find((item) => normalize(item.name) === normalize(product.name));
    if (created) await core.updateStock(created.id, (item) => ({ ...item, quantity: 1 }));
  }

  async function runAndRefresh(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
    } catch (error) {
      toast.show(errorMessage(error, failure));
    }
    await core.refreshProducts();
  }

  async function undo() {
    try {
      const summary = await api.undo();
      if (summary) toast.show(`Deshecho: ${summary}.`);
    } catch (error) {
      toast.show(errorMessage(error, "No se ha podido deshacer."));
    }
    await core.refreshProducts();
    inventoryChanged.emit();
  }

  /** Deslizar para actualizar: listas, despensa, precios y mascota. */
  async function refreshAll() {
    await Promise.all([
      core.pullLists(),
      core.refreshProducts(),
      core.refreshPrices().catch(notifyError("cargar precios", LOAD_FAILED)),
    ]);
    void core.pet.reload();
    inventoryChanged.emit();
  }

  return {
    remember,
    openPurchase,
    addNamed,
    generateChecklist,
    storePurchased,
    changeStockCategory,
    addNeedsToChecklist,
    addMissingIngredients,
    clearChecklist,
    acceptSuggestions,
    addScannedProduct,
    runAndRefresh,
    undo,
    refreshAll,
  };
}
