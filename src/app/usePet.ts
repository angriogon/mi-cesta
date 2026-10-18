import { useCallback, useEffect, useState } from "react";
import type { CestaApi } from "../data/api";
import type { DogItem, DogReminder } from "../data/types";
import { LOAD_FAILED, reportError, traced } from "../lib/errors";
import { isNetworkError, outboxFor } from "../data/outbox";
import { OFFLINE_SAVED } from "./useOfflineQueue";

type ReminderPatch = Partial<Pick<DogReminder, "title" | "reminderTime" | "enabled">>;

export interface PetState {
  loading: boolean;
  items: DogItem[];
  reminders: DogReminder[];
  petName: string;
  reload: () => Promise<void>;
  /** Guarda existencias o mínimo de un artículo; si falla, vuelve al valor anterior. */
  updateItem: (previous: DogItem, next: DogItem) => Promise<void>;
  addItem: (name: string) => Promise<DogItem>;
  deleteItem: (id: string) => Promise<void>;
  rename: (name: string) => Promise<string>;
  addReminder: (title: string, time: string) => Promise<void>;
  updateReminder: (id: string, patch: ReminderPatch) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
}

/**
 * Mascota del hogar: artículos, avisos y nombre, en un único sitio.
 * Los avisos y el nombre también los usan la barra de pestañas y las alertas, así que vive en la app.
 * `active` retrasa la primera carga hasta que la app ha mostrado lo principal.
 */
export function usePet(api: CestaApi, active: boolean): PetState {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DogItem[]>([]);
  const [reminders, setReminders] = useState<DogReminder[]>([]);
  const [petName, setPetName] = useState("Mascota");

  const reload = useCallback(async () => {
    try {
      const [dog, list] = await Promise.all([api.dogItems(), api.reminders()]);
      setItems(dog.items);
      setPetName(dog.petName || "Mascota");
      setReminders(list);
    } catch (error) {
      reportError(error, "cargar mascota", LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!active) return;
    void reload();
    return api.db.subscribe((table) => {
      if (table === "dog_items" || table === "dog_reminders") void reload();
    });
  }, [api, active, reload]);

  const updateItem = useCallback(
    async (previous: DogItem, next: DogItem) => {
      setItems((list) => list.map((item) => (item.id === previous.id ? next : item)));
      try {
        await traced("guardar artículo de mascota", () => api.updateDogItem(next));
      } catch (error) {
        if (isNetworkError(error)) {
          await outboxFor(api.db.householdId).enqueue({ kind: "pet-item", item: next });
          reportError(error, "guardar artículo de mascota", OFFLINE_SAVED);
          return;
        }
        setItems((list) => list.map((item) => (item.id === previous.id ? previous : item)));
        throw error;
      }
    },
    [api],
  );

  const addItem = useCallback(
    async (name: string) => {
      const item = await traced("añadir artículo de mascota", () => api.addDogItem(name));
      setItems((list) => [...list, item].sort((a, b) => a.name.localeCompare(b.name, "es")));
      return item;
    },
    [api],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await traced("borrar artículo de mascota", () => api.deleteDogItem(id));
      setItems((list) => list.filter((item) => item.id !== id));
    },
    [api],
  );

  const rename = useCallback(
    async (name: string) => {
      const saved = await traced("nombre de mascota", () => api.setPetName(name));
      setPetName(saved);
      return saved;
    },
    [api],
  );

  const addReminder = useCallback(
    async (title: string, time: string) =>
      setReminders(await traced("añadir aviso", () => api.addReminder(title, time))),
    [api],
  );

  const updateReminder = useCallback(
    async (id: string, patch: ReminderPatch) =>
      setReminders(await traced("actualizar aviso", () => api.updateReminder(id, patch))),
    [api],
  );

  const deleteReminder = useCallback(
    async (id: string) => setReminders(await traced("borrar aviso", () => api.deleteReminder(id))),
    [api],
  );

  return {
    loading,
    items,
    reminders,
    petName,
    reload,
    updateItem,
    addItem,
    deleteItem,
    rename,
    addReminder,
    updateReminder,
    deleteReminder,
  };
}
