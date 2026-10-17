import { copy } from "../../copy/es";
import { FingerprintPattern, Lock, Plus, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CestaApi } from "../../data/api";
import type { Product } from "../../data/types";
import { reportError } from "../../lib/errors";
import { CATEGORIES, type Category } from "../../domain/categories";
import { Button, Input, NativeSelect } from "../../ui/primitives";
import type { Notify } from "../../ui/Toast";
import type { AdminState } from "../admin/useAdmin";

/** Productos que AutoCesta tiene prohibido sugerir, con la opción de volver a permitirlo. */
export function SuppressedList({ api, notify, products }: { api: CestaApi; notify: Notify; products: Product[] }) {
  if (!products.length) return null;
  return (
    <section className="mt-6 rounded-xl bg-card p-4">
      <h2 className="text-sm font-semibold">Productos que AutoCesta no sugiere</h2>
      <div className="mt-2 space-y-1">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[0.75rem]"
          >
            <span className="truncate font-semibold">{product.name}</span>
            <button
              type="button"
              onClick={() =>
                void api
                  .unsuppress(product.id)
                  .then(() => notify(`${product.name} vuelve a poder sugerirse.`))
                  .catch((error: unknown) => {
                    reportError(error, "volver a sugerir");
                    notify(copy.errors.saveShort);
                  })
              }
              className="shrink-0 px-1 py-1.5 text-xs font-semibold text-primary"
            >
              Volver a sugerir
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Acceso de administrador del dispositivo: biometría y bloqueo. */
export function AdminSection({ admin }: { admin: AdminState }) {
  const [biometricStatus, setBiometricStatus] = useState("");
  return (
    <section className="mt-6 rounded-xl bg-card p-4" aria-labelledby="stock-security-title">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="stock-security-title" className="text-sm font-semibold">
            Acceso de administrador
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            El stock y los mínimos solo pueden editarse después de identificarse en este dispositivo.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/75 px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <FingerprintPattern className="size-4 text-primary" /> Face ID / Touch ID
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${admin.biometricEnabled ? "bg-primary-soft text-primary" : "bg-card text-muted-foreground"}`}
        >
          {admin.biometricEnabled ? "ACTIVA" : "NO ACTIVA"}
        </span>
      </div>
      {!admin.biometricEnabled && admin.biometricAvailable && (
        <Button
          variant="outline"
          onClick={async () =>
            setBiometricStatus(
              (await admin.enableBiometrics())
                ? "Biometría activada correctamente."
                : "No se pudo activar. Comprueba la configuración del dispositivo.",
            )
          }
          className="mt-3 h-11 w-full rounded-xl"
        >
          <FingerprintPattern className="size-4" /> Activar biometría
        </Button>
      )}
      {!admin.biometricAvailable && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          La biometría no está disponible en este navegador. El acceso seguirá protegido mediante PIN.
        </p>
      )}
      {biometricStatus && (
        <p className="mt-3 text-xs font-semibold text-muted-foreground" role="status">
          {biometricStatus}
        </p>
      )}
      <Button variant="ghost" onClick={admin.lock} className="mt-2 h-10 w-full rounded-xl text-muted-foreground">
        <Lock className="size-4" /> Bloquear ahora
      </Button>
    </section>
  );
}

/** Alta de productos y filtro del catálogo, visibles solo en mantenimiento. */
export function MaintenancePanel({
  onAdd,
  onlyStocked,
  setOnlyStocked,
  status,
  error,
}: {
  onAdd: (name: string, category: Category) => Promise<boolean>;
  onlyStocked: boolean;
  setOnlyStocked: (value: boolean) => void;
  status: string;
  error: string;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("Despensa");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (await onAdd(name.trim(), category)) setName("");
  }

  return (
    <section className="mb-3 rounded-lg bg-primary-soft p-3 text-primary">
      <div className="mb-2">
        <p className="text-xs font-semibold">Mantenimiento del catálogo</p>
        <p className="mt-0.5 text-xs">Agrega, elimina o ajusta existencias, mínimos y categoría de cada producto.</p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre del producto"
          maxLength={80}
          className="h-10 rounded-lg bg-card text-sm"
        />
        <Button type="submit" disabled={!name.trim()} className="h-10 rounded-lg px-3 text-xs">
          <Plus className="size-3.5" /> Añadir
        </Button>
        <NativeSelect
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
          className="col-span-2 w-full [&_select]:h-10 [&_select]:rounded-lg [&_select]:bg-card [&_select]:text-xs"
        >
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={onlyStocked}
          onChange={(event) => setOnlyStocked(event.target.checked)}
          className="size-4 accent-primary"
        />
        Mostrar solo productos con existencias o mínimo
      </label>
      {status && (
        <p className="mt-2 text-xs font-semibold" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
