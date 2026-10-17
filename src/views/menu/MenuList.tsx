import { ChevronRight, LoaderCircle } from "lucide-react";
import { type ReactNode } from "react";

/** Grupo de filas al estilo de Ajustes de iOS. */
export function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl bg-card">{children}</div>;
}

/** Fila de menú: icono en cuadradito de color, texto y chevron; las destructivas van en rojo y sin icono de color. */
export function MenuButton({
  icon,
  children,
  onClick,
  disabled,
  tile,
  tone,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tile?: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 pl-3.5 text-left text-[1.0625rem] active:bg-fill disabled:opacity-60"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-[17px] ${tone === "danger" ? "text-danger" : `text-white ${tile ?? "bg-primary"}`}`}
      >
        {disabled ? <LoaderCircle className="animate-spin" /> : icon}
      </span>
      <span
        className={`flex min-h-11 flex-1 items-center justify-between gap-2 border-separator pr-3 group-not-first:border-t-[0.5px] ${tone === "danger" ? "text-danger" : ""}`}
      >
        {children}
        {tone !== "danger" && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
      </span>
    </button>
  );
}
