import { useState } from "react";
import type { CestaApi } from "../../data/api";
import { Button, Input } from "../../ui/primitives";

export function PricesPage({
  api,
  postalCode,
  onSaved,
}: {
  api: CestaApi;
  postalCode: string;
  onSaved: (postalCode: string) => void;
}) {
  const [value, setValue] = useState(postalCode);
  const [error, setError] = useState("");
  return (
    <section>
      <h2 className="text-lg font-semibold">Precios</h2>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">
        Cesta aprende los precios de tus tickets. Con tu código postal también consulta los precios de fruta y verdura
        de Mercadona en tu zona.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.setPostalCode(value);
            onSaved(value.trim());
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No se ha podido guardar.");
          }
        }}
        className="mt-4 space-y-3"
      >
        <label className="block text-xs font-semibold text-muted-foreground">
          Código postal
          <Input
            value={value}
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
            placeholder="41300"
            className="mt-1 h-11 rounded-xl text-sm"
          />
        </label>
        {error && (
          <p className="text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full rounded-xl">
          Guardar
        </Button>
      </form>
    </section>
  );
}
