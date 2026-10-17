import { Bell, Dog, LoaderCircle, Lock, LogOut, Minus, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, type CestaApi } from "../data/api";
import type { DogItem, DogReminder } from "../data/types";
import { Button, Input, Stepper } from "../ui/primitives";

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
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function DogView({
  api,
  adminUnlocked,
  requestMaintenance,
  lockAdmin,
  onRemindersChange,
  onPetNameChange,
}: {
  api: CestaApi;
  adminUnlocked: boolean;
  requestMaintenance: () => void;
  lockAdmin: () => void;
  onRemindersChange: (reminders: DogReminder[]) => void;
  onPetNameChange: (name: string) => void;
}) {
  const [items, setItems] = useState<DogItem[]>([]);
  const [petName, setPetName] = useState("Mascota");
  const [nameDraft, setNameDraft] = useState("Mascota");
  const [reminders, setReminders] = useState<DogReminder[]>([]);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("21:00");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("21:00");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [pending, setPending] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      const [dog, list] = await Promise.all([api.dogItems(), api.reminders()]);
      setItems(dog.items);
      setPetName(dog.petName);
      setNameDraft(dog.petName);
      setReminders(list);
    } catch {
      setStatus("No se han podido cargar todos los datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const unsubscribe = api.db.subscribe((table) => {
      if (table === "dog_items" || table === "dog_reminders") void load();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

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

  function publish(next: DogReminder[]) {
    setReminders(next);
    onRemindersChange(next);
  }

  async function saveItem(previous: DogItem, next: DogItem, message: string) {
    setItems((list) => list.map((item) => (item.id === previous.id ? next : item)));
    setStatus(message);
    try {
      await api.updateDogItem(next);
    } catch {
      setItems((list) => list.map((item) => (item.id === previous.id ? previous : item)));
      setStatus("No se ha podido guardar. Comprueba la conexión.");
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!newItem.trim()) return;
    setStatus("Agregando artículo…");
    try {
      const item = await api.addDogItem(newItem);
      setItems((list) => [...list, item].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setNewItem("");
      setStatus("Artículo agregado.");
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se ha podido agregar.");
    }
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    try {
      const name = await api.setPetName(nameDraft);
      setPetName(name);
      setNameDraft(name);
      onPetNameChange(name);
      setStatus("Nombre de la mascota actualizado.");
    } catch {
      setStatus("No se ha podido actualizar el nombre.");
    }
  }

  async function addReminder(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const permission = await askNotifications();
    try {
      publish(await api.addReminder(title, time));
      setTitle("");
      setStatus(
        permission === "granted"
          ? "Aviso programado."
          : isStandalone()
            ? "Aviso programado. Se mostrará al abrir Cesta; permite las notificaciones en Ajustes para verlo también fuera."
            : "Aviso programado dentro de Cesta. Añade Cesta a la pantalla de inicio para recibir notificaciones en iPhone.",
      );
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se ha podido programar el aviso.");
    }
  }

  async function updateReminder(reminder: DogReminder, patch: Partial<DogReminder>, message: string) {
    if (patch.enabled) await askNotifications();
    try {
      publish(await api.updateReminder(reminder.id, patch));
      setEditing(null);
      setStatus(message);
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "No se ha podido actualizar el aviso.");
    }
  }

  async function deleteReminder(reminder: DogReminder) {
    try {
      publish(await api.deleteReminder(reminder.id));
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
      await api.deleteDogItem(item.id);
      setItems((list) => list.filter((entry) => entry.id !== item.id));
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
          className={`flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold ${maintenance ? "bg-primary text-primary-foreground" : "border border-border bg-card text-primary"}`}
        >
          {adminUnlocked || maintenance ? <Wrench className="size-3.5" /> : <Lock className="size-3.5" />} {maintenance ? "Listo" : "Mantenimiento"}
        </button>
        {maintenance && (
          <button type="button" onClick={lockAdmin} aria-label="Bloquear mantenimiento" className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LogOut className="size-4" />
          </button>
        )}
      </div>

      {maintenance ? (
        <>
          <section className="mb-3 rounded-[16px] border border-[#d8e5d9] bg-[#edf4ee] p-3 dark:border-border dark:bg-card">
            <p className="text-xs font-bold text-[#20462f] dark:text-foreground">Mantenimiento de {petName}</p>
            <p className="mt-0.5 text-[11px] text-[#20462f]/70 dark:text-muted-foreground">Edita su nombre y añade comidas, snacks u otros artículos.</p>
            <form onSubmit={rename} className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={40} placeholder="Nombre de la mascota" aria-label="Nombre de la mascota" className="h-10 rounded-lg bg-card text-sm" />
              <Button type="submit" variant="outline" disabled={!nameDraft.trim() || nameDraft.trim() === petName} className="h-10 rounded-lg px-3 text-xs">
                Guardar
              </Button>
            </form>
            <form onSubmit={addItem} className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Input value={newItem} onChange={(event) => setNewItem(event.target.value)} maxLength={60} placeholder="Nueva comida o snack" aria-label="Nueva comida o snack" className="h-10 rounded-lg bg-card text-sm" />
              <Button type="submit" disabled={!newItem.trim()} className="h-10 rounded-lg px-3 text-xs">
                <Plus className="size-3.5" /> Añadir
              </Button>
            </form>
          </section>
          <section className="mb-3 rounded-[16px] border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <p className="text-xs font-bold">Programar avisos</p>
            </div>
            <form onSubmit={addReminder} className="mt-3 grid grid-cols-[1fr_5.6rem] gap-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Ej. Dar snack" aria-label="Texto del aviso" className="h-10 rounded-lg text-sm" />
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Hora del aviso" className="h-10 rounded-lg px-1.5 text-sm" />
              <Button type="submit" disabled={!title.trim()} className="col-span-2 h-10 rounded-lg text-xs">
                <Plus className="size-3.5" /> Añadir aviso
              </Button>
            </form>
            <div className="mt-3 space-y-1.5">
              {reminders.map((reminder) =>
                editing === reminder.id ? (
                  <form
                    key={reminder.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void updateReminder(reminder, { title: editTitle, reminderTime: editTime }, "Aviso actualizado.");
                    }}
                    className="grid grid-cols-[1fr_5.6rem] gap-1.5 rounded-xl bg-muted/60 p-2"
                  >
                    <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Texto del aviso" className="h-9 rounded-lg bg-card px-2 text-xs" />
                    <Input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} aria-label="Hora del aviso" className="h-9 rounded-lg bg-card px-1 text-xs" />
                    <div className="col-span-2 grid grid-cols-2 gap-1.5">
                      <Button variant="outline" onClick={() => setEditing(null)} className="h-9 rounded-lg text-xs">
                        Cancelar
                      </Button>
                      <Button type="submit" className="h-9 rounded-lg text-xs">
                        Guardar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div key={reminder.id} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-muted/60 px-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={reminder.enabled}
                      onClick={() => void updateReminder(reminder, { enabled: !reminder.enabled }, reminder.enabled ? "Aviso pausado." : "Aviso activado.")}
                      aria-label={reminder.enabled ? `Pausar ${reminder.title}` : `Activar ${reminder.title}`}
                      className="-m-1 flex size-8 shrink-0 items-center justify-center"
                    >
                      <span className={`size-3 rounded-full ${reminder.enabled ? "bg-primary" : "bg-muted-foreground/35"}`} />
                    </button>
                    <span className="w-10 shrink-0 text-[11px] font-bold tabular-nums">{reminder.reminderTime}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{reminder.title}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(reminder.id);
                        setEditTitle(reminder.title);
                        setEditTime(reminder.reminderTime);
                      }}
                      aria-label={`Editar ${reminder.title}`}
                      className="flex size-8 items-center justify-center rounded-lg bg-card text-primary"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteReminder(reminder)}
                      aria-label={`Eliminar ${reminder.title}`}
                      className="flex size-8 items-center justify-center rounded-lg bg-[#fbefeb] text-[#a34141]"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ),
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Control de {petName}</p>
          <section className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-[16px] border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground">Artículos</p>
              <p className="mt-0.5 text-xl font-bold">{items.length}</p>
            </div>
            <div className="rounded-[16px] border border-[#d8e5d9] bg-[#eaf3eb] px-3 py-2.5 text-[#20462f] dark:border-border dark:bg-secondary dark:text-secondary-foreground">
              <p className="text-[10px] font-semibold opacity-70">Por reponer</p>
              <p className="mt-0.5 text-xl font-bold">{low}</p>
            </div>
          </section>
          <section className="mb-3 rounded-[16px] border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-primary">
                <Bell className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">Avisos</p>
                <p className="text-[10px] text-muted-foreground">{reminders.filter((reminder) => reminder.enabled).length} activos · edítalos en Mantenimiento</p>
              </div>
            </div>
            {reminders.length > 0 && (
              <div className="mt-2 space-y-1">
                {reminders.map((reminder) => (
                  <div key={reminder.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${reminder.enabled ? "bg-muted/60" : "opacity-45"}`}>
                    <span className="text-[11px] font-bold tabular-nums">{reminder.reminderTime}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{reminder.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[18px] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay artículos. Añade el primero desde Mantenimiento.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const lowStock = item.currentStock <= item.minimumStock;
            return (
              <section
                key={item.id}
                className={`rounded-[16px] border px-2.5 py-2 ${lowStock ? "border-[#ead8d1] bg-[#fbf4f1] dark:border-border dark:bg-card" : "border-border bg-card"}`}
              >
                <div className="flex min-h-10 items-center gap-1.5">
                  <Dog className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{item.name}</p>
                    <p className={`text-[10px] font-semibold ${lowStock ? "text-[#a25631]" : "text-muted-foreground"}`}>
                      {lowStock ? `Reponer · mínimo ${item.minimumStock}` : `Mínimo ${item.minimumStock}`}
                    </p>
                  </div>
                  {maintenance ? (
                    <>
                      <Stepper
                        value={item.currentStock}
                        label={`existencias de ${item.name}`}
                        minusDisabled={item.currentStock <= 0}
                        onMinus={() => void saveItem(item, { ...item, currentStock: Math.max(0, item.currentStock - 1) }, "Existencias actualizadas.")}
                        onPlus={() => void saveItem(item, { ...item, currentStock: item.currentStock + 1 }, "Existencias actualizadas.")}
                      />
                      <button
                        type="button"
                        onClick={() => void deleteItem(item)}
                        aria-label={`Eliminar ${item.name}`}
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${confirmDelete === item.id ? "bg-[#a34141] text-white" : "bg-[#fbefeb] text-[#a34141]"}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-bold tabular-nums">{item.currentStock}</span>
                      <Button
                        disabled={item.currentStock === 0}
                        onClick={() => void saveItem(item, { ...item, currentStock: Math.max(0, item.currentStock - 1) }, `1 unidad de ${item.name} descontada.`)}
                        className="h-10 rounded-xl px-3 text-[11px]"
                      >
                        Dar 1
                      </Button>
                    </>
                  )}
                </div>
                {maintenance && (
                  <div className="mt-1.5 flex items-center justify-end gap-1 rounded-lg bg-muted/70 px-2 py-1">
                    <span className="mr-auto text-[10px] font-medium text-muted-foreground">Stock mínimo</span>
                    <button
                      type="button"
                      aria-label={`Reducir mínimo de ${item.name}`}
                      disabled={item.minimumStock <= 0}
                      onClick={() => void saveItem(item, { ...item, minimumStock: Math.max(0, item.minimumStock - 1) }, "Stock mínimo actualizado.")}
                      className="flex size-8 items-center justify-center rounded-md bg-card disabled:opacity-40"
                    >
                      <Minus className="size-2.5" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold">{item.minimumStock}</span>
                    <button
                      type="button"
                      aria-label={`Aumentar mínimo de ${item.name}`}
                      onClick={() => void saveItem(item, { ...item, minimumStock: item.minimumStock + 1 }, "Stock mínimo actualizado.")}
                      className="flex size-8 items-center justify-center rounded-md bg-card text-primary"
                    >
                      <Plus className="size-2.5" />
                    </button>
                  </div>
                )}
              </section>
            );
          })}
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
