import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  Calculator,
  CreditCard,
  FileCheck2,
  FileText,
  Lock,
  MapPin,
  Package,
  Plus,
  Receipt,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { clientBalance, feeFor, useStore } from "@/lib/store";
import {
  addDays,
  ars,
  dayOf,
  daysBetween,
  fmtDate,
  fmtDateLong,
  fmtTime,
  todayISO,
} from "@/lib/format";
import { qtyUnit } from "@/lib/pricing";
import { buildAlerts, type AlertKind } from "@/lib/alerts";
import { Badge, type Tone } from "@/components/ui-bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio · Áridos Petreos" },
      {
        name: "description",
        content: "Resumen del día, ventas, cobros, cheques, entregas y avisos del corralón.",
      },
      { property: "og:title", content: "Inicio · Áridos Petreos" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const alertIcons: Record<AlertKind, LucideIcon> = {
  stock: Package,
  cuota: Wallet,
  cheque: CalendarClock,
  presupuesto: FileText,
  liquidacion: CreditCard,
  debito: Receipt,
  entrega: Truck,
};
const methodIcon = (method: string): LucideIcon =>
  method === "efectivo"
    ? Banknote
    : method === "cheque"
      ? FileCheck2
      : method === "transferencia"
        ? Building2
        : CreditCard;

/** Lo que la dueña hace todos los días, a un toque. */
const quick = [
  { to: "/nueva-venta", icon: Plus, t: "Nueva venta", d: "Mostrador o presupuesto", dark: true },
  { to: "/clientes", icon: Wallet, t: "Cobrar", d: "Cuotas y cuenta corriente" },
  { to: "/gastos", icon: Receipt, t: "Gasto o débito", d: "De qué cuenta salió" },
  { to: "/stock", icon: ArrowDownToLine, t: "Entró mercadería", d: "Suma stock y actualiza costo" },
  { to: "/catalogo", icon: Calculator, t: "Precios", d: "Calculadora y catálogo" },
  { to: "/cierre", icon: Lock, t: "Cerrar el día", d: "Cierre de lote y caja" },
] as const;

function Index() {
  const { db, setDeliveryDone } = useStore();
  const today = todayISO();
  const todaySales = useMemo(
    () => db.sales.filter((s) => dayOf(s.date) === today),
    [db.sales, today],
  );
  const openSales = db.sales.filter((s) => !s.closureId);
  const salesTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const profit = todaySales.reduce(
    (a, s) => a + s.subtotal - s.cost - s.payments.reduce((b, p) => b + feeFor(db, p), 0),
    0,
  );
  const collected = todaySales
    .flatMap((s) => s.payments)
    .filter((p) => p.method !== "cta_cte" && p.method !== "cheque")
    .reduce((a, p) => a + p.amount, 0);
  const toCollect = db.dues
    .filter((d) => d.paid < d.amount)
    .reduce((a, d) => a + d.amount - d.paid, 0);
  const debtors = db.clients.filter((c) => clientBalance(db, c.id).balance > 0).length;

  const payments = useMemo(() => {
    const m = new Map<
      string,
      { label: string; method: string; bank: string; gross: number; fee: number }
    >();
    for (const s of openSales)
      for (const p of s.payments) {
        const cfg = db.settings.methods.find(
          (x) =>
            x.method === p.method && x.bank === p.bank && (x.gateway ?? "") === (p.gateway ?? ""),
        );
        const label = cfg?.label ?? p.method;
        const g = m.get(label) ?? {
          label,
          method: p.method,
          bank: p.method === "cheque" ? "Cartera" : p.method === "cta_cte" ? "Cta. cte." : p.bank,
          gross: 0,
          fee: 0,
        };
        g.gross += p.amount;
        g.fee += feeFor(db, p);
        m.set(label, g);
      }
    return [...m.values()].sort((a, b) => b.gross - a.gross);
  }, [openSales, db]);

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6);
        return {
          d:
            i === 6
              ? "Hoy"
              : new Date(d + "T12:00:00")
                  .toLocaleDateString("es-AR", { weekday: "short" })
                  .replace(".", ""),
          v: db.sales.filter((s) => dayOf(s.date) === d).reduce((a, s) => a + s.total, 0),
        };
      }),
    [db.sales, today],
  );
  const maxWeek = Math.max(1, ...week.map((w) => w.v));

  const activity = useMemo(() => {
    const quotes = db.quotes
      .filter(
        (q) => q.status === "enviado" || q.status === "seguimiento" || q.status === "borrador",
      )
      .map((q) => ({
        id: q.id,
        client: q.clientName,
        title: `Presupuesto · ${q.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}`,
        date: q.date,
        amount: q.total,
        tone: ((q.followUp ?? q.validUntil) <= today ? "danger" : "dark") as Tone,
        status: (q.followUp ?? q.validUntil) <= today ? "Llamar hoy" : "Enviado",
        note: q.note ?? `Vence el ${fmtDate(q.validUntil)}`,
        to: "/presupuestos" as const,
      }));
    const sales = db.sales.slice(0, 6).map((s) => ({
      id: s.id,
      client: s.clientName,
      title: `Venta · ${s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}`,
      date: s.date,
      amount: s.total,
      tone: (s.payments.some((p) => p.method === "cta_cte")
        ? "dark"
        : s.payments.some((p) => p.method === "cheque")
          ? "danger"
          : "ok") as Tone,
      status: s.payments.some((p) => p.method === "cta_cte")
        ? "Cta. cte."
        : s.payments.some((p) => p.method === "cheque")
          ? "Cheque"
          : "Pagado",
      note: s.payments
        .map(
          (p) =>
            db.settings.methods.find(
              (x) =>
                x.method === p.method &&
                x.bank === p.bank &&
                (x.gateway ?? "") === (p.gateway ?? ""),
            )?.label ?? p.method,
        )
        .join(" + "),
      to: "/ventas" as const,
    }));
    return [...quotes, ...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [db, today]);

  const cheques = db.cheques
    .filter((c) => c.status === "cartera" || c.status === "depositado")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const deliveries = db.sales
    .filter((s) => s.delivery && !s.delivery.done && s.delivery.date <= today)
    .slice(0, 4);
  const dueSoon = db.dues
    .filter((d) => d.paid < d.amount && d.dueDate <= addDays(today, 7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const alerts = useMemo(() => buildAlerts(db), [db]);
  const firstRun = db.products.filter((p) => p.active).length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Cabecera del día */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{fmtDateLong(today)}</p>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">Hoy en el corralón</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          {openSales.length
            ? `${openSales.length} ventas sin cerrar`
            : "Sin ventas pendientes de cierre"}
        </p>
      </div>

      {firstRun && <FirstSteps />}

      {/* Acciones del día a día */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {quick.map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className={`group flex min-h-[96px] flex-col justify-between rounded-3xl p-4 transition-all hover:-translate-y-0.5 ${"dark" in q && q.dark ? "bg-primary text-primary-foreground" : "bg-card shadow-soft"}`}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-full ${"dark" in q && q.dark ? "bg-primary-foreground/15" : "bg-surface"}`}
            >
              <q.icon className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">{q.t}</span>
              <span
                className={`block text-[11px] ${"dark" in q && q.dark ? "opacity-70" : "text-muted-foreground"}`}
              >
                {q.d}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Centro */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card-soft flex flex-col gap-6 p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                {
                  l: "Ventas de hoy",
                  v: salesTotal,
                  s: `${todaySales.length} ${todaySales.length === 1 ? "operación" : "operaciones"}`,
                },
                {
                  l: "Ganancia estimada",
                  v: profit,
                  s: salesTotal
                    ? `${Math.round((profit / salesTotal) * 100)}% de margen`
                    : "sin ventas aún",
                },
                {
                  l: "Cobrado hoy",
                  v: collected,
                  s: salesTotal ? `${Math.round((collected / salesTotal) * 100)}% del total` : "",
                },
                {
                  l: "A cobrar (cta. cte.)",
                  v: toCollect,
                  s: `${debtors} ${debtors === 1 ? "cliente" : "clientes"}`,
                },
              ].map((k) => (
                <div
                  key={k.l}
                  className="flex min-h-[104px] flex-col justify-between rounded-3xl bg-surface p-4"
                >
                  <p className="text-xs text-muted-foreground">{k.l}</p>
                  <div>
                    <p className="text-lg font-bold tracking-tight md:text-xl">{ars(k.v)}</p>
                    <p className="mt-0.5 min-h-4 text-[11px] text-muted-foreground">{k.s}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" strokeWidth={1.6} />
                  <h2 className="text-sm font-semibold">Dónde está la plata</h2>
                </div>
                <Link to="/cierre" className="text-xs text-muted-foreground hover:text-foreground">
                  Ver cierre
                </Link>
              </div>
              {payments.length === 0 ? (
                <p className="rounded-2xl bg-surface px-4 py-5 text-center text-sm text-muted-foreground">
                  Cuando haya ventas, acá ves cuánto hay en efectivo, en cada banco, en cheques y en
                  cuenta corriente.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted-foreground">
                        <th className="pb-2 font-medium">Medio</th>
                        <th className="pb-2 text-right font-medium">Bruto</th>
                        <th className="pb-2 text-right font-medium">Comisión</th>
                        <th className="pb-2 text-right font-medium">Neto</th>
                        <th className="pb-2 text-right font-medium">Está en</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const Icon = methodIcon(p.method);
                        return (
                          <tr key={p.label} className="border-t border-border">
                            <td className="py-2.5">
                              <span className="flex items-center gap-2">
                                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface">
                                  <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                                </span>
                                {p.label}
                              </span>
                            </td>
                            <td className="text-right tabular-nums">{ars(p.gross)}</td>
                            <td className="text-right tabular-nums text-muted-foreground">
                              {p.fee ? `− ${ars(p.fee)}` : "—"}
                            </td>
                            <td className="text-right font-semibold tabular-nums">
                              {ars(p.gross - p.fee)}
                            </td>
                            <td className="text-right text-muted-foreground">{p.bank}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Ventas de los últimos 7 días</h2>
                <Link
                  to="/reportes"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Ver reportes
                </Link>
              </div>
              <div className="flex h-36 items-end gap-3">
                {week.map((w, i) => (
                  <div
                    key={i}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {w.v ? `$${(w.v / 1e6).toFixed(1)}M` : ""}
                    </span>
                    <div
                      className={`w-full max-w-10 rounded-full ${i === week.length - 1 ? "bg-primary" : "bg-surface"}`}
                      style={{ height: `${Math.max(3, (w.v / maxWeek) * 100)}%` }}
                    />
                    <span className="text-[11px] capitalize text-muted-foreground">{w.d}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Actividad reciente</h2>
              <Link to="/ventas" className="text-xs text-muted-foreground hover:text-foreground">
                Ver ventas
              </Link>
            </div>
            {activity.length === 0 ? (
              <p className="rounded-3xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
                Todavía no hay ventas ni presupuestos. Empezá por "Nueva venta".
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activity.map((a) => (
                  <Link key={a.id} to={a.to} className="card-soft group flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold">
                          {a.client[0]}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{a.client}</p>
                      </div>
                      <CornerArrow />
                    </div>
                    <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-snug">
                      {a.title}
                    </h3>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {dayOf(a.date) === today ? "Hoy" : fmtDate(a.date)} · {fmtTime(a.date)} ·{" "}
                      {a.note}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold tabular-nums">{ars(a.amount)}</span>
                      <Badge tone={a.tone}>{a.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Derecha */}
        <div className="grid gap-4 md:grid-cols-2 xl:flex xl:flex-col">
          <Widget title="Entregas de hoy" icon={Truck} link="/ventas">
            {deliveries.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay entregas pendientes para hoy.</p>
            )}
            {deliveries.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <button
                  role="switch"
                  aria-checked={false}
                  aria-label="Marcar entregado"
                  onClick={() => setDeliveryDone(s.id, true)}
                  className="relative h-6 w-10 shrink-0 rounded-full bg-border transition-colors"
                >
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-soft" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.6} />{" "}
                    {s.delivery!.address || s.clientName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.delivery!.zone} ·{" "}
                    {s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </Widget>

          <Widget title="Por cobrar" icon={Wallet} link="/clientes">
            {cheques.length + dueSoon.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay cheques ni cuotas por cobrar.</p>
            )}
            {cheques.map((c) => {
              const d = daysBetween(today, c.dueDate);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.clientName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Cheque {c.bank} ·{" "}
                      {d < 0 ? "vencido" : d === 0 ? "cobra hoy" : `cobra ${fmtDate(c.dueDate)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {ars(c.amount)}
                  </span>
                </div>
              );
            })}
            {dueSoon.map((d) => {
              const c = db.clients.find((x) => x.id === d.clientId);
              const late = d.dueDate < today;
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c?.name ?? "Cliente"}</p>
                    <p
                      className={`text-[11px] ${late ? "text-danger-soft-foreground" : "text-muted-foreground"}`}
                    >
                      Cuota {d.n}/{d.of} · {late ? "vencida" : `vence ${fmtDate(d.dueDate)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {ars(d.amount - d.paid)}
                  </span>
                </div>
              );
            })}
          </Widget>

          <Widget title="Avisos" icon={AlertTriangle} link="/notificaciones">
            {alerts.length === 0 && <p className="text-xs text-muted-foreground">Todo en orden.</p>}
            {alerts.slice(0, 4).map((a) => {
              const Icon = alertIcons[a.kind];
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{a.text}</p>
                  <Badge tone={a.urgent ? "danger" : "dark"}>
                    {a.urgent ? "Urgente" : "Pendiente"}
                  </Badge>
                </div>
              );
            })}
            {alerts.length > 4 && (
              <p className="text-[11px] text-muted-foreground">y {alerts.length - 4} más</p>
            )}
          </Widget>
        </div>
      </div>
    </div>
  );
}

function CornerArrow() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground transition-colors group-hover:bg-accent">
      <ArrowUpRight className="h-4 w-4" strokeWidth={1.6} />
    </span>
  );
}

function Widget({
  title,
  icon: Icon,
  link,
  children,
}: {
  title: string;
  icon: LucideIcon;
  link: "/caja" | "/ventas" | "/stock" | "/notificaciones" | "/clientes";
  children: React.ReactNode;
}) {
  return (
    <div className="card-soft group flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" strokeWidth={1.6} />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Link to={link} aria-label={`Ir a ${title}`}>
          <CornerArrow />
        </Link>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      <Link to={link} className="mt-1 text-xs text-muted-foreground hover:text-foreground">
        Ver todos
      </Link>
    </div>
  );
}

/** Guía de arranque: aparece hasta que haya productos cargados. */
function FirstSteps() {
  const { db } = useStore();
  const steps = [
    {
      to: "/configuracion" as const,
      t: "Configurá comisiones, fletes y gastos fijos",
      d: "Payway, BBVA, Provincia y las zonas de entrega",
      done: db.settings.methods.some((m) => m.gateway && m.feePct > 0),
    },
    {
      to: "/catalogo" as const,
      t: "Cargá tus productos con el precio del proveedor",
      d: "La calculadora arma el precio de venta con tu margen",
      done: db.products.some((p) => p.active),
    },
    {
      to: "/clientes" as const,
      t: "Sumá los clientes que compran a cuenta",
      d: "Opcional: los demás se crean solos al vender",
      done: db.clients.length > 0,
    },
  ];
  return (
    <div className="rounded-3xl bg-primary p-5 text-primary-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Primeros pasos</p>
        <p className="text-xs opacity-70">
          Tres cosas para dejar el sistema listo. Después, todo se maneja desde los botones de
          abajo.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <Link
            key={s.to}
            to={s.to}
            className={`flex min-h-[92px] flex-col rounded-2xl p-4 transition-opacity hover:opacity-90 ${s.done ? "bg-primary-foreground/10" : "bg-primary-foreground text-foreground"}`}
          >
            <p className={`text-[11px] ${s.done ? "opacity-70" : "text-muted-foreground"}`}>
              Paso {i + 1}
              {s.done ? " · listo" : ""}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug">{s.t}</p>
            <p className={`mt-1 text-[11px] ${s.done ? "opacity-70" : "text-muted-foreground"}`}>
              {s.d}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
