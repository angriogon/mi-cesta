import { lazy } from "react";

// Inicio va en el arranque; el resto de pantallas se descargan al abrirlas (y se precargan en segundo plano).
export const loadPurchase = () => import("../../views/Purchase");
export const loadStock = () => import("../../views/Stock");
export const loadMenu = () => import("../../views/Menu");

export const PurchaseShell = lazy(() => loadPurchase().then((module) => ({ default: module.PurchaseShell })));
export const Prepare = lazy(() => loadPurchase().then((module) => ({ default: module.Prepare })));
export const StoreList = lazy(() => loadPurchase().then((module) => ({ default: module.StoreList })));
export const Stock = lazy(() => loadStock().then((module) => ({ default: module.Stock })));
export const Menu = lazy(() => loadMenu().then((module) => ({ default: module.Menu })));
export const BarcodeScanner = lazy(() =>
  import("../../views/BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })),
);
export const ExpiryDialog = lazy(() =>
  import("../../views/ExpiryDialog").then((module) => ({ default: module.ExpiryDialog })),
);
export const DogView = lazy(() => import("../../views/Dog").then((module) => ({ default: module.DogView })));
export const TicketsView = lazy(() =>
  import("../../views/Tickets").then((module) => ({ default: module.TicketsView })),
);
export const RecipesView = lazy(() =>
  import("../../views/Recipes").then((module) => ({ default: module.RecipesView })),
);
export const QuickInventory = lazy(() =>
  import("../../views/QuickInventory").then((module) => ({ default: module.QuickInventory })),
);

/** Descarga en segundo plano las pantallas de uso diario. */
export const preloadDailyScreens = () => Promise.all([loadPurchase(), loadStock(), loadMenu()]);
