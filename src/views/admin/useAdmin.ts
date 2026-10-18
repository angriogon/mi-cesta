import { useCallback, useEffect, useMemo, useState } from "react";
import { readJson, removeKey, writeJson } from "../../lib/storage";
import { reportError } from "../../lib/errors";
import type { HouseholdRole } from "../../app/account";

export interface AdminSettings {
  salt: string;
  pinHash: string;
  credentialId?: string;
  failures?: number;
  lockedUntil?: number;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
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
 * Acceso al mantenimiento (existencias, mínimos y catálogo).
 * - Con cuenta, lo decide el rol del hogar (lo comprueba el servidor): responsables y administradores
 *   entran directamente; a los miembros se les explica que lo pidan.
 * - En modo local (pruebas), PIN o biometría del dispositivo; se vuelve a bloquear al salir de la app.
 */
export function useAdmin(householdId: string, role: HouseholdRole | null = null) {
  const byRole = role !== null;
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
      byRole,
      settings,
      unlocked: byRole ? role !== "member" : unlocked,
      requested,
      biometricAvailable,
      biometricEnabled: Boolean(settings?.credentialId),
      request: () => setRequested(true),
      cancel: () => setRequested(false),
      lock: () => {
        if (!byRole) setUnlocked(false);
      },
      configure,
      unlockPin,
      enableBiometrics,
      unlockBiometric,
      forget: () => save(null),
    }),
    [
      byRole,
      role,
      settings,
      unlocked,
      requested,
      biometricAvailable,
      configure,
      unlockPin,
      enableBiometrics,
      unlockBiometric,
      save,
    ],
  );
}

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const randomBase64 = (length: number) => toBase64(crypto.getRandomValues(new Uint8Array(length)));
