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
          <p className="text-[9px] font-bold uppercase tracking-[.14em] text-primary">Resumen de hoy</p>
          <h1 className="mt-1 truncate text-[21px] font-bold tracking-[-.045em]">
            {data?.tranquility.label || "Preparando tu hogar…"}
          </h1>
        </div>
        <div className="flex shrink-0 rounded-xl bg-muted p-1" role="group" aria-label="Modo de funcionamiento">
          <button
            type="button"
            onClick={() => onModeChange("normal")}
            aria-pressed={data?.mode !== "autocesta"}
            className={`h-9 rounded-lg px-2.5 text-[10px] font-bold ${data?.mode === "autocesta" ? "text-muted-foreground" : "bg-card text-primary shadow-sm"}`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => onModeChange("autocesta")}
            aria-pressed={data?.mode === "autocesta"}
            className={`h-9 rounded-lg px-2.5 text-[10px] font-bold ${data?.mode === "autocesta" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            AutoCesta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[6.2rem_1fr] gap-2">
        <div
          className="flex min-h-[106px] flex-col items-center justify-center rounded-[20px] border border-[#d8e5d9] bg-[#eaf3eb] text-[#20462f] dark:border-border dark:bg-secondary dark:text-secondary-foreground"
          aria-label={`Índice de tranquilidad: ${score} de 100`}
        >
          <Gauge className="size-4 opacity-70" />
          <strong className="text-[30px] leading-9 tracking-[-.06em]">{score}</strong>
          <span className="text-[8px] font-bold uppercase tracking-[.08em] opacity-65">tranquilidad</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenExpiring}
            className="rounded-[18px] border border-border bg-card p-3 text-left"
          >
            <span className="text-[9px] font-semibold text-muted-foreground">
              {next && next.daysUntil < 0 ? "Caducado" : "Próximo a caducar"}
            </span>
            <strong className="mt-2 line-clamp-2 block text-[12px] leading-4">
              {next?.productName || "Nada urgente"}
            </strong>
            <span
              className={`mt-1.5 block text-[9px] font-bold ${next && next.daysUntil <= 1 ? "text-[#a34141]" : "text-primary"}`}
            >
              {next ? expiryText(next) : "Todo en orden"}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenStock}
            className="rounded-[18px] border border-border bg-card p-3 text-left"
          >
            <span className="text-[9px] font-semibold text-muted-foreground">Existencias totales</span>
            <strong className="mt-1 block text-[25px] leading-8">
              {Number.isInteger(units) ? units : units.toFixed(1)}
            </strong>
            <span className="text-[9px] font-bold text-primary">Incluye todos los estados</span>
          </button>
        </div>
      </div>

      <section className="rounded-[18px] border border-[#e6dfcf] bg-[#faf7ef] p-3 dark:border-border dark:bg-card">
        <button
          type="button"
          onClick={question ? undefined : (recommendationAction ?? onOpenPurchase)}
          disabled={Boolean(question)}
          className="flex w-full items-start gap-2 text-left disabled:opacity-100"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#8b672f]" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[12px] font-bold leading-4">
              {question?.prompt || recommendation?.title || "Todo bajo control"}
            </p>
            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#76582b] dark:text-muted-foreground">
              {question?.reason || recommendation?.reason || "No hay decisiones urgentes."}
            </p>
          </div>
        </button>
        {question && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "yes")}
              className="h-10 rounded-lg bg-card text-[11px] font-bold dark:bg-muted"
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "little")}
              className="h-10 rounded-lg bg-card text-[11px] font-bold dark:bg-muted"
            >
              Poco
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "no")}
              className="h-10 rounded-lg bg-[#f8e8e4] text-[11px] font-bold text-[#983e38]"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onAnswer(question.productId, "unknown")}
              className="h-10 rounded-lg bg-muted text-[10px] font-bold"
            >
              No sé
            </button>
          </div>
        )}
      </section>

      <section className="rounded-[18px] border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold">Estado de tus alimentos</p>
          <button type="button" onClick={onOpenExpiring} className="-my-2 py-2 text-[10px] font-bold text-primary">
            Ver detalle
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {(
            [
              ["closed", "Cerrado", "bg-[#eef4ef] text-[#295b3f] dark:bg-[#1f2c23] dark:text-[#9fd0ae]"],
              ["opened", "Abierto", "bg-[#faf4e8] text-[#8a652d] dark:bg-[#2d271c] dark:text-[#e2c08a]"],
              ["frozen", "Congelado", "bg-[#eaf4f8] text-[#356b82] dark:bg-[#1b2a31] dark:text-[#93c4d9]"],
              ["cooked", "Cocinado", "bg-[#fbefeb] text-[#984b37] dark:bg-[#2f201c] dark:text-[#e6a490]"],
            ] as const
          ).map(([key, label, tone]) => (
            <div key={key} className={`rounded-xl px-1 py-2 ${tone}`}>
              <strong className="block text-[14px]">{states[key]}</strong>
              <span className="text-[9px]">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[.12em] text-muted-foreground">Esta semana</p>
        <div className="grid grid-cols-4 gap-1.5 rounded-[18px] border border-border bg-card p-2 text-center">
          {weekly.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDetail(detail === item.key ? null : item.key)}
              aria-expanded={detail === item.key}
              className={`rounded-xl px-1 py-2 ${detail === item.key ? "bg-muted" : ""}`}
            >
              <strong className="block truncate text-[12px]">{item.value}</strong>
              <span className="mt-0.5 block text-[8px] leading-3 text-muted-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </section>
      {detail && data && (
        <p className="rounded-xl bg-muted px-3 py-2 text-[10px] leading-4 text-muted-foreground" role="status">
          {data.weekly.details[detail]}
        </p>
      )}
      {data && units === 0 && !data.expiring.length && (
        <button
          type="button"
          onClick={onOpenPurchase}
          className="rounded-[18px] border border-dashed border-primary/35 bg-[#f3f7f3] p-3 text-left text-[11px] leading-4 text-primary dark:bg-card"
        >
          <b className="block">Empieza en 3 pasos</b>
          Añade lo que necesitas en Compra, guárdalo en el almacén al terminar y fotografía el ticket. Con eso Cesta
          aprende sola.
        </button>
      )}
      {data?.undo && (
        <button type="button" onClick={onUndo} className="self-end py-2 text-[10px] font-bold text-muted-foreground">
          Deshacer · {data.undo.summary}
        </button>
      )}
    </section>
  );
}
