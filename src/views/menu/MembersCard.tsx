import { ChevronDown, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { PERMISSIONS, type Account, type HouseholdMember, type Permission } from "../../app/account";
import { LOAD_FAILED, notifyError } from "../../lib/errors";

const PERMISSION_TEXT: Record<Permission, { label: string; help: string }> = {
  almacen: { label: "Almacén", help: "Existencias, mínimos, productos y restablecer" },
  mascota: { label: "Mascota", help: "Añadir o borrar artículos y gestionar recordatorios" },
  miembros: { label: "Miembros", help: "Dar permisos y quitar a alguien del hogar" },
};

export function roleLabel(member: HouseholdMember): string {
  if (member.role === "owner") return "Responsable · todos los permisos";
  if (member.role === "admin") return "Administrador · todos los permisos";
  if (!member.permissions.length) return "Miembro · uso diario";
  return `Miembro · ${member.permissions.map((permission) => PERMISSION_TEXT[permission].label).join(", ")}`;
}

/**
 * Personas del hogar. Quien tiene el permiso «miembros» puede abrir a cada una (salvo a sí mismo y
 * al responsable) para darle o quitarle permisos, o quitarla del hogar. El servidor lo comprueba.
 */
export function MembersCard({ account, onMessage }: { account: Account; onMessage: (message: string) => void }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = account.can("miembros");

  useEffect(() => {
    account.members().then(setMembers).catch(notifyError("cargar miembros", LOAD_FAILED));
  }, [account]);

  async function toggle(member: HouseholdMember, permission: Permission) {
    const next = member.permissions.includes(permission)
      ? member.permissions.filter((item) => item !== permission)
      : PERMISSIONS.filter((item) => item === permission || member.permissions.includes(item));
    setBusy(true);
    try {
      await account.setMemberPermissions(member.userId, next);
      const role = next.length === PERMISSIONS.length ? "admin" : "member";
      setMembers((list) =>
        list.map((item) => (item.userId === member.userId ? { ...item, role, permissions: next } : item)),
      );
      onMessage(`Permisos de ${member.email} guardados.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se han podido cambiar los permisos.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: HouseholdMember) {
    if (confirmRemove !== member.userId) return setConfirmRemove(member.userId);
    setBusy(true);
    try {
      await account.removeMember(member.userId);
      setMembers((list) => list.filter((item) => item.userId !== member.userId));
      setOpen(null);
      onMessage(`${member.email} ya no forma parte del hogar.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se ha podido quitar a esa persona.");
    } finally {
      setBusy(false);
      setConfirmRemove(null);
    }
  }

  if (!members.length) return null;
  return (
    <div className="mt-3 rounded-xl bg-card p-4">
      <p className="text-xs font-semibold">Miembros</p>
      {canManage && (
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          Toca a una persona para elegir sus permisos o quitarla del hogar. Todos pueden usar la lista, la compra, los
          tickets y contar existencias.
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {members.map((member) => {
          const editable = canManage && member.role !== "owner" && member.email !== account.email;
          const expanded = editable && open === member.userId;
          return (
            <li key={member.userId} className={expanded ? "rounded-xl bg-muted/60 p-2" : ""}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => {
                  setOpen(expanded ? null : member.userId);
                  setConfirmRemove(null);
                }}
                aria-expanded={editable ? expanded : undefined}
                className="flex min-h-11 w-full items-center justify-between gap-2 text-left disabled:cursor-default"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.75rem]">
                    {member.email}
                    {member.email === account.email && " (tú)"}
                  </span>
                  <span className="block text-xs text-muted-foreground">{roleLabel(member)}</span>
                </span>
                {editable && (
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                )}
              </button>
              {expanded && (
                <div className="mt-1 space-y-1">
                  {PERMISSIONS.map((permission) => (
                    <label
                      key={permission}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-card px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{PERMISSION_TEXT[permission].label}</span>
                        <span className="block text-xs text-muted-foreground">{PERMISSION_TEXT[permission].help}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={member.permissions.includes(permission)}
                        disabled={busy}
                        onChange={() => void toggle(member, permission)}
                        className="size-5 shrink-0 accent-primary"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(member)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-danger-soft text-xs font-semibold text-danger disabled:opacity-60"
                  >
                    <UserMinus className="size-4" />
                    {confirmRemove === member.userId ? "Toca otra vez para quitarle del hogar" : "Quitar del hogar"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
