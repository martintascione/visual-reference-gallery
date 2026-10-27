import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChartColumn, Download } from "lucide-react";
import { feeFor, periodProfit, useStore } from "@/lib/store";
import { addDays, ars, dayOf, fmtDate, num, todayISO } from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import {
  Card,
  Field,
  Input,
  PageHeader,
  Segmented,
  Stat,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes · Corralón" },
      {
        name: "description",
        content: "Ganancia por día, semana y mes; ventas por producto y medio de pago.",
      },
    ],
  }),
  component: Reportes,
});

type Range = "hoy" | "semana" | "mes" | "custom";

function Reportes() {
  const { db } = useStore();
  const today = todayISO();
  const [range, setRange] = useState<Range>("semana");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const f =
    range === "hoy"
      ? today
      : range === "semana"
        ? addDays(today, -6)
        : range === "mes"
          ? today.slice(0, 8) + "01"
          : from;
  const t = range === "custom" ? to : today;
  const r = useMemo(() => periodProfit(db, f, t), [db, f, t]);

  const byProduct = useMemo(() => {
    const m = new Map<
      string,
      { name: string; qty: number; unit: string; total: number; cost: number }
    >();
    for (const s of r.sales)
      for (const i of s.items) {
        const key = i.productId + i.unit;
        const g = m.get(key) ?? {
          name: i.name,
          qty: 0,
          unit: unitLabel[i.unit],
          total: 0,
          cost: 0,
        };
        g.qty += i.qty;
        g.total += i.subtotal;
        g.cost += i.cost;
        m.set(key, g);
      }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [r.sales]);

  const byMethod = useMemo(() => {
    const m = new Map<
      string,
      { label: string; bank: string; total: number; fee: number; n: number }
    >();
    for (const s of r.sales)
      for (const p of s.payments) {
        const cfg = db.settings.methods.find(
          (x) =>
            x.method === p.method && x.bank === p.bank && (x.gateway ?? "") === (p.gateway ?? ""),
        );
        const label = cfg?.label ?? p.method;
        const g = m.get(label) ?? {
          label,
          bank: p.method === "cheque" ? "Cartera" : p.method === "cta_cte" ? "Cta. cte." : p.bank,
          total: 0,
          fee: 0,
          n: 0,
        };
        g.total += p.amount;
        g.fee += feeFor(db, p);
        g.n += 1;
        m.set(label, g);
      }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [r.sales, db]);

  const days = useMemo(() => {
    const out: { d: string; v: number; g: number }[] = [];
    const n = Math.min(r.days, 31);
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(t, -i);
      const ss = db.sales.filter((s) => dayOf(s.date) === d);
      out.push({
        d,
        v: ss.reduce((a, s) => a + s.total, 0),
        g: ss.reduce((a, s) => a + s.subtotal - s.cost, 0),
      });
    }
    return out;
  }, [db.sales, r.days, t]);
  const max = Math.max(1, ...days.map((d) => d.v));

  const exportCsv = () => {
    const rows = [
      [
        "N°",
        "Fecha",
        "Cliente",
        "Productos",
        "Medios de pago",
        "Subtotal",
        "IVA",
        "Total",
        "Costo",
        "Comisiones",
        "Ganancia",
      ],
    ];
    for (const s of r.sales) {
      const fees = s.payments.reduce((a, p) => a + feeFor(db, p), 0);
      rows.push([
        String(s.number),
        s.date.slice(0, 16).replace("T", " "),
        s.clientName,
        s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(" | "),
        s.payments
          .map((p) => `${p.method}${p.gateway ? " " + p.gateway : ""} ${p.bank} ${p.amount}`)
          .join(" | "),
        String(s.subtotal),
        String(s.iva),
        String(s.total),
        String(s.cost),
        String(fees),
        String(s.subtotal - s.cost - fees),
      ]);
    }
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ventas_${f}_${t}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={`${fmtDate(f)} → ${fmtDate(t)} · ${r.sales.length} ventas`}
      >
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mes" },
            { value: "custom", label: "Elegir" },
          ]}
        />
        {range === "custom" && (
          <div className="flex items-end gap-2">
            <Field label="Desde">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9"
              />
            </Field>
          </div>
        )}
        <button className={btn.soft} onClick={exportCsv} disabled={r.sales.length === 0}>
          <Download className="h-4 w-4" strokeWidth={1.6} /> Exportar Excel (CSV)
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Ventas" value={ars(r.salesTotal)} />
        <Stat label="Costo de lo vendido" value={ars(r.cost)} />
        <Stat label="Comisiones" value={ars(r.fees)} />
        <Stat label="Gastos cargados" value={ars(r.exp)} />
        <Stat label="Gastos fijos prorrateados" value={ars(r.fixed)} sub={`${r.days} días`} />
        <Stat
          label="Ganancia neta"
          value={ars(r.profit)}
          tone={r.profit >= 0 ? "ok" : "danger"}
          sub={r.salesTotal ? `${Math.round((r.profit / r.salesTotal) * 100)}% de las ventas` : ""}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Ventas y ganancia bruta por día" icon={ChartColumn} className="xl:col-span-2">
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto">
            {days.map((d, i) => (
              <div
                key={d.d}
                className="flex h-full min-w-7 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[9px] text-muted-foreground">
                  {d.v ? `$${(d.v / 1e6).toFixed(1)}M` : ""}
                </span>
                <div
                  className="relative w-full max-w-9 rounded-full bg-surface"
                  style={{ height: `${(d.v / max) * 100}%` }}
                >
                  <div
                    className={`absolute bottom-0 w-full rounded-full ${i === days.length - 1 ? "bg-primary" : "bg-foreground/25"}`}
                    style={{ height: d.v ? `${(d.g / d.v) * 100}%` : 0 }}
                    title={`Ganancia ${ars(d.g)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {days.length > 10 ? d.d.slice(8) : fmtDate(d.d)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Barra clara: venta del día · barra oscura: ganancia bruta (venta − costo).
          </p>
        </Card>

        <Card title="Qué se vendió">
          <Table
            head={[
              "Producto",
              { label: "Cantidad", right: true },
              { label: "Vendido", right: true },
              { label: "Ganancia", right: true },
              { label: "Margen", right: true },
            ]}
            min={520}
          >
            {byProduct.map((p) => (
              <tr key={p.name + p.unit} className={tr}>
                <td className="font-medium">{p.name}</td>
                <td className="text-right tabular-nums">
                  {num(p.qty, 2)} {p.unit}
                </td>
                <td className="text-right tabular-nums">{ars(p.total)}</td>
                <td className="text-right font-semibold tabular-nums">{ars(p.total - p.cost)}</td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.total ? Math.round(((p.total - p.cost) / p.total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </Table>
          {byProduct.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin ventas en el período.
            </p>
          )}
        </Card>

        <Card title="Cómo se cobró y en qué banco">
          <Table
            head={[
              "Medio",
              "Banco",
              { label: "Operaciones", right: true },
              { label: "Cobrado", right: true },
              { label: "Comisión", right: true },
            ]}
            min={480}
          >
            {byMethod.map((m) => (
              <tr key={m.label} className={tr}>
                <td className="font-medium">{m.label}</td>
                <td className="text-muted-foreground">{m.bank}</td>
                <td className="text-right tabular-nums">{m.n}</td>
                <td className="text-right font-semibold tabular-nums">{ars(m.total)}</td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {m.fee ? ars(m.fee) : "—"}
                </td>
              </tr>
            ))}
          </Table>
          {r.expenses.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Gastos del período ({r.expenses.length})
              </summary>
              {r.expenses.map((e) => (
                <p key={e.id} className="flex justify-between py-1 text-muted-foreground">
                  <span>
                    {fmtDate(e.date)} · {e.concept} · {e.account}
                  </span>
                  <span>{ars(e.amount)}</span>
                </p>
              ))}
            </details>
          )}
        </Card>
      </div>
    </>
  );
}
