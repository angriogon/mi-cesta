import { House, Users } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "../../ui/primitives";
import { createHousehold, joinHousehold } from "../account";
import { supabase } from "../config";
import { Card } from "./AuthScreens";

export function HouseholdScreen({ onReady }: { onReady: (id: string) => void }) {
  const [name, setName] = useState("Mi hogar");
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("hogar") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setError("");
    setBusy(true);
    try {
      const id = await action();
      const url = new URL(window.location.href);
      url.searchParams.delete("hogar");
      window.history.replaceState(null, "", url);
      onReady(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se ha podido completar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={<House className="size-5" />}
      title="Tu hogar"
      text="Crea un hogar nuevo o únete al de tu familia con su código de invitación."
    >
      {code && (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-center text-xs font-semibold text-primary">
          Te han invitado a un hogar. Pulsa «Unirme» para entrar.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => joinHousehold(code));
        }}
        className="mt-5 space-y-2"
      >
        <label className="block text-xs font-semibold text-muted-foreground">
          Código de invitación
          <Input
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 8),
              )
            }
            placeholder="ABC123"
            autoCapitalize="characters"
            className="mt-1.5 h-11 rounded-xl text-center"
          />
        </label>
        <Button type="submit" disabled={busy || code.length < 6} className="h-11 w-full rounded-xl">
          <Users className="size-4" /> Unirme
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => createHousehold(name));
        }}
        className="space-y-2"
      >
        <label className="block text-xs font-semibold text-muted-foreground">
          Nombre del hogar
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            className="mt-1.5 h-11 rounded-xl"
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !name.trim()} className="h-11 w-full rounded-xl">
          <House className="size-4" /> Crear hogar nuevo
        </Button>
      </form>
      {error && (
        <p className="mt-3 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void supabase().auth.signOut()}
        className="mt-5 w-full text-center text-xs font-semibold text-muted-foreground"
      >
        Cerrar sesión
      </button>
    </Card>
  );
}
