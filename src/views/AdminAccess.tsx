import { FingerprintPattern, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { readJson, removeKey, writeJson } from "../lib/storage";
import { LOCAL_RESET_PHRASE, type Account } from "../app/account";
import { Button, Input } from "../ui/primitives";
import { reportError } from "../lib/errors";

interface AdminSettings {
  salt: string;
  pinHash: string;
  credentialId?: string;
  failures?: number;
  lockedUntil?: number;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const randomBase64 = (length: number) => toBase64(crypto.getRandomValues(new Uint8Array(length)));

async function hashPin(pin: string, salt: string): Promise<string> {
  // PBKDF2 para que un PIN corto no se pueda probar por fuerza bruta a partir del hash guardado.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations: 150_000 },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export type AdminState = ReturnType<typeof useAdmin>;

/**
 * Bloqueo local del mantenimiento (existencias, mínimos y catálogo) con PIN o biometría del dispositivo.
 * Se vuelve a bloquear al salir de la app.
 */
export function useAdmin(householdId: string) {
  const key = `cesta-admin-v1:${householdId}`;
  const [settings, setSettings] = useState<AdminSettings | null>(() => readJson<AdminSettings | null>(key, null));
  const [unlocked, setUnlocked] = useState(false);
  const [requested, setRequested] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    const credential = window.PublicKeyCredential as typeof PublicKeyCredential | undefined;
    credential
      ?.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then(setBiometricAvailable)
      .catch(() => setBiometricAvailable(false));
  }, []);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") setUnlocked(false);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  useEffect(() => {
    if (unlocked) setRequested(false);
  }, [unlocked]);

  const save = useCallback(
    (next: AdminSettings | null) => {
      if (next) writeJson(key, next);
      else removeKey(key);
      setSettings(next);
    },
    [key],
  );

  const configure = useCallback(
    async (pin: string) => {
      const salt = randomBase64(18);
      save({ salt, pinHash: await hashPin(pin, salt) });
      setUnlocked(true);
    },
    [save],
  );

  const unlockPin = useCallback(
    async (pin: string): Promise<"ok" | "wrong" | "locked"> => {
      if (!settings) return "wrong";
      if (settings.lockedUntil && settings.lockedUntil > Date.now()) return "locked";
      const ok = (await hashPin(pin, settings.salt)) === settings.pinHash;
      if (ok) {
        save({ ...settings, failures: 0, lockedUntil: undefined });
        setUnlocked(true);
        return "ok";
      }
      const failures = (settings.failures ?? 0) + 1;
      save({
        ...settings,
        failures,
        lockedUntil: failures >= 5 ? Date.now() + 60_000 * Math.min(30, 2 ** (failures - 5)) : undefined,
      });
      return failures >= 5 ? "locked" : "wrong";
    },
    [settings, save],
  );

  const enableBiometrics = useCallback(async () => {
    if (!settings || !biometricAvailable) return false;
    try {
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: fromBase64(randomBase64(32)),
          rp: { name: "Cesta" },
          user: {
            id: fromBase64(randomBase64(16)),
            name: "administrador-cesta",
            displayName: "Administrador de Cesta",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
          timeout: 60_000,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!credential) return false;
      save({ ...settings, credentialId: toBase64(new Uint8Array(credential.rawId)) });
      return true;
    } catch (error) {
      reportError(error, "registrar Face ID");
      return false;
    }
  }, [settings, biometricAvailable, save]);

  const unlockBiometric = useCallback(async () => {
    if (!settings?.credentialId || !biometricAvailable) return false;
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: fromBase64(randomBase64(32)),
          allowCredentials: [{ id: fromBase64(settings.credentialId), type: "public-key", transports: ["internal"] }],
          userVerification: "required",
          timeout: 60_000,
        },
      });
      if (!assertion) return false;
      setUnlocked(true);
      return true;
    } catch (error) {
      reportError(error, "desbloquear con Face ID");
      return false;
    }
  }, [settings, biometricAvailable]);

  return useMemo(
    () => ({
      settings,
      unlocked,
      requested,
      biometricAvailable,
      biometricEnabled: Boolean(settings?.credentialId),
      request: () => setRequested(true),
      cancel: () => setRequested(false),
      lock: () => setUnlocked(false),
      configure,
      unlockPin,
      enableBiometrics,
      unlockBiometric,
      forget: () => save(null),
    }),
    [settings, unlocked, requested, biometricAvailable, configure, unlockPin, enableBiometrics, unlockBiometric, save],
  );
}

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

  return (
    <section className="flex flex-1 flex-col items-center justify-center pb-10" aria-labelledby="admin-access-title">
      <div className="w-full rounded-[26px] border border-border bg-card p-5 shadow-[0_18px_50px_rgba(32,47,38,.08)]">
        <div className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-[#e8f0e9] text-primary dark:bg-secondary">
          <ShieldCheck className="size-7" />
        </div>
        <div className="mt-5 text-center">
          <p className="eyebrow">ZONA ADMINISTRATIVA</p>
          <h1 id="admin-access-title" className="mt-1.5 text-2xl font-bold tracking-[-0.035em]">
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
              className="mt-6 h-13 w-full rounded-2xl text-[15px]"
            >
              <FingerprintPattern className="size-5" /> Entrar con Face ID / Touch ID
            </Button>
            <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> o con PIN <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <form onSubmit={submit} className={biometric ? "" : "mt-6"}>
          <label htmlFor="admin-pin" className="mb-2 block text-xs font-bold text-muted-foreground">
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
              className="h-13 rounded-2xl bg-background pl-11 text-center text-lg tracking-[.25em]"
              placeholder="••••"
            />
          </div>
          {!configured && (
            <>
              <label htmlFor="admin-pin-confirm" className="mb-2 mt-4 block text-xs font-bold text-muted-foreground">
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
                className="h-13 rounded-2xl bg-background text-center text-lg tracking-[.25em]"
                placeholder="••••"
              />
            </>
          )}
          {error && (
            <p className="mt-3 text-sm font-semibold text-[#a34141]" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant={biometric ? "outline" : "default"}
            disabled={busy || pin.length < 4}
            className="mt-4 h-12 w-full rounded-2xl"
          >
            {configured ? "Entrar con PIN" : "Crear acceso de administrador"}
          </Button>
        </form>
      </div>
      {configured && !forgot && (
        <button type="button" onClick={() => setForgot(true)} className="mt-4 py-1 text-xs font-bold text-primary">
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
          className="mt-4 w-full rounded-[20px] border border-border bg-card p-4"
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
