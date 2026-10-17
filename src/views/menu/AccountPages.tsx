import { LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { CestaApi } from "../../data/api";
import { LOCAL_RESET_PHRASE, type Account } from "../../app/account";
import { Button, Input } from "../../ui/primitives";

export function PasswordPage({ account }: { account: Account }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="text-lg font-semibold">Modificar contraseña</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          if (next.length < 8) return setMessage("La nueva contraseña debe tener al menos 8 caracteres.");
          if (next !== repeat) return setMessage("Las contraseñas nuevas no coinciden.");
          setBusy(true);
          try {
            await account.changePassword(current, next);
            setCurrent("");
            setNext("");
            setRepeat("");
            setMessage("Contraseña actualizada.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "No se ha podido cambiar.");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-4 space-y-3"
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder="Contraseña actual"
          className="h-11 rounded-xl"
        />
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="Nueva contraseña"
          className="h-11 rounded-xl"
        />
        <Input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          placeholder="Repetir nueva contraseña"
          className="h-11 rounded-xl"
        />
        {message && (
          <p
            className={`text-xs font-semibold ${message.includes("actualizada") ? "text-primary" : "text-danger"}`}
            role="status"
          >
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy || !current} className="h-11 w-full rounded-xl">
          {busy && <LoaderCircle className="size-4 animate-spin" />} Guardar cambio
        </Button>
      </form>
    </section>
  );
}

export function ResetPage({ api, account, onReset }: { api: CestaApi; account: Account; onReset: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const local = account.mode === "local";
  return (
    <section>
      <h2 className="text-lg font-semibold text-danger">Restablecer datos del hogar</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Se eliminarán Compra, Lista, almacén, caducidades, tickets, precios y los artículos y avisos de la mascota de
        todo el hogar. El catálogo base se conserva con existencias a cero. Esta acción no se puede deshacer.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          try {
            if (!(await account.verifyPassword(password)))
              throw new Error(
                local ? `Escribe ${LOCAL_RESET_PHRASE} para confirmar.` : "La contraseña no es correcta.",
              );
            await api.resetHousehold();
            for (const key of Object.keys(window.localStorage)) {
              if (key.startsWith("cesta-dog-reminder-") || key.startsWith("cesta-category-memory-v1"))
                window.localStorage.removeItem(key);
            }
            onReset();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No se ha podido restablecer.");
            setBusy(false);
          }
        }}
        className="mt-4 space-y-3"
      >
        <Input
          type={local ? "text" : "password"}
          autoComplete={local ? "off" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={local ? `Escribe ${LOCAL_RESET_PHRASE}` : "Contraseña de tu cuenta"}
          className="h-11 rounded-xl"
        />
        {error && (
          <p className="text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || !password}
          className="h-11 w-full rounded-xl bg-danger text-white hover:bg-danger"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Restablecer todo
        </Button>
      </form>
    </section>
  );
}
