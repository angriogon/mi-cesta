import { X } from "lucide-react";
import { Suspense, useState } from "react";
import { needsStarter } from "../../domain/starter";
import { readText, writeText } from "../../lib/storage";
import { StarterCard } from "../../views/home/StarterCard";
import { reportError } from "../../lib/errors";
import { AdminAccess } from "../../views/AdminAccess";
import { Home } from "../../views/Home";
import { Loading } from "../chrome/Chrome";
import { APP_VERSION } from "../config";
import { useCesta } from "../CestaContext";
import { inventoryChanged } from "../events";
import { BarcodeScanner, DogView, ExpiryDialog, Menu, QuickInventory, RecipesView, Stock, TicketsView } from "./lazy";
import { PurchaseScreen } from "./PurchaseScreen";

const STARTER_DISMISSED = "cesta-starter-dismissed";

function HomeScreen() {
  const store = useCesta();
  const { api } = store;
  const [starterDismissed, setStarterDismissed] = useState(() => readText(STARTER_DISMISSED) === "1");
  const showStarter = store.ready && !starterDismissed && needsStarter(store.products);
  return (
    <Home
      data={store.overview}
      intro={
        showStarter && (
          <StarterCard
            products={store.products}
            onDismiss={() => {
              writeText(STARTER_DISMISSED, "1");
              setStarterDismissed(true);
            }}
            onSave={(choices) =>
              store.runAndRefresh(() => api.setStarterMinimums(choices), "No se han podido guardar los básicos.")
            }
          />
        )
      }
      stock={store.stock}
      needs={store.needs}
      onModeChange={(mode) => {
        store.setOverview((current) => current && { ...current, mode });
        void store.runAndRefresh(() => api.setMode(mode), "No se ha podido cambiar el modo.");
      }}
      onAnswer={(productId, answer) =>
        void store.runAndRefresh(() => api.answer(productId, answer), "No se ha podido guardar la respuesta.")
      }
      onOpenExpiring={() => store.setView("stock")}
      onOpenStock={() => store.setView("stock")}
      onOpenPurchase={() => store.openPurchase("prepare")}
      onUndo={() => void store.undo()}
    />
  );
}

function StockScreen() {
  const store = useCesta();
  return (
    <Stock
      api={store.api}
      stock={store.stock}
      products={store.products}
      needs={store.needs}
      stockUnits={store.stockUnits}
      updateStock={(id, change) => void store.updateStock(id, change)}
      changeCategory={(item, category) => void store.changeStockCategory(item, category)}
      removeStock={(item) => store.removeProduct(item.id)}
      addStockProduct={store.createProduct}
      addNeedsToChecklist={store.addNeedsToChecklist}
      admin={store.admin}
      predictions={store.predictions}
      certainty={store.overview?.certainty ?? []}
      openScanner={() => store.setScanner("stock")}
      notify={store.toast.show}
    />
  );
}

function RecipesScreen() {
  const store = useCesta();
  return (
    <RecipesView
      api={store.api}
      stock={store.stock}
      onAddMissing={store.addMissingIngredients}
      onCook={async (title, ingredients, servings) => {
        try {
          await store.api.cook(title, ingredients, servings);
          await store.refreshProducts();
          inventoryChanged.emit();
          return true;
        } catch (error) {
          reportError(error, "cocinar receta");
          return false;
        }
      }}
    />
  );
}

/** La pantalla de la pestaña o sección abierta. */
export function CurrentScreen() {
  const store = useCesta();
  if (store.view === "home") return <HomeScreen />;
  return (
    <Suspense fallback={<Loading />}>
      {store.view === "purchase" ? (
        <PurchaseScreen />
      ) : store.view === "tickets" ? (
        <TicketsView
          api={store.api}
          prices={store.prices}
          onStockChanged={() => void store.refreshProducts()}
          notify={store.toast.show}
        />
      ) : store.view === "dog" ? (
        <DogView
          pet={store.pet}
          adminUnlocked={store.admin.can("mascota")}
          requestMaintenance={() => store.admin.request("mascota")}
          lockAdmin={store.admin.lock}
          pushHouseholdId={store.account.mode === "supabase" ? store.api.db.householdId : null}
        />
      ) : store.view === "recipes" ? (
        <RecipesScreen />
      ) : store.view === "inventory-quick" ? (
        <QuickInventory
          api={store.api}
          onClose={() => store.setView("home")}
          onCommitted={async () => {
            await store.refreshProducts();
            inventoryChanged.emit();
          }}
        />
      ) : (
        <StockScreen />
      )}
    </Suspense>
  );
}

/** Lo que se abre por encima: acceso de administrador, menú, escáner y caducidades. */
export function Overlays() {
  const store = useCesta();
  const { api, admin } = store;
  return (
    <>
      {admin.requested && !admin.can(admin.requested) && (
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
            <AdminAccess admin={admin} account={store.account} />
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        {store.menuOpen && (
          <Menu
            api={api}
            account={store.account}
            version={APP_VERSION}
            priceMeta={store.priceMeta}
            onOpenRecipes={() => {
              store.setView("recipes");
              store.setMenuOpen(false);
            }}
            onOpenQuickInventory={() => {
              store.setView("inventory-quick");
              store.setMenuOpen(false);
            }}
            onRefreshPrices={async () => {
              const result = await api.refreshPrices();
              store.setPrices(result.prices);
              store.setPriceMeta(result.meta);
              return result;
            }}
            onPriceMetaChange={store.setPriceMeta}
            onReset={() => window.location.reload()}
            onClose={() => store.setMenuOpen(false)}
          />
        )}
        {store.scanner && (
          <BarcodeScanner
            api={api}
            onClose={() => store.setScanner(null)}
            onUse={(product) => void store.addScannedProduct(product)}
          />
        )}
        {store.expiryItems.length > 0 && (
          <ExpiryDialog
            api={api}
            items={store.expiryItems}
            onClose={() => {
              store.setExpiryItems([]);
              inventoryChanged.emit();
              void store.refreshOverview();
            }}
          />
        )}
      </Suspense>
    </>
  );
}
