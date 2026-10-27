import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, History, Lock, MessageCircle, Printer } from "lucide-react";
import type { Closure } from "@/lib/types";
import { feeFor, useStore } from "@/lib/store";
import { addDays, ars, dayOf, fmtDate, fmtDateLong, todayISO } from "@/lib/format";
import {
  Card,
  Field,
  NumberInput,
  PageHeader,
  Stat,
  Table,
  btn,
  tr,
  Input,
} from "@/components/ui-bits";

export const Route = createFileRoute("/cierre")({
  head: () => ({
    meta: [
      { title: "Cierre del día · Corralón" },
      {
        name: "description",
        content: "Cierre de lote: ventas, dónde está cada cobro y ganancia del día.",
      },
    ],
  }),
  component: Cierre,
});

function Cierre() {
  const { db, closeDay } = useStore();
  const today = todayISO();
  const [cash, setCash] = useState(0);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Closure | null>(null);

  // Lo que entra en el próximo cierre: todo lo que todavía no fue cerrado
  const open = useMemo(
    () => db.sales.filter((s) => !s.closureId && dayOf(s.date) <= today),
    [db.sales, today],
  );
  const openExp = useMemo(
    () => db.expenses.filter((e) => !e.closureId && dayOf(e.date) <= today),
    [db.expenses, today],
  );
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; bank: string; gross: number; fee: number; days: number }
    >();
    for (const s of open)
      for (const p of s.payments) {
        const cfg = db.settings.methods.find(
          (m) =>
            m.method === p.method && m.bank === p.bank && (m.gateway ?? "") === (p.gateway ?? ""),
        );
        const label = cfg?.label ?? p.method;
        const bank =
          p.method === "cheque"
            ? "Cartera de cheques"
            : p.method === "cta_cte"
              ? "Cuenta corriente"
              : p.bank;
        const g = map.get(label) ?? { label, bank, gross: 0, fee: 0, days: cfg?.settleDays ?? 0 };
        g.gross += p.amount;
        g.fee += feeFor(db, p);
        map.set(label, g);
      }
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }, [open, db]);

  const salesTotal = open.reduce((a, s) => a + s.total, 0);
  const cost = open.reduce((a, s) => a + s.cost, 0);
  const fees = groups.reduce((a, g) => a + g.fee, 0);
  const exp = openExp.reduce((a, e) => a + e.amount, 0);
  const fixedShare = Math.round(db.settings.fixedExpenses.reduce((a, f) => a + f.amount, 0) / 30);
  const profit = salesTotal - cost - fees - exp - fixedShare;
  const cashIn = open
    .flatMap((s) => s.payments)
    .filter((p) => p.method === "efectivo")
    .reduce((a, p) => a + p.amount, 0);
  const cashCobros = db.movements
    .filter(
      (m) => !m.closureId && m.kind === "cobro" && m.account === "Caja" && m.method === "efectivo",
    )
    .reduce((a, m) => a + m.amount, 0);
  const cashOut = openExp.filter((e) => e.account === "Caja").reduce((a, e) => a + e.amount, 0);
  const cashExpected = cashIn + cashCobros - cashOut;
  const diff = cash - cashExpected;

  const summaryText = (c: Closure) =>
    [
      `*Cierre ${fmtDateLong(c.date)}* · ${db.settings.businessName}`,
      `Ventas: ${ars(c.salesTotal)} (${c.saleIds.length} operaciones)`,
      ...c.byMethod.map(
        (g) =>
          `• ${g.label}: ${ars(g.net)} → ${g.bank}${g.settleDays ? ` (acredita en ${g.settleDays} d)` : ""}`,
      ),
      `Gastos del día: ${ars(c.expensesTotal)} · Fijos prorrateados: ${ars(c.fixedShare)}`,
      `Ganancia del día: ${ars(c.profit)}`,
      `Efectivo esperado ${ars(c.cashExpected)} · contado ${ars(c.cashCounted)}`,
    ].join("\n");

  if (done)
    return (
      <>
        <PageHeader title="Día cerrado" subtitle={fmtDateLong(done.date)}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(summaryText(done))}`}
            target="_blank"
            rel="noreferrer"
            className={btn.soft}
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.6} /> Enviar por WhatsApp
          </a>
          <button className={btn.soft} onClick={() => window.print()}>
            <Printer className="h-4 w-4" strokeWidth={1.6} /> Imprimir
          </button>
          <Link to="/" className={btn.primary}>
            <Check className="h-4 w-4" /> Volver al inicio
          </Link>
        </PageHeader>
        <ClosureView c={done} />
      </>
    );

  return (
    <>
      <PageHeader title="Cierre del día" subtitle={fmtDateLong(today)} />
      {open.length === 0 && openExp.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No hay ventas ni gastos sin cerrar.{" "}
            {db.closures[0] ? `Último cierre: ${fmtDate(db.closures[0].date)}.` : ""}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Ventas" value={ars(salesTotal)} sub={`${open.length} operaciones`} />
              <Stat label="Costo de lo vendido" value={ars(cost)} />
              <Stat
                label="Comisiones + gastos"
                value={ars(fees + exp)}
                sub={`fijos del día ${ars(fixedShare)}`}
              />
              <Stat
                label="Ganancia del día"
                value={ars(profit)}
                tone={profit >= 0 ? "ok" : "danger"}
                sub={salesTotal ? `${Math.round((profit / salesTotal) * 100)}% de las ventas` : ""}
              />
            </div>

            <Card title="Dónde está la plata de hoy" icon={Lock}>
              <Table
                head={[
                  "Medio de cobro",
                  { label: "Bruto", right: true },
                  { label: "Comisión", right: true },
                  { label: "Neto", right: true },
                  "Está en",
                  "Acredita",
                ]}
                min={620}
              >
                {groups.map((g) => (
                  <tr key={g.label} className={tr}>
                    <td className="font-medium">{g.label}</td>
                    <td className="text-right tabular-nums">{ars(g.gross)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {g.fee ? `− ${ars(g.fee)}` : "—"}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {ars(g.gross - g.fee)}
                    </td>
                    <td className="text-muted-foreground">{g.bank}</td>
                    <td className="text-muted-foreground">
                      {g.bank === "Cartera de cheques"
                        ? "al cobrar el cheque"
                        : g.bank === "Cuenta corriente"
                          ? "en cuotas"
                          : g.days
                            ? `${fmtDate(addDays(today, g.days))} aprox.`
                            : "hoy"}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card title="Gastos que entran en este cierre">
              {openExp.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No se cargaron gastos. Si hubo alguno imprevisto, cargalo en Gastos antes de
                  cerrar.
                </p>
              )}
              {openExp.map((e) => (
                <p
                  key={e.id}
                  className="flex justify-between border-t border-border py-2 text-sm first:border-0"
                >
                  <span>
                    {e.concept} <span className="text-muted-foreground">· {e.account}</span>
                  </span>
                  <span className="tabular-nums">{ars(e.amount)}</span>
                </p>
              ))}
              <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm text-muted-foreground">
                <span>Gastos fijos prorrateados (1/30 del mes)</span>
                <span className="tabular-nums">{ars(fixedShare)}</span>
              </p>
            </Card>
          </div>

          <Card title="Arqueo y cierre">
            <div className="flex flex-col gap-3 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Efectivo que debería haber</span>
                <span className="font-semibold tabular-nums">{ars(cashExpected)}</span>
              </p>
              <Field label="Efectivo contado en caja">
                <NumberInput
                  value={cash}
                  onChange={setCash}
                  prefix="$"
                  className="h-12 text-lg font-semibold"
                />
              </Field>
              {cash > 0 && (
                <p
                  className={`rounded-2xl px-3 py-2 text-xs ${Math.abs(diff) < 1 ? "bg-success text-success-foreground" : "bg-danger-soft text-danger-soft-foreground"}`}
                >
                  {Math.abs(diff) < 1
                    ? "La caja cierra justo."
                    : diff > 0
                      ? `Sobran ${ars(diff)}`
                      : `Faltan ${ars(-diff)}`}
                </p>
              )}
              <Field label="Nota (opcional)">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Algo para recordar de hoy"
                />
              </Field>
              <button
                className={`${btn.primary} h-12 w-full text-base`}
                onClick={() => setDone(closeDay(cash, note || undefined))}
              >
                <Lock className="h-4 w-4" strokeWidth={1.6} /> Cerrar el día
              </button>
              <p className="text-[11px] text-muted-foreground">
                Al cerrar, las ventas y gastos quedan marcados como cerrados y se guarda el resumen.
                Las ventas que se carguen después entran en el próximo cierre.
              </p>
            </div>
          </Card>
        </div>
      )}

      {db.closures.length > 0 && (
        <Card title="Cierres anteriores" icon={History} className="mt-4">
          <Table
            head={[
              "Fecha",
              { label: "Ventas", right: true },
              { label: "Gastos", right: true },
              { label: "Ganancia", right: true },
              { label: "Caja", right: true },
              "Nota",
            ]}
            min={560}
          >
            {db.closures.map((c) => (
              <tr key={c.id} className={tr}>
                <td>{fmtDate(c.date)}</td>
                <td className="text-right tabular-nums">{ars(c.salesTotal)}</td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {ars(c.expensesTotal + c.fixedShare + c.feesTotal)}
                </td>
                <td
                  className={`text-right font-semibold tabular-nums ${c.profit < 0 ? "text-danger-soft-foreground" : ""}`}
                >
                  {ars(c.profit)}
                </td>
                <td
                  className={`text-right tabular-nums ${Math.abs(c.cashCounted - c.cashExpected) >= 1 ? "text-danger-soft-foreground" : "text-muted-foreground"}`}
                >
                  {c.cashCounted - c.cashExpected === 0
                    ? "justa"
                    : (c.cashCounted - c.cashExpected > 0 ? "+" : "") +
                      ars(c.cashCounted - c.cashExpected)}
                </td>
                <td className="text-muted-foreground">{c.note ?? ""}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

function ClosureView({ c }: { c: Closure }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="Dónde está la plata">
        <Table head={["Medio", { label: "Neto", right: true }, "Está en", "Acredita"]} min={460}>
          {c.byMethod.map((g) => (
            <tr key={g.label} className={tr}>
              <td className="font-medium">{g.label}</td>
              <td className="text-right font-semibold tabular-nums">{ars(g.net)}</td>
              <td className="text-muted-foreground">{g.bank}</td>
              <td className="text-muted-foreground">
                {g.settleDays
                  ? `${fmtDate(addDays(c.date, g.settleDays))} aprox.`
                  : g.bank === "Cartera de cheques" || g.bank === "Cuenta corriente"
                    ? "pendiente"
                    : "hoy"}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
        <Stat label="Ventas" value={ars(c.salesTotal)} sub={`${c.saleIds.length} operaciones`} />
        <Stat
          label="Costo + comisiones + gastos"
          value={ars(c.costTotal + c.feesTotal + c.expensesTotal + c.fixedShare)}
        />
        <Stat
          label="Ganancia del día"
          value={ars(c.profit)}
          tone={c.profit >= 0 ? "ok" : "danger"}
        />
        <Stat
          label="Caja"
          value={ars(c.cashCounted)}
          sub={`esperado ${ars(c.cashExpected)}`}
          tone={Math.abs(c.cashCounted - c.cashExpected) >= 1 ? "danger" : undefined}
        />
      </div>
    </div>
  );
}
