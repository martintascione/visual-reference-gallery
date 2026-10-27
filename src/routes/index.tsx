import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio · Panel del Corralón" },
      { name: "description", content: "Resumen del día, ventas, cobros, cheques, entregas y alertas del corralón." },
      { property: "og:title", content: "Inicio · Panel del Corralón" },
      { property: "og:description", content: "Resumen del día, ventas, cobros, cheques, entregas y alertas del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const ars = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

type Status = "Urgente" | "Vencido" | "Pendiente" | "Pagado" | "OK";
function Badge({ s }: { s: Status }) {
  const cls =
    s === "Urgente" || s === "Vencido"
      ? "bg-danger-soft text-danger-soft-foreground"
      : s === "Pendiente"
        ? "bg-primary text-primary-foreground"
        : "bg-success text-success-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{s}</span>;
}

function Dots({ n = 3, active = 0 }: { n?: number; active?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`h-1 rounded-full ${i === active ? "w-4 bg-primary" : "w-1 bg-border"}`} />
      ))}
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

const activity: { client: string; title: string; when: string; amount: number; status: Status; note: string }[] = [
  { client: "Marcelo Giménez", title: "Presupuesto 12 bolsones piedra blanca", when: "Hoy · 09:45", amount: 1440000, status: "Pendiente", note: "Pidió entrega para el sábado." },
  { client: "Constructora Ríos", title: "Venta 8 m³ piedra partida 6-20", when: "Hoy · 08:20", amount: 960000, status: "Pagado", note: "Transferencia BBVA acreditada." },
  { client: "Laura Benítez", title: "Presupuesto 25 m² laja San Luis", when: "Ayer · 17:10", amount: 812500, status: "Urgente", note: "Vence hoy, llamar a la tarde." },
  { client: "Jardines del Sur", title: "Venta 6 bidones fijador 10 L", when: "Ayer · 11:30", amount: 342000, status: "Pagado", note: "Débito Payway." },
  { client: "Hernán Ortiz", title: "Presupuesto 4 bolsones canto rodado", when: "24 oct · 16:05", amount: 520000, status: "Pendiente", note: "Esperando confirmación." },
];

const payments = [
  { name: "Efectivo", icon: Banknote, gross: 685000, fee: 0, bank: "Caja" },
  { name: "Transferencia BBVA", icon: Building2, gross: 960000, fee: 0, bank: "BBVA" },
  { name: "Transferencia Provincia", icon: Building2, gross: 410000, fee: 0, bank: "Provincia" },
  { name: "Débito Payway", icon: CreditCard, gross: 342000, fee: 0.008, bank: "Provincia" },
  { name: "Crédito Payway", icon: CreditCard, gross: 518000, fee: 0.018, bank: "BBVA" },
  { name: "Cheques", icon: FileCheck2, gross: 750000, fee: 0, bank: "Provincia" },
];

const week = [
  { d: "Mié", v: 1.9 },
  { d: "Jue", v: 2.6 },
  { d: "Vie", v: 3.4 },
  { d: "Sáb", v: 4.1 },
  { d: "Lun", v: 2.2 },
  { d: "Mar", v: 2.9 },
  { d: "Hoy", v: 3.67 },
];

function Index() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      {/* Left */}
      <section className="order-2 flex flex-col gap-3 lg:order-1">
        <h2 className="px-2 text-sm font-semibold">Actividad reciente</h2>
        {activity.map((a) => (
          <article key={a.title} className="card-soft group p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-sm font-semibold">
                  {a.client[0]}
                </div>
                <p className="truncate text-sm leading-tight text-muted-foreground">{a.client}</p>
              </div>
              <CornerArrow />
            </div>
            <h3 className="mt-3 text-[15px] font-bold leading-snug">{a.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{a.when}</p>
            <p className="mt-2 text-xs text-muted-foreground">{a.note}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{ars(a.amount)}</span>
              <Badge s={a.status} />
            </div>
          </article>
        ))}
      </section>

      {/* Center */}
      <section className="card-soft order-1 flex min-w-0 flex-col gap-6 p-5 md:p-7 lg:order-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Martes 27 de octubre, 2026</p>
            <h1 className="text-xl font-bold">Resumen del día</h1>
          </div>
          <button className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            <Lock className="h-4 w-4" strokeWidth={1.6} /> Cerrar día
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { l: "Ventas de hoy", v: 3665000, s: "14 operaciones" },
            { l: "Ganancia estimada", v: 1172800, s: "32% margen" },
            { l: "Cobrado", v: 2915000, s: "80% del total" },
            { l: "A cobrar", v: 750000, s: "3 cuentas" },
          ].map((k) => (
            <div key={k.l} className="rounded-3xl bg-surface p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="mt-2 text-lg font-bold tracking-tight md:text-xl">{ars(k.v)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{k.s}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4" strokeWidth={1.6} />
            <h2 className="text-sm font-semibold">Dónde está la plata</h2>
          </div>
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
                  const fee = Math.round(p.gross * p.fee);
                  return (
                    <tr key={p.name} className="border-t border-border">
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-surface">
                            <p.icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </span>
                          {p.name}
                        </span>
                      </td>
                      <td className="text-right">{ars(p.gross)}</td>
                      <td className="text-right text-muted-foreground">{fee ? `- ${ars(fee)}` : "—"}</td>
                      <td className="text-right font-semibold">{ars(p.gross - fee)}</td>
                      <td className="text-right text-muted-foreground">{p.bank}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ventas últimos 7 días</h2>
            <span className="text-xs text-muted-foreground">en millones</span>
          </div>
          <div className="flex h-40 items-end gap-3">
            {week.map((w, i) => (
              <div key={w.d} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] text-muted-foreground">${w.v.toFixed(1)}</span>
                <div
                  className={`w-full max-w-10 rounded-full ${i === week.length - 1 ? "bg-primary" : "bg-surface"}`}
                  style={{ height: `${(w.v / 4.1) * 100}%` }}
                />
                <span className="text-[11px] text-muted-foreground">{w.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right */}
      <section className="order-3 grid gap-4 lg:col-span-2 lg:grid-cols-3 xl:col-span-1 xl:flex xl:flex-col">
        <Widget title="Cheques por vencer" icon={CalendarClock} link="/caja">
          {[
            { n: "N° 00451238", c: "Constructora Ríos", b: "Banco Nación", d: "29 oct", a: 450000 },
            { n: "N° 77812004", c: "Marcelo Giménez", b: "Galicia", d: "02 nov", a: 300000 },
          ].map((c) => (
            <div key={c.n} className="rounded-2xl bg-surface p-3">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{c.n}</span>
                <span>{c.d}</span>
              </div>
              <p className="mt-1 text-sm font-semibold">{c.c}</p>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted-foreground">{c.b}</span>
                <span className="font-semibold">{ars(c.a)}</span>
              </div>
            </div>
          ))}
        </Widget>

        <Widget title="Entregas de hoy" icon={Truck} link="/ventas">
          <Delivery addr="Av. San Martín 1450, Lomas" time="10:00 – 12:00" items="8 m³ piedra partida" />
          <Delivery addr="Calle 12 N° 830, Adrogué" time="15:00 – 17:00" items="12 bolsones piedra blanca" initial />
        </Widget>

        <Widget title="Alertas" icon={AlertTriangle} link="/stock">
          {[
            { i: Package, t: "Piedra partida: quedan 800 kg", s: "Urgente" as Status },
            { i: Package, t: "Fijador 5 L: quedan 4 bidones", s: "Pendiente" as Status },
            { i: Wallet, t: "Laura Benítez: cuota 2/3 vencida", s: "Urgente" as Status },
          ].map((a) => (
            <div key={a.t} className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface">
                <a.i className="h-3.5 w-3.5" strokeWidth={1.6} />
              </span>
              <p className="min-w-0 flex-1 text-xs font-medium">{a.t}</p>
              <Badge s={a.s} />
            </div>
          ))}
        </Widget>
      </section>
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
        <CornerArrow />
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

function Delivery({ addr, time, items, initial = false }: { addr: string; time: string; items: string; initial?: boolean }) {
  const [done, setDone] = useState(initial);
  return (
    <div className="flex items-center gap-3">
      <button
        role="switch"
        aria-checked={done}
        aria-label="Marcar entregado"
        onClick={() => setDone(!done)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${done ? "bg-primary" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-all ${done ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1 truncate text-sm font-semibold ${done ? "text-muted-foreground line-through" : ""}`}>
          <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.6} /> {addr}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {time} · {items}
        </p>
      </div>
    </div>
  );
}
