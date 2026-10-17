import { clsx, type ClassValue } from "clsx";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { CATEGORIES, type Category } from "../domain/categories";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline:
    "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
  secondary: "bg-secondary text-secondary-foreground",
  ghost: "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
  destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

const SIZES = {
  default: "h-8 gap-1.5 px-2.5",
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem]",
  lg: "h-9 gap-1.5 px-2.5",
  icon: "size-8",
  "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)]",
  "icon-lg": "size-9",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
});

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "default" | "sm";
}

export function NativeSelect({ className, size = "default", children, ...props }: NativeSelectProps) {
  return (
    <div className={cn("group/native-select relative w-fit has-[select:disabled]:opacity-50", className)} data-size={size}>
      <select
        data-size={size}
        className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
      />
    </div>
  );
}

/** Selector compacto de categoría usado en las listas y el catálogo. */
export function CategorySelect({ value, onChange, label }: { value: Category; onChange: (value: Category) => void; label: string }) {
  return (
    <NativeSelect
      size="sm"
      value={value}
      onChange={(event) => onChange(event.target.value as Category)}
      aria-label={label}
      className="max-w-full [&_select]:h-6 [&_select]:border-0 [&_select]:bg-muted [&_select]:pl-2 [&_select]:pr-6 [&_select]:text-[10px] [&_select]:font-semibold [&_select]:text-muted-foreground"
    >
      {CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </NativeSelect>
  );
}

export function Stepper({
  value,
  label,
  onMinus,
  onPlus,
  minusDisabled,
}: {
  value: number;
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-lg bg-muted p-0.5">
      <button
        type="button"
        aria-label={`Reducir ${label}`}
        onClick={onMinus}
        disabled={minusDisabled}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground active:bg-card disabled:opacity-35"
      >
        <Minus className="size-3" />
      </button>
      <span className="w-5 text-center text-xs font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        onClick={onPlus}
        className="flex size-8 items-center justify-center rounded-md text-primary active:bg-card"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-[22px] bg-muted text-primary">{icon}</div>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-64 text-sm leading-6 text-muted-foreground">{text}</p>
    </section>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} />;
}
