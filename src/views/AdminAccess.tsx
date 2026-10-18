import { FingerprintPattern, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LOCAL_RESET_PHRASE, type Account } from "../app/account";
import { Button, Input } from "../ui/primitives";
import { type AdminState } from "./admin/useAdmin";

export function AdminAccess({ admin, account }: { admin: AdminState; account: Account }) {
  const [forgot, setForgot] = useState(false);
  const [secret, setSecret] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(admin.settings);
  const biometric = admin.biometricEnabled && admin.biometricAvailable;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(pin)) {
      setError("El PIN debe tener entre 4 y 8 números.");
      return;
    }
    if (!configured && pin !== confirm) {
      setError("Los dos PIN no coinciden.");
      return;
    }
    setBusy(true);
    if (configured) {
      const result = await admin.unlockPin(pin);
      if (result === "wrong") setError("PIN incorrecto.");
      if (result === "locked") setError("Demasiados intentos. Espera unos minutos.");
    } else await admin.configure(pin);
    setBusy(false);
    setPin("");
    setConfirm("");
  }

  async function biometricUnlock() {
    setBusy(true);
    setError("");
    if (!(await admin.unlockBiometric())) setError("No se pudo verificar la biometría. Prueba de nuevo o usa el PIN.");
    setBusy(false);
  }

  if (admin.byRole)
    return (
      <section className="flex flex-1 flex-col items-center justify-center pb-10" aria-labelledby="admin-access-title">
        <div className="w-full rounded-xl bg-card p-5 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Lock className="size-7" />
          </div>
          <h1 id="admin-access-title" className="mt-5 text-2xl font-bold">
            Solo para administradores
          </h1>
          <p className="mx-auto mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
            El mantenimiento (existencias, mínimos, productos y avisos de la mascota) es de los administradores del
            hogar. Pide al responsable que te nombre administrador en Menú → Mi hogar.
          </p>
          <Button onClick={admin.cancel} className="mt-5 h-11 w-full rounded-xl">
            Entendido
          </Button>
        </div>
      </section>
    );

  return (
    <section className="flex flex-1 flex-col items-center justify-center pb-10" aria-labelledby="admin-access-title">
      <div className="w-full rounded-xl bg-card p-5">
        <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ShieldCheck className="size-7" />
        </div>
        <div className="mt-5 text-center">
          <p className="eyebrow">ZONA ADMINISTRATIVA</p>
          <h1 id="admin-access-title" className="mt-1.5 text-2xl font-bold">
            {configured ? "Abrir mantenimiento" : "Proteger mantenimiento"}
          </h1>
          <p className="mx-auto mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
            {configured
              ? "Identifícate únicamente para modificar existencias, mínimos y productos."
              : "Crea el PIN de este dispositivo. Necesidades seguirá siendo accesible sin identificación."}
          </p>
        </div>
        {biometric && (
          <>
            <Button
              onClick={() => void biometricUnlock()}
              disabled={busy}
              className="mt-6 h-13 w-full rounded-xl text-[0.9375rem]"
            >
              <FingerprintPattern className="size-5" /> Entrar con Face ID / Touch ID
            </Button>
            <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> o con PIN <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form onSubmit={submit} className={biometric ? "" : "mt-6"}>
          <label htmlFor="admin-pin" className="mb-2 block text-xs font-semibold text-muted-foreground">
            PIN del administrador
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={configured ? "current-password" : "new-password"}
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              className="h-13 rounded-xl bg-background pl-11 text-center text-lg"
              placeholder="••••"
            />
          </div>
          {!configured && (
            <>
              <label
                htmlFor="admin-pin-confirm"
                className="mb-2 mt-4 block text-xs font-semibold text-muted-foreground"
              >
                Repetir PIN
              </label>
              <Input
                id="admin-pin-confirm"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                maxLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))}
                className="h-13 rounded-xl bg-background text-center text-lg"
                placeholder="••••"
              />
            </>
          )}
          {error && (
            <p className="mt-3 text-sm font-semibold text-danger" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant={biometric ? "outline" : "default"}
            disabled={busy || pin.length < 4}
            className="mt-4 h-12 w-full rounded-xl"
          >
            {configured ? "Entrar con PIN" : "Crear acceso de administrador"}
          </Button>
        </form>
      </div>
      {configured && !forgot && (
        <button type="button" onClick={() => setForgot(true)} className="mt-4 py-1 text-xs font-semibold text-primary">
          ¿Has olvidado el PIN?
        </button>
      )}
      {forgot && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            if (await account.verifyPassword(secret)) {
              admin.forget();
              setForgot(false);
              setSecret("");
            } else
              setError(
                account.mode === "local"
                  ? `Escribe ${LOCAL_RESET_PHRASE} para confirmar.`
                  : "La contraseña no es correcta.",
              );
          }}
          className="mt-4 w-full rounded-xl bg-card p-4"
        >
          <p className="text-xs leading-5 text-muted-foreground">
            {account.mode === "local"
              ? `Escribe ${LOCAL_RESET_PHRASE} para borrar el PIN de este dispositivo y crear uno nuevo.`
              : "Confirma con la contraseña de tu cuenta para crear un PIN nuevo en este dispositivo."}
          </p>
          <Input
            type={account.mode === "local" ? "text" : "password"}
            autoComplete={account.mode === "local" ? "off" : "current-password"}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            aria-label={account.mode === "local" ? "Frase de confirmación" : "Contraseña de la cuenta"}
            className="mt-2 h-11 rounded-xl"
          />
          <Button type="submit" disabled={!secret} variant="outline" className="mt-2 h-11 w-full rounded-xl">
            Crear un PIN nuevo
          </Button>
        </form>
      )}
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Se bloquea al salir o cambiar de aplicación.
      </p>
    </section>
  );
}
