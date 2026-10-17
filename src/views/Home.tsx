import { Gauge, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Overview } from "../domain/autocesta";
import type { StockLike } from "../domain/lists";
import type { Mode } from "../data/types";
import { formatCents } from "../lib/text";

type Answer = "yes" | "little" | "no" | "unknown";

function expiryText(lot: Overview["expiring"][number]): string {
  const prefix = lot.estimated ? "Estimado · " : "";
  if (lot.daysUntil < 0) return `${prefix}caducado hace ${-lot.daysUntil} ${lot.daysUntil === -1 ? "día" : "días"}`;
  if (lot.daysUntil === 0) return `${prefix}hoy`;
  if (lot.daysUntil === 1) return `${prefix}mañana`;
  return `${prefix}${lot.daysUntil} días`;
}

export function Home({
  data,
  stock,
  needs,
  onModeChange,
  onAnswer,
  onOpenExpiring,
  onOpenStock,
  onOpenPurchase,
  onUndo,
}: {
  data: Overview | null;
  stock: StockLike[];
  needs: StockLike[];
  onModeChange: (mode: Mode) => void;
  onAnswer: (productId: string, answer: Answer) => void;
  onOpenExpiring: () => void;
  onOpenStock: () => void;
  onOpenPurchase: () => void;
  onUndo: () => void;
}) {
  const [detail, setDetail] = useState<keyof Overview["weekly"]["details"] | null>(null);
  const question = data?.mode === "autocesta" ? data.questions[0] : undefined;
  const score = data?.tranquility.score ?? Math.max(0, 100 - needs.length * 7);
  const next = data?.expiring[0];
  const units = stock.reduce((sum, item) => sum + item.quantity, 0);
  const states = data?.stateSummary ?? { closed: 0, opened: 0, reserved: 0, cooked: 0, frozen: 0 };
  const weekly = [
    { key: "spend" as const, value: formatCents(data?.weekly.spendCents ?? 0), label: "gastado" },
    { key: "budget" as const, value: formatCents(data?.weekly.estimatedBudgetCents ?? 0), label: "presupuesto" },
    { key: "savings" as const, value: formatCents(data?.weekly.savingsCents ?? 0), label: "ahorro aprox." },
    { key: "waste" as const, value: String(data?.weekly.potentialWasteCount ?? 0), label: "en riesgo" },
  ];
  const recommendation = data?.mainRecommendation;
  const recommendationAction =
    recommendation?.type === "expired" || recommendation?.type === "expiry"
      ? onOpenExpiring
      : recommendation?.type === "needs"
        ? onOpenStock
        : undefined;

  return (
    <section
      className="flex min-h-[calc(100dvh-10.2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col gap-3 pt-1"
      aria-label="Resumen de Cesta"
    >
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Resumen de hoy</p>
          <h1 className="mt-1 truncate text-[21px] font-semibold">
            {data?.tranquility.label || "Preparando tu hogar…"}
          </h1>
        </div>
        <div className="flex shrink-0 rounded-xl bg-muted p-1" role="group" aria-label="Modo de funcionamiento">
          <button
            type="button"
            onClick={() => onModeChange("normal")}
            aria-pressed={data?.mode !== "autocesta"}
            className={`px-3 ${data?.mode === "autocesta" ? "h-8 rounded-[7px] text-[13px] font-medium text-foreground" : "h-8 rounded-[7px] bg-thumb text-[13px] font-semibold text-foreground shadow-thumb"}`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => onModeChange("autocesta")}
            aria-pressed={data?.mode === "autocesta"}
            className={`px-3 ${data?.mode === "autocesta" ? "h-8 rounded-[7px] bg-thumb text-[13px] font-semibold text-foreground shadow-thumb" : "h-8 rounded-[7px] text-[13px] font-medium text-foreground"}`}
          >
            AutoCesta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[6.2rem_1fr] gap-2">
        <div
          className="flex min-h-[106px] flex-col items-center justify-center rounded-xl bg-primary-soft text-primary"
          aria-label={`Índice de tranquilidad: ${score} de 100`}
        >
          <Gauge className="size-4" />
          <strong className="text-[30px] leading-9">{score}</strong>
          <span className="text-xs font-semibold uppercase">tranquilidad</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpenExpiring} className="rounded-xl bg-card p-3 text-left">
            <span className="text-xs font-semibold text-muted-foreground">
              {next && next.daysUntil < 0 ? "Caducado" : "Próximo a caducar"}
            </span>
            <strong className="mt-2 line-clamp-2 block text-[12px] leading-4">
              {next?.productName || "Nada urgente"}
            </strong>
            <span
              className={`mt-1.5 block text-xs font-semibold ${next && next.daysUntil <= 1 ? "text-danger" : "text-primary"}`}
            >
              {next ? expiryText(next) : "Todo en orden"}
            </span>
          </button>
          <button type="button" onClick={onOpenStock} className="rounded-xl bg-card p-3 text-left">
            <span className="text-xs font-semibold text-muted-foreground">Existencias totales</span>
            <strong className="mt-1 block text-[25px] leading-8">
              {Number.isInteger(units) ? units : units.toFixed(1)}
            </strong>
            <span className="text-xs font-semibold text-primary">Incluye todos los estados</span>
          </button>
        </div>
      </div>

      <section className="rounded-xl bg-warning-soft p-3">
        <button
          type="button"
          onClick={question ? undefined : (recommendationAction ?? onOpenPurchase)}
          disabled={Boolean(question)}
          className="flex w-full items-start gap-2 text-left disabled:opacity-100"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[12px] font-semibold leading-4">
              {question?.prompt || recommendation?.title || "Todo bajo control"}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-4 text-warning">
              {question?.reason || recommendation?.reason || "No hay decisiones urgentes."}
            </p>
          </div>
        </button>
        {question && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "yes")}
              className="h-10 rounded-lg bg-card text-xs font-semibold"
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "little")}
              className="h-10 rounded-lg bg-card text-xs font-semibold"
            >
              Poco
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "no")}
              className="h-10 rounded-lg bg-danger-soft text-xs font-semibold text-danger"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "unknown")}
              className="h-10 rounded-lg bg-muted text-xs font-semibold"
            >
              No sé
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-card p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Estado de tus alimentos</p>
          <button type="button" onClick={onOpenExpiring} className="-my-2 py-2 text-xs font-semibold text-primary">
            Ver detalle
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {(
            [
              ["closed", "Cerrado", "bg-muted text-primary  "],
              ["opened", "Abierto", "bg-warning-soft text-warning  "],
              ["frozen", "Congelado", "bg-info-soft text-info  "],
              ["cooked", "Cocinado", "bg-danger-soft text-danger  "],
            ] as const
          ).map(([key, label, tone]) => (
            <div key={key} className={`rounded-xl px-1 py-2 ${tone}`}>
              <strong className="block text-[14px]">{states[key]}</strong>
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1.5 px-1 text-xs font-semibold uppercase text-muted-foreground">Esta semana</p>
        <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-card p-2 text-center">
          {weekly.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDetail(detail === item.key ? null : item.key)}
              aria-expanded={detail === item.key}
              className={`rounded-xl px-1 py-2 ${detail === item.key ? "bg-muted" : ""}`}
            >
              <strong className="block truncate text-[12px]">{item.value}</strong>
              <span className="mt-0.5 block text-xs leading-3 text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </section>
      {detail && data && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-4 text-muted-foreground" role="status">
          {data.weekly.details[detail]}
        </p>
      )}
      {data && units === 0 && !data.expiring.length && (
        <button
          type="button"
          onClick={onOpenPurchase}
          className="rounded-xl border border-dashed border-primary/35 bg-card p-3 text-left text-xs leading-4 text-primary"
        >
          <b className="block">Empieza en 3 pasos</b>
          Añade lo que necesitas en Compra, guárdalo en el almacén al terminar y fotografía el ticket. Con eso Cesta
          aprende sola.
        </button>
      )}
      {data?.undo && (
        <button type="button" onClick={onUndo} className="self-end py-2 text-xs font-semibold text-muted-foreground">
          Deshacer · {data.undo.summary}
        </button>
      )}
    </section>
  );
}
