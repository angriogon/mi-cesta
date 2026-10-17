import { guessCategory } from "../../domain/categories";
import { normalize, uid } from "../../lib/text";
import { lookupOpenFoodFacts } from "../openfoodfacts";
import type {
  BarcodeProduct,
  DogItem,
  DogReminder,
  Household,
  InverseStep,
  Preferences,
  QuickItem,
  QuickSession,
} from "../types";
import { logError } from "../../lib/errors";

import { TicketsApi } from "./tickets";
import { ApiError, now } from "./shared";

/** Inventario rápido, códigos de barras, mascota y ajustes del hogar. */
export class CestaApi extends TicketsApi {
  async quickInventory(): Promise<{
    sessions: QuickSession[];
    recentTicketItems: Omit<QuickItem, "id" | "source" | "confidence">[];
  }> {
    const [sessions, tickets, products] = await Promise.all([
      this.db.list("quick_sessions"),
      this.db.list("tickets"),
      this.db.list("products"),
    ]);
    const recent = new Map<string, Omit<QuickItem, "id" | "source" | "confidence">>();
    for (const ticket of tickets.filter(
      (item) => Date.now() - new Date(`${item.purchasedAt}T12:00:00`).getTime() <= 14 * 864e5,
    )) {
      for (const line of ticket.items) {
        const product = line.productId ? products.find((item) => item.id === line.productId) : null;
        const name = product?.name ?? line.description;
        const key = normalize(name);
        const previous = recent.get(key);
        const quantity = Number.isInteger(line.quantity) ? line.quantity : 1;
        recent.set(key, {
          name,
          quantity: (previous?.quantity ?? 0) + quantity,
          category: product?.category ?? guessCategory(name),
          unit: "unidad",
        });
      }
    }
    return {
      sessions: sessions.filter((session) => !session.committed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      recentTicketItems: [...recent.values()],
    };
  }

  async saveQuickSession(id: string | null, location: string, items: QuickItem[]): Promise<string> {
    const sessionId = id || uid();
    await this.db.insert("quick_sessions", [
      { id: sessionId, householdId: this.db.householdId, location, items, committed: false, updatedAt: now() },
    ]);
    return sessionId;
  }

  /** Incorpora el recuento al almacén: fija las existencias contadas en esa zona. */
  async commitQuickSession(id: string | null, location: string, items: QuickItem[]): Promise<number> {
    const products = await this.db.list("products");
    const inverse: InverseStep[] = [];
    let count = 0;
    for (const item of items) {
      const name = item.name.trim();
      if (name.length < 2 || item.quantity <= 0) continue;
      const product = await this.ensureProduct(products, name, item.category);
      const units = Math.max(1, Math.round(item.quantity));
      await this.changeStock(product, units, "inventory", inverse);
      const lot = await this.addLot({
        productId: product.id,
        productName: product.name,
        quantity: units,
        expiryDate: null,
        state: location === "Congelador" ? "frozen" : "closed",
        location,
      });
      inverse.push({ kind: "deleteLot", lotId: lot.id });
      count += 1;
    }
    if (id) await this.db.remove("quick_sessions", [id]);
    await this.recordOperation("inventory", `Inventario · ${location}`, inverse);
    return count;
  }

  async lookupBarcode(code: string): Promise<BarcodeProduct | null> {
    const clean = code.replace(/\D/g, "").slice(0, 18);
    if (clean.length < 8) throw new ApiError("El código debe tener al menos 8 números.");
    const [saved] = await this.db.listBy("barcodes", "code", clean);
    if (saved) return saved;
    return lookupOpenFoodFacts(clean);
  }

  async saveBarcode(code: string, name: string): Promise<BarcodeProduct> {
    const clean = code.replace(/\D/g, "");
    if (clean.length < 8) throw new ApiError("El código no es válido.");
    if (name.trim().length < 2) throw new ApiError("Escribe el nombre del producto.");
    const product = {
      id: uid(),
      householdId: this.db.householdId,
      code: clean,
      name: name.trim(),
      brand: "",
      quantity: "",
      image: null,
      allergens: [],
      nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      source: "Guardado por tu hogar",
      createdAt: now(),
    };
    const existing = await this.db.listBy("barcodes", "code", clean);
    await this.atomically(async (tx) => {
      await tx.db.remove(
        "barcodes",
        existing.map((item) => item.id),
      );
      await tx.db.insert("barcodes", [product]);
    });
    return product;
  }

  async dogItems(): Promise<{ items: DogItem[]; petName: string }> {
    const [items, household] = await Promise.all([this.db.list("dog_items"), this.db.getHousehold()]);
    return { items: items.sort((a, b) => a.name.localeCompare(b.name, "es")), petName: household.petName };
  }

  async addDogItem(name: string): Promise<DogItem> {
    const clean = name.trim();
    if (clean.length < 2) throw new ApiError("Escribe un nombre de al menos 2 caracteres.");
    const items = await this.db.list("dog_items");
    if (items.some((item) => normalize(item.name) === normalize(clean)))
      throw new ApiError("Ese artículo ya existe.", 409);
    const item: DogItem = {
      id: uid(),
      householdId: this.db.householdId,
      name: clean,
      currentStock: 0,
      minimumStock: 1,
      updatedAt: now(),
    };
    await this.db.insert("dog_items", [item]);
    return item;
  }

  async updateDogItem(item: Pick<DogItem, "id" | "currentStock" | "minimumStock">): Promise<void> {
    await this.db.update("dog_items", item.id, {
      currentStock: Math.max(0, Math.round(item.currentStock)),
      minimumStock: Math.max(0, Math.round(item.minimumStock)),
      updatedAt: now(),
    });
  }

  async deleteDogItem(id: string): Promise<void> {
    await this.db.remove("dog_items", [id]);
  }

  async setPetName(name: string): Promise<string> {
    const clean = name.trim().slice(0, 40);
    if (!clean) throw new ApiError("Escribe un nombre.");
    const household = await this.db.updateHousehold({ petName: clean });
    return household.petName;
  }

  async reminders(): Promise<DogReminder[]> {
    return (await this.db.list("dog_reminders")).sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
  }

  async addReminder(title: string, reminderTime: string): Promise<DogReminder[]> {
    if (!title.trim()) throw new ApiError("Escribe el aviso.");
    if (!/^\d{2}:\d{2}$/.test(reminderTime)) throw new ApiError("La hora no es válida.");
    await this.db.insert("dog_reminders", [
      {
        id: uid(),
        householdId: this.db.householdId,
        title: title.trim().slice(0, 80),
        reminderTime,
        enabled: true,
        createdAt: now(),
      },
    ]);
    return this.reminders();
  }

  async updateReminder(
    id: string,
    patch: Partial<Pick<DogReminder, "title" | "reminderTime" | "enabled">>,
  ): Promise<DogReminder[]> {
    if (patch.title !== undefined && !patch.title.trim()) throw new ApiError("Escribe el aviso.");
    if (patch.reminderTime !== undefined && !/^\d{2}:\d{2}$/.test(patch.reminderTime))
      throw new ApiError("La hora no es válida.");
    await this.db.update("dog_reminders", id, { ...patch, ...(patch.title ? { title: patch.title.trim() } : {}) });
    return this.reminders();
  }

  async deleteReminder(id: string): Promise<DogReminder[]> {
    await this.db.remove("dog_reminders", [id]);
    return this.reminders();
  }

  async household(): Promise<Household> {
    return this.db.getHousehold();
  }

  async preferences(): Promise<Preferences> {
    return (await this.db.getHousehold()).preferences;
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    const clean = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 30);
    await this.db.updateHousehold({
      preferences: {
        specialDietEnabled: preferences.specialDietEnabled,
        allergens: clean(preferences.allergens),
        avoided: clean(preferences.avoided),
      },
    });
  }

  async setPostalCode(postalCode: string): Promise<void> {
    const clean = postalCode.trim();
    if (clean && !/^\d{5}$/.test(clean)) throw new ApiError("El código postal debe tener 5 números.");
    const household = await this.db.getHousehold();
    await this.db.updateHousehold({ postalCode: clean, priceMeta: { ...household.priceMeta, postalCode: clean } });
  }

  async renameHousehold(name: string): Promise<void> {
    const clean = name.trim().slice(0, 50);
    if (!clean) throw new ApiError("Escribe un nombre para el hogar.");
    await this.db.updateHousehold({ name: clean });
  }

  /** Borra todos los datos del hogar y deja el catálogo con existencias a cero. */
  async resetHousehold(): Promise<void> {
    const tables = [
      "inventory_lots",
      "purchase_sessions",
      "provisional_purchases",
      "prices",
      "tickets",
      "ticket_reviews",
      "name_aliases",
      "dog_items",
      "dog_reminders",
      "stock_events",
      "operations",
      "household_events",
      "activity",
      "quick_sessions",
      "barcodes",
    ] as const;
    const images = (await this.db.list("tickets")).flatMap((ticket) => (ticket.imagePath ? [ticket.imagePath] : []));
    await this.db.removeTicketImages(images).catch(logError("borrar fotos del hogar"));
    for (const table of tables) await this.db.removeAll(table);
    const products = await this.db.list("products");
    const custom = products.filter((product) => product.sku.startsWith("custom-"));
    await this.db.remove(
      "products",
      custom.map((product) => product.id),
    );
    for (const product of products.filter((item) => !item.sku.startsWith("custom-"))) {
      if (product.currentStock || product.minimumStock || product.suppressed)
        await this.db.update("products", product.id, {
          currentStock: 0,
          minimumStock: 0,
          suppressed: false,
          plannedUntil: null,
          updatedAt: now(),
        });
    }
    const lists = await this.db.getLists();
    await this.db.casLists([], [], lists.revision);
    const household = await this.db.getHousehold();
    await this.db.updateHousehold({
      mode: "normal",
      priceMeta: { postalCode: household.postalCode, lastAttemptedAt: null, lastSuccessfulAt: null, updatedCount: 0 },
    });
  }
}
