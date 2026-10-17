import { Bell, LoaderCircle, Lock, LogOut, Plus, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { DogItem, DogReminder } from "../data/types";
import { Button, Input, StatCard } from "../ui/primitives";
import type { PetState } from "../app/usePet";
import { errorMessage } from "../app/errorMessage";
import { PetItemRow } from "./dog/PetItemRow";
import { PushCard } from "./dog/PushCard";
import { ReminderEditor } from "./dog/ReminderEditor";

async function askNotifications(): Promise<NotificationPermission | "unavailable"> {
  if (!("Notification" in window)) return "unavailable";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function DogView({
  pet,
  adminUnlocked,
  requestMaintenance,
  lockAdmin,
  pushHouseholdId,
}: {
  pet: PetState;
  adminUnlocked: boolean;
  requestMaintenance: () => void;
  lockAdmin: () => void;
  /** Hogar para los avisos push (solo con cuenta; en modo local no hay servidor que avise). */
  pushHouseholdId: string | null;
}) {
  const { items, reminders, petName, loading } = pet;
  const [nameDraft, setNameDraft] = useState(petName);
  const [status, setStatus] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [pending, setPending] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // El nombre puede cambiar desde otro dispositivo: el borrador lo sigue mientras no se esté editando.
  useEffect(() => setNameDraft(petName), [petName]);

  useEffect(() => {
    if (!adminUnlocked) {
      setMaintenance(false);
      return;
    }
    if (pending) {
      setMaintenance(true);
      setPending(false);
    }
  }, [pending, adminUnlocked]);

  function toggleMaintenance() {
    setStatus("");
    if (maintenance) return setMaintenance(false);
    if (!adminUnlocked) {
      setPending(true);
      requestMaintenance();
      return;
    }
    setMaintenance(true);
  }

  async function saveItem(previous: DogItem, next: DogItem, message: string) {
    setStatus(message);
    try {
      await pet.updateItem(previous, next);
    } catch {
      setStatus("No se ha podido guardar. Comprueba la conexión.");
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!newItem.trim()) return;
    setStatus("Agregando artículo…");
    try {
      await pet.addItem(newItem);
      setNewItem("");
      setStatus("Artículo agregado.");
    } catch (error) {
      setStatus(errorMessage(error, "No se ha podido agregar."));
    }
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    try {
      setNameDraft(await pet.rename(nameDraft));
      setStatus("Nombre de la mascota actualizado.");
    } catch (error) {
      setStatus(errorMessage(error, "No se ha podido actualizar el nombre."));
    }
  }

  async function addReminder(title: string, time: string): Promise<boolean> {
    const permission = await askNotifications();
    try {
      await pet.addReminder(title, time);
      setStatus(
        permission === "granted"
          ? "Aviso programado."
          : isStandalone()
            ? "Aviso programado. Se mostrará al abrir Cesta; permite las notificaciones en Ajustes para verlo también fuera."
            : "Aviso programado dentro de Cesta. Añade Cesta a la pantalla de inicio para recibir notificaciones en iPhone.",
      );
      return true;
    } catch (error) {
      setStatus(errorMessage(error, "No se ha podido programar el aviso."));
      return false;
    }
  }

  async function updateReminder(reminder: DogReminder, patch: Partial<DogReminder>, message: string) {
    if (patch.enabled) await askNotifications();
    try {
      await pet.updateReminder(reminder.id, patch);
      setStatus(message);
      return true;
    } catch (error) {
      setStatus(errorMessage(error, "No se ha podido actualizar el aviso."));
      return false;
    }
  }

  async function deleteReminder(reminder: DogReminder) {
    try {
      await pet.deleteReminder(reminder.id);
      setStatus("Aviso eliminado.");
    } catch {
      setStatus("No se ha podido eliminar el aviso.");
    }
  }

  async function deleteItem(item: DogItem) {
    if (confirmDelete !== item.id) {
      setConfirmDelete(item.id);
      setStatus(`Toca otra vez la papelera para eliminar ${item.name}.`);
      return;
    }
    setConfirmDelete(null);
    try {
      await pet.deleteItem(item.id);
      setStatus(`${item.name} eliminado.`);
    } catch {
      setStatus("No se ha podido eliminar.");
    }
  }

  const low = items.filter((item) => item.currentStock <= item.minimumStock).length;

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={toggleMaintenance}
          aria-pressed={maintenance}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold ${maintenance ? "bg-primary text-primary-foreground" : " bg-card text-primary"}`}
        >
          {adminUnlocked || maintenance ? <Wrench className="size-3.5" /> : <Lock className="size-3.5" />}{" "}
          {maintenance ? "Listo" : "Mantenimiento"}
        </button>
        {maintenance && (
          <button
            type="button"
            onClick={lockAdmin}
            aria-label="Bloquear mantenimiento"
            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>

      {maintenance ? (
        <>
          <section className="mb-3 rounded-lg bg-primary-soft p-3">
            <p className="text-xs font-semibold text-primary">Mantenimiento de {petName}</p>
            <p className="mt-0.5 text-xs text-primary/70">Edita su nombre y añade comidas, snacks u otros artículos.</p>
            <form onSubmit={rename} className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={40}
                placeholder="Nombre de la mascota"
                aria-label="Nombre de la mascota"
                className="h-10 rounded-lg bg-card text-sm"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!nameDraft.trim() || nameDraft.trim() === petName}
                className="h-10 rounded-lg px-3 text-xs"
              >
                Guardar
              </Button>
            </form>
            <form onSubmit={addItem} className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                maxLength={60}
                placeholder="Nueva comida o snack"
                aria-label="Nueva comida o snack"
                className="h-10 rounded-lg bg-card text-sm"
              />
              <Button type="submit" disabled={!newItem.trim()} className="h-10 rounded-lg px-3 text-xs">
                <Plus className="size-3.5" /> Añadir
              </Button>
            </form>
          </section>
          <ReminderEditor
            reminders={reminders}
            onAdd={addReminder}
            onUpdate={updateReminder}
            onDelete={(reminder) => void deleteReminder(reminder)}
          />
        </>
      ) : (
        <>
          <p className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">Control de {petName}</p>
          <section className="mb-3 grid grid-cols-2 gap-2">
            <StatCard label="Artículos" value={items.length} />
            <StatCard label="Por reponer" value={low} tone="primary" />
          </section>
          <section className="mb-3 rounded-lg bg-card p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-primary">
                <Bell className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Avisos</p>
                <p className="text-xs text-muted-foreground">
                  {reminders.filter((reminder) => reminder.enabled).length} activos · edítalos en Mantenimiento
                </p>
              </div>
            </div>
            {reminders.length > 0 && (
              <div className="mt-2 space-y-1">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${reminder.enabled ? "bg-muted/60" : "opacity-45"}`}
                  >
                    <span className="text-xs font-semibold tabular-nums">{reminder.reminderTime}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{reminder.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {pushHouseholdId && <PushCard householdId={pushHouseholdId} />}
        </>
      )}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
          No hay artículos. Añade el primero desde Mantenimiento.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <PetItemRow
              key={item.id}
              item={item}
              maintenance={maintenance}
              confirmingDelete={confirmDelete === item.id}
              onSave={(previous, next, message) => void saveItem(previous, next, message)}
              onDelete={() => void deleteItem(item)}
            />
          ))}
        </div>
      )}
      {status && (
        <p className="mt-3 text-center text-xs font-semibold text-muted-foreground" role="status">
          {status}
        </p>
      )}
    </>
  );
}
