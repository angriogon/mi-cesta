import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { myHouseholds, type Account } from "../../app/account";
import type { CestaApi } from "../../data/api";
import { reportError } from "../../lib/errors";
import { todayIso } from "../../lib/text";
import { Button, Input } from "../../ui/primitives";

/** Entrega el archivo: hoja de compartir del iPhone (Guardar en Archivos, AirDrop…) o descarga normal. */
async function deliver(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportPage({ api, account }: { api: CestaApi; account: Account }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      const [data, households] = await Promise.all([
        api.exportHousehold(),
        account.mode === "supabase" ? myHouseholds() : Promise.resolve([]),
      ]);
      const content = JSON.stringify({ account: { email: account.email, households }, ...data }, null, 2);
      await deliver(new File([content], `cesta-mis-datos-${todayIso()}.json`, { type: "application/json" }));
      setMessage("Copia preparada.");
    } catch (error) {
      reportError(error, "exportar datos");
      setMessage("No se ha podido preparar la copia. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Exportar mis datos</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Descarga una copia completa de tu cuenta y del hogar que tienes abierto: productos, almacén, caducidades,
        listas, tickets con sus líneas, precios, la mascota y el historial. Es un archivo JSON que puedes guardar o
        abrir con otras aplicaciones. Las fotos de los tickets no van dentro; puedes verlas desde cada ticket.
      </p>
      <Button onClick={() => void exportData()} disabled={busy} className="mt-4 h-11 w-full rounded-xl">
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} Descargar copia
      </Button>
      {message && (
        <p className="mt-3 text-xs font-semibold text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

export function DeleteAccountPage({ account }: { account: Account }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="text-lg font-semibold text-danger">Eliminar cuenta</h2>
      <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>Se borra tu cuenta ({account.email}) y sales de todos tus hogares:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Los hogares en los que eres el único miembro se borran con todos sus datos y fotos.</li>
          <li>Los hogares compartidos siguen funcionando para los demás miembros.</li>
        </ul>
        <p>No se puede deshacer. Si quieres conservar una copia, usa antes «Exportar mis datos».</p>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          try {
            await account.deleteAccount(password);
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No se ha podido eliminar la cuenta.");
            setBusy(false);
          }
        }}
        className="mt-4 space-y-3"
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña de tu cuenta"
          aria-label="Contraseña de tu cuenta"
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
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Eliminar mi cuenta
        </Button>
      </form>
    </section>
  );
}
