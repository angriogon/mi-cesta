import { mergeByName, mergeDuplicates } from "../../domain/lists";
import { notifyError, SAVE_FAILED } from "../../lib/errors";
import { todayIso } from "../../lib/text";
import { useCesta } from "../CestaContext";
import { Prepare, PurchaseShell, StoreList } from "./lazy";

/** Compra: «Preparar» (lo que hace falta) y «En tienda» (lo que se va cogiendo). */
export function PurchaseScreen() {
  const store = useCesta();
  const { api, toast, overview, setShopping, setChecklist } = store;
  const autocesta = overview?.mode === "autocesta";
  return (
    <PurchaseShell
      stage={store.stage}
      onStageChange={store.setStage}
      preparingCount={store.preparing}
      storeCount={store.storeUnits}
      activity={store.otherShoppers}
      prepare={
        <Prepare
          items={store.shopping}
          grouped={store.groupedShopping}
          name={store.newName}
          setName={store.setNewName}
          stock={store.stock}
          inputRef={store.inputRef}
          addNamedItem={store.addNamed}
          updateItem={(id, change) =>
            setShopping((items) => items.map((item) => (item.id === id ? change(item) : item)))
          }
          changeCategory={(item, category) => {
            setShopping((items) => items.map((entry) => (entry.id === item.id ? { ...entry, category } : entry)));
            store.remember(item.name, category);
          }}
          removeItem={(id) => {
            const removed = store.shopping.find((item) => item.id === id);
            setShopping((items) => items.filter((item) => item.id !== id));
            if (removed)
              toast.show(`${removed.name} eliminado.`, {
                label: "Deshacer",
                onClick: () => setShopping((items) => mergeByName(items, [removed])),
              });
          }}
          duplicateCount={store.duplicates}
          mergeDuplicates={() => setShopping((items) => mergeDuplicates(items))}
          generateChecklist={store.generateChecklist}
          prices={store.prices}
          products={store.products}
          openScanner={() => store.setScanner("shopping")}
          onAvoided={() => {
            void api.avoided().catch(notifyError("registrar compra evitada", SAVE_FAILED));
            store.setOverview(
              (current) =>
                current && {
                  ...current,
                  weekly: { ...current.weekly, avoidedPurchases: current.weekly.avoidedPurchases + 1 },
                },
            );
          }}
          suggestions={autocesta ? overview.suggestions : []}
          pendingSuggestions={autocesta ? overview.pendingSuggestions : []}
          acceptSuggestions={store.acceptSuggestions}
          suppressSuggestion={(productId) =>
            void store.runAndRefresh(() => api.suppress(productId), "No se ha podido guardar.")
          }
          onPlanned={(productId) => {
            store.setProducts((items) =>
              items.map((item) => (item.id === productId ? { ...item, plannedUntil: todayIso() } : item)),
            );
            void store.runAndRefresh(() => api.planned(productId), "No se ha podido guardar.");
          }}
        />
      }
      store={
        <StoreList
          items={store.checklist}
          grouped={store.groupedChecklist}
          completed={store.completedUnits}
          updateItem={(id, change) =>
            setChecklist((items) => items.map((item) => (item.id === id ? change(item) : item)))
          }
          removeItem={(id) => {
            const removed = store.checklist.find((item) => item.id === id);
            setChecklist((items) => items.filter((item) => item.id !== id));
            if (removed)
              toast.show(`${removed.name} eliminado.`, {
                label: "Deshacer",
                onClick: () => setChecklist((items) => mergeByName(items, [removed])),
              });
          }}
          clearItems={store.clearChecklist}
          storePurchased={store.storePurchased}
          prices={store.prices}
          stock={store.stock}
          rejected={store.rejected}
          openScanner={() => store.setScanner("checklist")}
          onSubstitution={(requestedName, productId, decision) => {
            if (decision === "reject") store.setRejected((items) => [...items, { requestedName, productId }]);
            void api
              .substitution(requestedName, productId, decision)
              .catch(notifyError("guardar sustitución", SAVE_FAILED));
          }}
        />
      }
    />
  );
}
