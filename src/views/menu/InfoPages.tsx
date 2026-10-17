import { copy } from "../../copy/es";
import { useState, type FormEvent } from "react";
import type { CestaApi } from "../../data/api";
import type { Preferences } from "../../data/types";
import { reportError } from "../../lib/errors";
import { Button, Input } from "../../ui/primitives";

export function NewsPage({ version }: { version: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Novedades</h2>
      <div className="mt-4 rounded-xl bg-card p-4">
        <p className="text-xs font-semibold text-primary">Versión {version}</p>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          <li>• Cuentas y hogares compartidos: toda la familia ve la misma lista al momento.</li>
          <li>• Funciona sin conexión y se instala en la pantalla de inicio.</li>
          <li>• Caducidades editables: pon la fecha más tarde o retira lo gastado.</li>
          <li>• Deshacer al borrar productos y al vaciar la lista.</li>
          <li>• Los tickets guardan sus líneas y aprenden tus correcciones.</li>
          <li>• Modo oscuro y mejoras de accesibilidad.</li>
        </ul>
      </div>
      <div className="mt-3 rounded-xl bg-card p-4">
        <p className="text-xs font-semibold">Versión 4</p>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          <li>• Inventario rápido por zonas, voz, tickets, cámara y fotografías.</li>
          <li>• Memoria de consumo y caducidades estimadas.</li>
          <li>• Sugerencias silenciosas explicadas y controlables.</li>
          <li>• Compra provisional conciliada con el ticket para evitar duplicados.</li>
          <li>• Recetas encadenadas con tiempos e instrucciones realistas.</li>
        </ul>
      </div>
    </section>
  );
}

const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Perfil alimentario del hogar: alérgenos y alimentos a evitar, que las recetas marcan. */
export function DietPage({ api, preferences }: { api: CestaApi; preferences: Preferences }) {
  const [diet, setDiet] = useState({
    enabled: preferences.specialDietEnabled,
    allergens: preferences.allergens.join(", "),
    avoided: preferences.avoided.join(", "),
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.savePreferences({
        specialDietEnabled: diet.enabled,
        allergens: split(diet.allergens),
        avoided: split(diet.avoided),
      });
      setMessage("Perfil alimentario guardado.");
    } catch (error) {
      reportError(error, "perfil alimentario");
      setMessage(copy.errors.saveShort);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Alimentación especial</h2>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">
        Con el perfil activo, las recetas marcan los ingredientes que coinciden. Desactivado no se muestra ningún aviso.
      </p>
      <form onSubmit={(event) => void save(event)} className="mt-4 space-y-3">
        <label className="flex items-center justify-between rounded-xl bg-muted p-3 text-xs font-semibold">
          Activar perfil
          <input
            type="checkbox"
            checked={diet.enabled}
            onChange={(event) => setDiet({ ...diet, enabled: event.target.checked })}
            className="size-5 accent-primary"
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Alérgenos
          <Input
            value={diet.allergens}
            onChange={(event) => setDiet({ ...diet, allergens: event.target.value })}
            placeholder="gluten, leche, frutos secos"
            className="mt-1 h-11 rounded-xl text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Alimentos a evitar
          <Input
            value={diet.avoided}
            onChange={(event) => setDiet({ ...diet, avoided: event.target.value })}
            placeholder="cerdo, alcohol…"
            className="mt-1 h-11 rounded-xl text-sm"
          />
        </label>
        {message && (
          <p className="text-xs font-semibold text-muted-foreground" role="status">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
          Guardar perfil
        </Button>
      </form>
    </section>
  );
}
