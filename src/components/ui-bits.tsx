import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

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
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium",
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
      <div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        <h1 className="text-xl font-bold">{title}</h1>
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
}: {
  children: ReactNode;
  className?: string | undefined;
  title?: string | undefined;
  icon?: typeof ArrowUpRight | undefined;
  action?: ReactNode;
}) {
  return (
    <div className={cn("card-soft p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4" strokeWidth={1.6} />}
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
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
    <div className="rounded-3xl bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-lg font-bold tracking-tight md:text-xl",
          tone === "danger" && "text-danger-soft-foreground",
          tone === "ok" && "text-success-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
  soft: "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40",
  ghost:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  danger:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-danger-soft px-3 text-xs font-medium text-danger-soft-foreground",
  icon: "grid h-9 w-9 place-items-center rounded-full bg-surface text-foreground transition-colors hover:bg-accent",
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
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="px-1 text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="px-1 text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-2xl bg-surface px-3.5 text-sm outline-hidden ring-ring placeholder:text-muted-foreground focus:ring-2";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function NumberInput({
  value,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      {...rest}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cn(inputCls, "text-right tabular-nums", rest.className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, "appearance-none pr-8", props.className)} />;
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
      className="flex items-center gap-2 text-sm"
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
    <div className="inline-flex flex-wrap gap-1 rounded-full bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
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
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean | undefined;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-card shadow-soft outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="flex items-center justify-between px-6 pt-5">
            <DialogPrimitive.Title className="text-base font-bold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className={btn.icon} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          <div className="overflow-y-auto px-6 pb-6 pt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground">{text}</p>
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground">
            {head.map((h, i) => {
              const o = typeof h === "string" ? { label: h, right: false } : h;
              return (
                <th key={i} className={cn("pb-2 pr-3 font-normal", o.right && "text-right")}>
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
