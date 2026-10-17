import { type Nutrients } from "../../domain/recipes";

export function NutrientBars({ nutrients }: { nutrients: Nutrients }) {
  const rows: [string, number, number, string][] = [
    ["Proteínas", nutrients.protein, 50, "#2f6b48"],
    ["Hidratos", nutrients.carbs, 260, "#b88b3f"],
    ["Grasas", nutrients.fat, 70, "#a25631"],
    ["Fibra", nutrients.fiber, 25, "#658154"],
  ];
  return (
    <div className="mt-3 rounded-xl bg-muted/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Estimación por ración</p>
        <span className="text-xs font-semibold text-primary">{Math.round(nutrients.kcal)} kcal</span>
      </div>
      <div className="space-y-2">
        {rows.map(([label, value, daily, color]) => (
          <div key={label} className="grid grid-cols-[4.2rem_1fr_2.7rem] items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-card" role="presentation">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, (value / daily) * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums">{Math.round(value)} g</span>
          </div>
        ))}
      </div>
    </div>
  );
}
