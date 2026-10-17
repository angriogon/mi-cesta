import { X } from "lucide-react";
import type { LegalDocument } from "../../copy/legal";
import { LegalPage } from "./LegalPage";

/** Textos legales a pantalla completa, para leerlos antes de tener cuenta. */
export function LegalSheet({ initial, onClose }: { initial: LegalDocument["id"]; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Textos legales"
      className="fixed inset-0 z-50 overflow-y-auto bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-[560px]">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-11 items-center justify-center rounded-full bg-card"
          >
            <X className="size-5" />
          </button>
        </div>
        <LegalPage initial={initial} />
      </div>
    </div>
  );
}
