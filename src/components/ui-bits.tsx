import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/*
 * Piezas de interfaz compartidas. Reglas de consistencia:
 * - Botones: h-10 para acciones de página, h-9 para acciones dentro de tablas/listas.
 * - Campos: etiqueta de una línea arriba, campo de 40px, pista de una línea abajo (opcional).
 * - Tarjetas: padding 20px, título de 14px, acción a la derecha alineada al título.
 */

export type Tone = "danger" | "dark" | "ok" | "muted";

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: Tone | undefined;
  className?: string | undefined;
}) {
  const cls =
    tone === "danger"
      ? "bg-danger-soft text-danger-soft-foreground"
      : tone === "dark"
        ? "bg-primary text-primary-foreground"
        : tone === "ok"
          ? "bg-success text-success-foreground"
          : "bg-surface text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium",
        cls,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  icon: Icon,
  action,
  subtitle,
}: {
  children: ReactNode;
  className?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  icon?: typeof ArrowUpRight | undefined;
  action?: ReactNode;
}) {
  return (
    <section className={cn("card-soft p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
              {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "danger" | "ok" | undefined;
}) {
  return (
    <div className="flex min-h-[104px] flex-col justify-between rounded-3xl bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div>
        <p
          className={cn(
            "text-lg font-bold tracking-tight md:text-xl",
            tone === "danger" && "text-danger-soft-foreground",
            tone === "ok" && "text-success-foreground",
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 min-h-4 text-[11px] text-muted-foreground">{sub ?? ""}</p>
      </div>
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
  soft: "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-accent disabled:opacity-40",
  ghost:
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  small:
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
  danger:
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-danger-soft px-3.5 text-xs font-medium text-danger-soft-foreground",
  icon: "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-foreground transition-colors hover:bg-accent",
};

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col", className)}>
      <span className="mb-1.5 block truncate px-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block truncate px-1 text-[11px] text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export const inputCls =
  "h-10 w-full min-w-0 rounded-2xl border border-transparent bg-surface px-3.5 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted-foreground focus:border-ring disabled:opacity-60 [.on-surface_&]:border-border [.on-surface_&]:bg-card";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

/** Campo numérico con prefijo/sufijo (ej. "$" … "/t", "%"). Vacío muestra 0 en gris. */
export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "prefix"> & {
  value: number;
  onChange: (n: number) => void;
  prefix?: string | undefined;
  suffix?: string | undefined;
}) {
  return (
    <span className={cn("relative block min-w-0", className)}>
      {prefix && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        {...rest}
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className={cn(
          inputCls,
          "text-right tabular-nums",
          prefix && "pl-7",
          suffix && "pr-9",
          className,
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </span>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={cn(inputCls, "appearance-none pr-9", props.className)} />
      <svg
        className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-10 items-center gap-2 text-sm"
    >
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex h-10 flex-wrap items-center gap-1 rounded-full bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-full px-3.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean | undefined;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-card shadow-soft outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-bold leading-tight">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={subtitle ? "mt-0.5 text-xs text-muted-foreground" : "sr-only"}
              >
                {subtitle ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className={btn.icon} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Estado vacío con una acción clara. */
export function Empty({
  title,
  text,
  action,
}: {
  title?: string | undefined;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-6 py-10 text-center">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

/** Bloque de formulario con título, dentro de un modal o tarjeta. */
export function FormSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("on-surface rounded-3xl bg-surface p-4", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold">{title}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Table({
  head,
  children,
  min = 520,
}: {
  head: (string | { label: string; right?: boolean })[];
  children: ReactNode;
  min?: number;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground">
            {head.map((h, i) => {
              const o = typeof h === "string" ? { label: h, right: false } : h;
              return (
                <th key={i} className={cn("pb-2 pr-3 font-medium", o.right && "text-right")}>
                  {o.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const tr = "border-t border-border align-middle [&>td]:py-2.5 [&>td]:pr-3";
