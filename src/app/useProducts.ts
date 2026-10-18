import { startTransition, useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CestaApi } from "../data/api";
import type { Product } from "../data/types";
import type { Category } from "../domain/categories";
import type { StockLike } from "../domain/lists";
import { LOAD_FAILED, reportError } from "../lib/errors";
import { errorMessage } from "./errorMessage";
import { isNetworkError, outboxFor } from "../data/outbox";
import { OFFLINE_SAVED } from "./useOfflineQueue";

export const toStock = (product: Product): StockLike => ({
  id: product.id,
  name: product.name,
  category: product.category,
  quantity: product.currentStock,
  minimum: product.minimumStock,
});

export interface ProductsState {
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  stock: StockLike[];
  /** Productos por debajo de su mínimo. */
  needs: StockLike[];
  stockUnits: number;
  refreshProducts: () => Promise<void>;
  /** Cambia existencias o mínimo. Los toques seguidos parten del último valor y se guardan en orden. */
  updateStock: (id: string, change: (item: StockLike) => StockLike) => Promise<void>;
  setCategory: (id: string, category: Category) => Promise<void>;
  removeProduct: (id: string) => Promise<boolean>;
  createProduct: (name: string, category: Category) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Catálogo y existencias del hogar (la Despensa).
 * `onChanged` se llama cuando cambian las existencias, para recalcular lo que depende de ellas (el resumen de Inicio).
 */
export function useProducts(api: CestaApi, onChanged: () => void): ProductsState {
  const [products, setProducts] = useState<Product[]>([]);
  const productsRef = useRef(products);
  productsRef.current = products;
  const writes = useRef(new Map<string, Promise<unknown>>());
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const refreshProducts = useCallback(async () => {
    try {
      const next = await api.products();
      startTransition(() => setProducts(next));
    } catch (error) {
      // Se reintenta en el siguiente refresco.
      reportError(error, "cargar productos", LOAD_FAILED);
    }
    changed.current();
  }, [api]);

  const updateStock = useCallback(
    async (id: string, change: (item: StockLike) => StockLike) => {
      const product = productsRef.current.find((item) => item.id === id);
      if (!product) return;
      const next = change(toStock(product));
      productsRef.current = productsRef.current.map((item) =>
        item.id === id ? { ...item, currentStock: next.quantity, minimumStock: next.minimum } : item,
      );
      setProducts(productsRef.current);
      const previous = writes.current.get(id) ?? Promise.resolve();
      const write = previous.then(() =>
        api.updateProduct(id, { currentStock: next.quantity, minimumStock: next.minimum }),
      );
      // La cadena sigue aunque falle una escritura; el error se avisa justo debajo.
      writes.current.set(
        id,
        write.catch(() => undefined),
      );
      try {
        await write;
        changed.current();
      } catch (error) {
        if (isNetworkError(error)) {
          await outboxFor(api.db.householdId).enqueue({
            kind: "stock",
            productId: id,
            currentStock: next.quantity,
            minimumStock: next.minimum,
          });
          reportError(error, "guardar existencias", OFFLINE_SAVED);
          return;
        }
        reportError(error, "guardar existencias", errorMessage(error, "No se ha podido guardar el cambio."));
        void refreshProducts();
      }
    },
    [api, refreshProducts],
  );

  const setCategory = useCallback(
    async (id: string, category: Category) => {
      setProducts((items) => items.map((product) => (product.id === id ? { ...product, category } : product)));
      await api
        .updateProduct(id, { category })
        .catch((error: unknown) =>
          reportError(error, "cambiar categoría", errorMessage(error, "No se ha podido cambiar la categoría.")),
        );
    },
    [api],
  );

  const removeProduct = useCallback(
    async (id: string) => {
      try {
        await api.deleteProduct(id);
        setProducts((items) => items.filter((product) => product.id !== id));
        return true;
      } catch (error) {
        reportError(error, "borrar producto");
        return false;
      }
    },
    [api],
  );

  const createProduct = useCallback(
    async (name: string, category: Category) => {
      try {
        const product = await api.createProduct({ name, category });
        setProducts((items) => [...items, product].sort((a, b) => a.name.localeCompare(b.name, "es")));
        return { ok: true };
      } catch (error) {
        reportError(error, "crear producto");
        return { ok: false, error: errorMessage(error, "Comprueba la conexión e inténtalo de nuevo.") };
      }
    },
    [api],
  );

  const stock = useMemo(() => products.map(toStock), [products]);
  const needs = useMemo(() => stock.filter((item) => item.quantity < item.minimum), [stock]);
  const stockUnits = useMemo(() => stock.reduce((sum, item) => sum + item.quantity, 0), [stock]);

  return {
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
  };
}
