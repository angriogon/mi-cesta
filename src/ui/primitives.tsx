import { clsx, type ClassValue } from "clsx";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { twMerge } from "tailwind-merge";
import { CATEGORIES, type Category } from "../domain/categories";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Botones al estilo iOS: relleno para la acción principal, tintado para las secundarias. */
const VARIANTS = {
  default: "bg-primary text-primary-foreground",
  outline: "bg-card text-primary",
  secondary: "bg-primary-soft text-primary",
  ghost: "text-primary",
  destructive: "bg-danger-soft text-danger",
  link: "text-primary",
} as const;

const SIZES = {
  default: "h-11 gap-1.5 px-4 text-[15px]",
  xs: "h-7 gap-1 rounded-md px-2.5 text-xs",
  sm: "h-9 gap-1 rounded-md px-3 text-[13px]",
  lg: "h-12 gap-2 px-5 text-[17px]",
  icon: "size-11",
  "icon-sm": "size-9 rounded-md",
  "icon-lg": "size-12",
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
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-opacity outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:opacity-60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
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
        "h-11 w-full min-w-0 rounded-lg border border-transparent bg-card px-3 text-[17px] transition-shadow outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50",
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
    <div
      className={cn("group/native-select relative w-fit has-[select:disabled]:opacity-50", className)}
      data-size={size}
    >
      <select
        data-size={size}
        className="h-11 w-full min-w-0 appearance-none rounded-lg bg-card py-1 pr-8 pl-3 text-[15px] outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none data-[size=sm]:h-8 data-[size=sm]:rounded-md data-[size=sm]:py-0.5"
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
export function CategorySelect({
  value,
  onChange,
  label,
}: {
  value: Category;
  onChange: (value: Category) => void;
  label: string;
}) {
  return (
    <NativeSelect
      size="sm"
      value={value}
      onChange={(event) => onChange(event.target.value as Category)}
      aria-label={label}
      className="max-w-full [&_select]:h-7 [&_select]:bg-fill [&_select]:pl-2.5 [&_select]:pr-7 [&_select]:text-xs [&_select]:font-medium [&_select]:text-foreground"
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
    <div className="flex items-center rounded-lg bg-fill">
      <button
        type="button"
        aria-label={`Reducir ${label}`}
        onClick={onMinus}
        disabled={minusDisabled}
        className="flex h-8 w-9 items-center justify-center text-foreground active:opacity-40 disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-6 text-center text-[15px] font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        onClick={onPlus}
        className="flex h-8 w-9 items-center justify-center text-foreground active:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-14 text-center">
      <div className="mb-3 text-muted-foreground/70 [&_svg]:size-12 [&_svg]:stroke-[1.5]">{icon}</div>
      <h2 className="text-[22px] font-bold">{title}</h2>
      <p className="mt-1 max-w-72 text-[15px] leading-5 text-muted-foreground">{text}</p>
    </section>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} />;
}
