import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

export type Notify = (message: string, action?: ToastAction) => void;

export function useToast() {
  const [state, setState] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const show = useCallback<Notify>((message, action) => {
    counter.current += 1;
    setState({ id: counter.current, message, action });
  }, []);
  const hide = useCallback(() => setState(null), []);
  return { state, show, hide };
}

/** Aviso breve encima de la barra inferior; con acción opcional (por ejemplo, «Deshacer»). */
export function Toast({ state, onDismiss }: { state: ToastState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(onDismiss, state.action ? 5000 : 3200);
    return () => window.clearTimeout(timer);
  }, [state, onDismiss]);

  if (!state) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-[440px] items-center gap-2 rounded-2xl bg-[#1d2b22] px-3.5 py-2.5 text-xs font-semibold text-white shadow-[0_14px_36px_rgba(20,35,25,.28)] dark:bg-card dark:text-foreground"
      >
        <span className="min-w-0 flex-1">{state.message}</span>
        {state.action && (
          <button
            type="button"
            onClick={() => {
              state.action?.onClick();
              onDismiss();
            }}
            className="shrink-0 rounded-lg px-2 py-1.5 font-bold text-[#a7d7b5]"
          >
            {state.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="flex size-7 shrink-0 items-center justify-center opacity-70"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
