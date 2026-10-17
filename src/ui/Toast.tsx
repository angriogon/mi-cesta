import { copy } from "../copy/es";
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-[440px] items-center gap-2 rounded-xl bg-card py-2 pr-1.5 pl-4 text-[0.9375rem] text-foreground shadow-float"
      >
        <span className="min-w-0 flex-1">{state.message}</span>
        {state.action && (
          <button
            type="button"
            onClick={() => {
              state.action?.onClick();
              onDismiss();
            }}
            className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-primary active:opacity-40"
          >
            {state.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={copy.common.closeNotice}
          className="flex size-9 shrink-0 items-center justify-center text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
