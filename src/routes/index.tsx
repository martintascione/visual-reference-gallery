import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  CreditCard,
  FileCheck2,
  Lock,
  MapPin,
  Package,
  Truck,
  Wallet,
} from "lucide-react";
import logo from "@/assets/aridos-petreos-logo.png";
import { clientBalance, feeFor, useStore } from "@/lib/store";
import {
  addDays,
  ars,
  dayOf,
  daysBetween,
  fmtDate,
  fmtDateLong,
  fmtTime,
  num,
  todayISO,
} from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import { Badge, type Tone } from "@/components/ui-bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio · Panel del Corralón" },
      {
        name: "description",
        content: "Resumen del día, ventas, cobros, cheques, entregas y alertas del corralón.",
      },
      { property: "og:title", content: "Inicio · Panel del Corralón" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function CornerArrow() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground transition-colors group-hover:bg-accent">
      <ArrowUpRight className="h-4 w-4" strokeWidth={1.6} />
    </span>
  );
}

function Dots({ n = 3, active = 0 }: { n?: number; active?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full ${i === active ? "w-4 bg-primary" : "w-1 bg-border"}`}
        />
      ))}
    </div>
  );
}

const methodIcon = (method: string) =>
  method === "efectivo"
    ? Banknote
    : method === "cheque"
      ? FileCheck2
      : method === "transferencia"
        ? Building2
        : CreditCard;

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
        title: `Presupuesto ${q.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}`,
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
      title: `Venta ${s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}`,
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
  const lowStock = db.products.filter((p) => p.active && p.stock < p.minStock).slice(0, 3);
  const overdueClients = db.clients
    .map((c) => ({ c, b: clientBalance(db, c.id) }))
    .filter((x) => x.b.overdue > 0)
    .slice(0, 2);
  const pendingSettle = db.movements.filter(
    (m) => m.settled === false && m.amount > 0 && addDays(dayOf(m.date), m.settleDays ?? 0) < today,
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      {/* Izquierda */}
      <section className="order-2 flex flex-col gap-3 lg:order-1">
        <div className="card-soft flex flex-col items-center px-6 pb-5 pt-6 text-center">
          <img src={logo} alt={db.settings.businessName} className="w-full max-w-[220px]" />
          <p className="mt-3 text-[11px] text-muted-foreground">
            Panel de gestión · Sucursal central
          </p>
        </div>
        <h2 className="mt-1 px-2 text-sm font-semibold">Actividad reciente</h2>
        {activity.map((a) => (
          <Link key={a.id} to={a.to} className="card-soft group block p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-sm font-semibold">
                  {a.client[0]}
                </div>
                <p className="truncate text-sm leading-tight text-muted-foreground">{a.client}</p>
              </div>
              <CornerArrow />
            </div>
            <h3 className="mt-3 line-clamp-2 text-[15px] font-bold leading-snug">{a.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {dayOf(a.date) === today ? "Hoy" : fmtDate(a.date)} · {fmtTime(a.date)}
            </p>
            <p className="mt-2 truncate text-xs text-muted-foreground">{a.note}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{ars(a.amount)}</span>
              <Badge tone={a.tone}>{a.status}</Badge>
            </div>
          </Link>
        ))}
      </section>

      {/* Centro */}
      <section className="card-soft order-1 flex min-w-0 flex-col gap-6 p-5 md:p-7 lg:order-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{fmtDateLong(today)}</p>
            <h1 className="text-xl font-bold">Resumen del día</h1>
          </div>
          <Link
            to="/cierre"
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            <Lock className="h-4 w-4" strokeWidth={1.6} /> Cerrar día
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { l: "Ventas de hoy", v: salesTotal, s: `${todaySales.length} operaciones` },
            {
              l: "Ganancia estimada",
              v: profit,
              s: salesTotal
                ? `${Math.round((profit / salesTotal) * 100)}% margen`
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
              s: `${db.clients.filter((c) => clientBalance(db, c.id).balance > 0).length} clientes`,
            },
          ].map((k) => (
            <div key={k.l} className="rounded-3xl bg-surface p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="mt-2 text-lg font-bold tracking-tight md:text-xl">{ars(k.v)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{k.s}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" strokeWidth={1.6} />
              <h2 className="text-sm font-semibold">Dónde está la plata</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {openSales.length} ventas sin cerrar
            </span>
          </div>
          {payments.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
              Todavía no hay ventas sin cerrar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="pb-2 font-normal">Medio</th>
                    <th className="pb-2 text-right font-normal">Bruto</th>
                    <th className="pb-2 text-right font-normal">Comisión est.</th>
                    <th className="pb-2 text-right font-normal">Neto</th>
                    <th className="pb-2 text-right font-normal">Acredita en</th>
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
                          {p.fee ? `- ${ars(p.fee)}` : "—"}
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
            <h2 className="text-sm font-semibold">Ventas últimos 7 días</h2>
            <span className="text-xs text-muted-foreground">en millones</span>
          </div>
          <div className="flex h-40 items-end gap-3">
            {week.map((w, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] text-muted-foreground">${(w.v / 1e6).toFixed(1)}</span>
                <div
                  className={`w-full max-w-10 rounded-full ${i === week.length - 1 ? "bg-primary" : "bg-surface"}`}
                  style={{ height: `${Math.max(2, (w.v / maxWeek) * 100)}%` }}
                />
                <span className="text-[11px] capitalize text-muted-foreground">{w.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Derecha */}
      <section className="order-3 grid gap-4 lg:col-span-2 lg:grid-cols-3 xl:col-span-1 xl:flex xl:flex-col">
        <Widget title="Cheques por vencer" icon={CalendarClock} link="/caja">
          {cheques.length === 0 && (
            <p className="text-xs text-muted-foreground">No hay cheques en cartera.</p>
          )}
          {cheques.map((c) => {
            const d = daysBetween(today, c.dueDate);
            return (
              <div key={c.id} className="rounded-2xl bg-surface p-3">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>N° {c.number}</span>
                  <span className={d < 0 ? "text-danger-soft-foreground" : ""}>
                    {d < 0 ? "vencido" : d === 0 ? "hoy" : fmtDate(c.dueDate)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{c.clientName}</p>
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.bank}</span>
                  <span className="font-semibold">{ars(c.amount)}</span>
                </div>
              </div>
            );
          })}
        </Widget>

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

        <Widget title="Alertas" icon={AlertTriangle} link="/stock">
          {lowStock.length + overdueClients.length + pendingSettle.length === 0 && (
            <p className="text-xs text-muted-foreground">Todo en orden.</p>
          )}
          {lowStock.map((p) => (
            <AlertRow
              key={p.id}
              icon={Package}
              text={`${p.name}: quedan ${num(p.stock)} ${p.unit === "m2" ? "m²" : p.unit}`}
              tone={p.stock <= 0 ? "danger" : "dark"}
              label={p.stock <= 0 ? "Sin stock" : "Stock bajo"}
            />
          ))}
          {overdueClients.map(({ c, b }) => (
            <AlertRow
              key={c.id}
              icon={Wallet}
              text={`${c.name}: ${ars(b.overdue)} vencido`}
              tone="danger"
              label="Urgente"
            />
          ))}
          {pendingSettle.slice(0, 2).map((m) => (
            <AlertRow
              key={m.id}
              icon={CreditCard}
              text={`${m.gateway ?? "Depósito"} ${ars(m.amount)} no acreditó en ${m.account}`}
              tone="danger"
              label="Revisar"
            />
          ))}
        </Widget>
      </section>
    </div>
  );
}

function AlertRow({
  icon: Icon,
  text,
  tone,
  label,
}: {
  icon: typeof Package;
  text: string;
  tone: Tone;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
      </span>
      <p className="min-w-0 flex-1 text-xs font-medium">{text}</p>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}

function Widget({
  title,
  icon: Icon,
  link,
  children,
}: {
  title: string;
  icon: typeof Truck;
  link: "/caja" | "/ventas" | "/stock";
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
      <div className="mt-1 flex items-center justify-between">
        <Link to={link} className="text-xs text-muted-foreground hover:text-foreground">
          Ver todos
        </Link>
        <Dots />
      </div>
    </div>
  );
}
