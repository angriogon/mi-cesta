import { Users } from "lucide-react";
import { type ReactNode } from "react";
import type { Activity } from "../../data/types";

export function PurchaseShell({
  stage,
  onStageChange,
  preparingCount,
  storeCount,
  activity,
  prepare,
  store,
}: {
  stage: "prepare" | "store";
  onStageChange: (stage: "prepare" | "store") => void;
  preparingCount: number;
  storeCount: number;
  activity: Activity[];
  prepare: ReactNode;
  store: ReactNode;
}) {
  return (
    <>
      <div
        className="purchase-stage-switch grid grid-cols-2 rounded-[9px] bg-fill p-0.5"
        role="tablist"
        aria-label="Estado de Compra"
      >
        <button
          type="button"
          role="tab"
          onClick={() => onStageChange("prepare")}
          aria-selected={stage === "prepare"}
          className={`${stage === "prepare" ? "h-8 rounded-[7px] bg-thumb text-[13px] font-semibold text-foreground shadow-thumb" : "h-8 rounded-[7px] text-[13px] font-medium text-foreground"}`}
        >
          Preparar · {preparingCount}
        </button>
        <button
          type="button"
          role="tab"
          onClick={() => onStageChange("store")}
          aria-selected={stage === "store"}
          className={`${stage === "store" ? "h-8 rounded-[7px] bg-thumb text-[13px] font-semibold text-foreground shadow-thumb" : "h-8 rounded-[7px] text-[13px] font-medium text-foreground"}`}
        >
          En tienda · {storeCount}
        </button>
      </div>
      {stage === "store" && activity.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-hidden rounded-xl bg-primary-soft px-3 py-2 text-primary">
          <Users className="size-3.5 shrink-0" />
          <p className="truncate text-xs font-semibold">
            {activity[0].deviceName} también está comprando · {activity[0].detail}
          </p>
        </div>
      )}
      {stage === "prepare" ? prepare : store}
    </>
  );
}
