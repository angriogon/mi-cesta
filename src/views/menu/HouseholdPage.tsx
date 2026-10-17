import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import type { CestaApi } from "../../data/api";
import type { Household } from "../../data/types";
import { type Account } from "../../app/account";
import { Button, Input } from "../../ui/primitives";
import { LOAD_FAILED, notifyError } from "../../lib/errors";

export function HouseholdPage({
  api,
  account,
  household,
  onChange,
}: {
  api: CestaApi;
  account: Account;
  household: Household;
  onChange: (household: Household) => void;
}) {
  const [name, setName] = useState(household.name);
  const [members, setMembers] = useState<{ email: string; role: string }[]>([]);
  const [message, setMessage] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inviteUrl = `${window.location.origin}${import.meta.env.BASE_URL}?hogar=${household.inviteCode}`;

  useEffect(() => {
    account.members().then(setMembers).catch(notifyError("cargar miembros", LOAD_FAILED));
  }, [account]);

  async function share() {
    const text = `Únete a «${household.name}» en Cesta con el código ${household.inviteCode}: ${inviteUrl}`;
    try {
      if (navigator.share) await navigator.share({ title: "Cesta", text, url: inviteUrl });
      else {
        await navigator.clipboard.writeText(text);
        setMessage("Invitación copiada.");
      }
    } catch {
      // El usuario cerró la hoja de compartir.
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Mi hogar</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.renameHousehold(name);
            onChange({ ...household, name: name.trim() });
            setMessage("Nombre guardado.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "No se ha podido guardar.");
          }
        }}
        className="mt-4 grid grid-cols-[1fr_auto] gap-2"
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          aria-label="Nombre del hogar"
          className="h-11 rounded-xl text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!name.trim() || name.trim() === household.name}
          className="h-11 rounded-xl"
        >
          Guardar
        </Button>
      </form>
      {account.mode === "supabase" ? (
        <>
          <div className="mt-4 rounded-xl bg-card p-4">
            <p className="text-xs font-semibold">Invitar a alguien</p>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              Comparte el código. Al entrar con su cuenta verá la misma lista y almacén.
            </p>
            <p className="mt-3 text-center font-mono text-2xl font-bold text-primary">{household.inviteCode}</p>
            <Button onClick={() => void share()} className="mt-3 h-11 w-full rounded-xl">
              <Copy className="size-4" /> Compartir invitación
            </Button>
          </div>
          {members.length > 0 && (
            <div className="mt-3 rounded-xl bg-card p-4">
              <p className="text-xs font-semibold">Miembros</p>
              <ul className="mt-2 space-y-1 text-[12px]">
                {members.map((member) => (
                  <li key={member.email} className="flex items-center justify-between gap-2">
                    <span className="truncate">{member.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {member.role === "owner" ? "Creador" : "Miembro"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => (confirmLeave ? void account.leaveHousehold() : setConfirmLeave(true))}
            className="mt-4 w-full rounded-xl bg-danger-soft py-3 text-xs font-semibold text-danger"
          >
            {confirmLeave ? "Toca otra vez para salir del hogar" : "Salir de este hogar"}
          </button>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-card p-4 text-xs leading-5 text-muted-foreground">
          Estás en modo local: los datos se guardan solo en este dispositivo. Para compartir la lista con tu familia,
          configura Cesta con un servidor Supabase.
        </p>
      )}
      {message && (
        <p className="mt-3 text-xs font-semibold text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
