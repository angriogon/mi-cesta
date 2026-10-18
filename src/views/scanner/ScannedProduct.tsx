import { Camera, RotateCcw } from "lucide-react";
import type { ParsedCode } from "../../domain/barcode";
import { storeForBrand } from "../../domain/stores";
import type { BarcodeProduct } from "../../data/types";
import { Button } from "../../ui/primitives";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** Producto identificado: nombre, marca y cadena, datos de la etiqueta, alérgenos y nutrientes. */
export function ScannedProduct({
  product,
  parsed,
  continuous,
  onUse,
  onAnother,
  onCorrect,
}: {
  product: BarcodeProduct;
  parsed: ParsedCode | null;
  continuous: boolean;
  onUse: () => void;
  onAnother: () => void;
  onCorrect: () => void;
}) {
  const store = storeForBrand(product.brand);
  const label = [
    parsed?.weightGrams ? `${(parsed.weightGrams / 1000).toLocaleString("es-ES")} kg` : "",
    parsed?.priceCents ? euro.format(parsed.priceCents / 100) : "",
  ].filter(Boolean);
  return (
    <>
      <div className="flex gap-3">
        {product.image ? (
          <img src={product.image} alt="" className="size-16 rounded-xl bg-card object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-xl bg-muted">
            <Camera className="size-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{product.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[product.brand, product.quantity].filter(Boolean).join(" · ")}
          </p>
          {store && <p className="mt-0.5 text-xs font-semibold text-primary">Marca propia de {store}</p>}
          {label.length > 0 && <p className="mt-0.5 text-xs font-semibold">En la etiqueta: {label.join(" · ")}</p>}
          {product.source && <p className="mt-1 text-xs font-semibold text-muted-foreground">{product.source}</p>}
          {product.allergens.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-danger">Alérgenos: {product.allergens.join(", ")}</p>
          )}
        </div>
      </div>
      {Object.values(product.nutrients).some(Boolean) && (
        <div className="mt-3 grid grid-cols-5 gap-1 rounded-xl bg-muted p-2 text-center">
          {(
            [
              ["kcal", product.nutrients.kcal],
              ["prot.", product.nutrients.protein],
              ["hidr.", product.nutrients.carbs],
              ["grasas", product.nutrients.fat],
              ["fibra", product.nutrients.fiber],
            ] as const
          ).map(([name, value]) => (
            <div key={name}>
              <p className="text-xs font-semibold">{Math.round(Number(value))}</p>
              <p className="text-xs uppercase text-muted-foreground">{name}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
        <Button variant="outline" onClick={onAnother} className="h-12 rounded-xl">
          <RotateCcw className="size-4" /> Otro
        </Button>
        <Button onClick={onUse} className="h-12 rounded-xl">
          {continuous ? "Añadir y seguir" : "Usar este producto"}
        </Button>
      </div>
      <Button variant="ghost" onClick={onCorrect} className="mt-1 h-11 w-full rounded-xl text-xs">
        ¿No es este? Corregir el nombre
      </Button>
    </>
  );
}
