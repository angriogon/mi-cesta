import { Bell, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { DogReminder } from "../../data/types";
import { Button, Input } from "../../ui/primitives";

type ReminderPatch = Partial<Pick<DogReminder, "title" | "reminderTime" | "enabled">>;

/** Programar, pausar, editar y borrar los avisos de la mascota (solo en mantenimiento). */
export function ReminderEditor({
  reminders,
  onAdd,
  onUpdate,
  onDelete,
}: {
  reminders: DogReminder[];
  /** Devuelve si se guardó, para limpiar el formulario. */
  onAdd: (title: string, time: string) => Promise<boolean>;
  onUpdate: (reminder: DogReminder, patch: ReminderPatch, message: string) => Promise<boolean>;
  onDelete: (reminder: DogReminder) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("21:00");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("21:00");

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    if (await onAdd(title, time)) setTitle("");
  }

  async function saveEdit(event: FormEvent, reminder: DogReminder) {
    event.preventDefault();
    if (await onUpdate(reminder, { title: editTitle, reminderTime: editTime }, "Aviso actualizado.")) setEditing(null);
  }

  return (
    <section className="mb-3 rounded-lg bg-card p-3">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <p className="text-xs font-semibold">Programar avisos</p>
      </div>
      <form onSubmit={(event) => void add(event)} className="mt-3 grid grid-cols-[1fr_5.6rem] gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="Ej. Dar snack"
          aria-label="Texto del aviso"
          className="h-10 rounded-lg text-sm"
        />
        <Input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Hora del aviso"
          className="h-10 rounded-lg px-1.5 text-sm"
        />
        <Button type="submit" disabled={!title.trim()} className="col-span-2 h-10 rounded-lg text-xs">
          <Plus className="size-3.5" /> Añadir aviso
        </Button>
      </form>
      <div className="mt-3 space-y-1.5">
        {reminders.map((reminder) =>
          editing === reminder.id ? (
            <form
              key={reminder.id}
              onSubmit={(event) => void saveEdit(event, reminder)}
              className="grid grid-cols-[1fr_5.6rem] gap-1.5 rounded-xl bg-muted/60 p-2"
            >
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                aria-label="Texto del aviso"
                className="h-9 rounded-lg bg-card px-2 text-xs"
              />
              <Input
                type="time"
                value={editTime}
                onChange={(event) => setEditTime(event.target.value)}
                aria-label="Hora del aviso"
                className="h-9 rounded-lg bg-card px-1 text-xs"
              />
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
                onClick={() =>
                  void onUpdate(
                    reminder,
                    { enabled: !reminder.enabled },
                    reminder.enabled ? "Aviso pausado." : "Aviso activado.",
                  )
                }
                aria-label={reminder.enabled ? `Pausar ${reminder.title}` : `Activar ${reminder.title}`}
                className="-m-1 flex size-8 shrink-0 items-center justify-center"
              >
                <span className={`size-3 rounded-full ${reminder.enabled ? "bg-primary" : "bg-muted-foreground/35"}`} />
              </button>
              <span className="w-10 shrink-0 text-xs font-semibold tabular-nums">{reminder.reminderTime}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{reminder.title}</span>
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
                onClick={() => onDelete(reminder)}
                aria-label={`Eliminar ${reminder.title}`}
                className="flex size-8 items-center justify-center rounded-lg bg-danger-soft text-danger"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
