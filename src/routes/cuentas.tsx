import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HandCoins, Plus, Users, Wallet } from "lucide-react";
import { clientBalance, supplierAccounts, useStore } from "@/lib/store";
import { addDays, ars, daysBetween, fmtDateNum, todayISO } from "@/lib/format";
import { Badge, Card, PageHeader, Stat, btn } from "@/components/ui-bits";
import { ClientDebtForm, SupplierDebtForm } from "@/components/debt-forms";
import { Ledger } from "./descargas";

export const Route = createFileRoute("/cuentas")({
  head: () => ({
    meta: [
      { title: "Cuentas y saldos · Corralón" },
      {
        name: "description",
        content:
          "Lo que nos deben los clientes y lo que les debemos a los proveedores, con sus vencimientos.",
      },
    ],
  }),
  component: Cuentas,
});

const key = (kind: string, party: string) => kind + "|" + party.trim().toLowerCase();

function Cuentas() {
  const { db } = useStore();
  const [clientDebt, setClientDebt] = useState(false);
  const [supplierDebt, setSupplierDebt] = useState(false);
  const [ledger, setLedger] = useState<string | null>(null);
  const today = todayISO();
  const end30 = addDays(today, 30);

  const clients = useMemo(
    () =>
      db.clients
        .map((c) => {
          const b = clientBalance(db, c.id);
          const next = b.dues
            .filter((d) => d.paid < d.amount)
            .sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0];
          return { c, b, next };
        })
        .filter((x) => x.b.balance > 0.5)
        .sort((x, y) => y.b.balance - x.b.balance),
    [db],
  );
  const suppliers = useMemo(() => supplierAccounts(db).filter((a) => a.saldo > 0.5), [db]);
  const open = suppliers.find((a) => key(a.kind, a.party) === ledger) ?? null;

  const owedToUs = clients.reduce((a, x) => a + x.b.balance, 0);
  const overdueToUs = clients.reduce((a, x) => a + x.b.overdue, 0);
  const weOwe = suppliers.reduce((a, x) => a + x.saldo, 0);
  const weOverdue = suppliers.reduce(
    (a, x) => a + x.pending.filter((p) => p.due < today).reduce((t, p) => t + p.amount, 0),
    0,
  );

  // Próximos vencimientos: cobros de clientes y pagos a proveedores, en una sola lista.
  const agenda = [
    ...clients.flatMap(({ c, b }) =>
      b.dues
        .filter((d) => d.paid < d.amount && d.dueDate <= addDays(today, 60))
        .map((d) => ({
          date: d.dueDate,
          who: c.name,
          detail: `Cuota ${d.n}/${d.of}${d.concept ? " · " + d.concept : ""}`,
          amount: d.amount - d.paid,
          sign: 1 as const,
        })),
    ),
    ...suppliers.flatMap((a) =>
      a.pending
        .filter((p) => p.due <= addDays(today, 60))
        .map((p) => ({
          date: p.due,
          who: a.party,
          detail: a.kind === "cantera" ? "Cantera / proveedor" : "Transporte",
          amount: p.amount,
          sign: -1 as const,
        })),
    ),
  ].sort((x, y) => x.date.localeCompare(y.date));
  const toCollect30 = agenda
    .filter((x) => x.sign > 0 && x.date <= end30)
    .reduce((a, x) => a + x.amount, 0);
  const toPay30 = agenda
    .filter((x) => x.sign < 0 && x.date <= end30)
    .reduce((a, x) => a + x.amount, 0);

  const when = (d: string) => {
    const n = daysBetween(today, d);
    return n < 0 ? `venció hace ${-n} d` : n === 0 ? "hoy" : `en ${n} d`;
  };

  return (
    <>
      <PageHeader
        title="Cuentas y saldos"
        subtitle="Lo que nos deben los clientes y lo que les debemos a los proveedores, con cada vencimiento"
      >
        <button className={btn.soft} onClick={() => setSupplierDebt(true)}>
          <HandCoins className="h-4 w-4" strokeWidth={1.6} /> Deuda con proveedor
        </button>
        <button className={btn.primary} onClick={() => setClientDebt(true)}>
          <Plus className="h-4 w-4" /> Saldo de cliente
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Nos deben los clientes"
          value={ars(owedToUs)}
          sub={overdueToUs > 0 ? `${ars(overdueToUs)} vencido` : undefined}
          tone={overdueToUs > 0 ? "danger" : undefined}
        />
        <Stat label="A cobrar en 30 días" value={ars(toCollect30)} />
        <Stat
          label="Debemos a proveedores"
          value={ars(weOwe)}
          sub={weOverdue > 0 ? `${ars(weOverdue)} vencido` : undefined}
          tone={weOwe > 0 ? "danger" : undefined}
        />
        <Stat label="A pagar en 30 días" value={ars(toPay30)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Nos deben" icon={Users}>
          <div className="flex flex-col gap-2">
            {clients.length === 0 && (
              <p className="text-xs text-muted-foreground">Ningún cliente debe nada.</p>
            )}
            {clients.map(({ c, b, next }) => (
              <Link
                key={c.id}
                to="/clientes"
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {next
                      ? `Próxima: ${fmtDateNum(next.dueDate)} · ${ars(next.amount - next.paid)}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{ars(b.balance)}</span>
                  {b.overdue > 0 && <Badge tone="danger">{ars(b.overdue)} vencido</Badge>}
                </span>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Debemos" icon={Wallet}>
          <div className="flex flex-col gap-2">
            {suppliers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No se le debe nada a ningún proveedor.
              </p>
            )}
            {suppliers.map((a) => (
              <button
                key={key(a.kind, a.party)}
                onClick={() => setLedger(key(a.kind, a.party))}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3 text-left transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.party}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {a.kind === "cantera" ? "Proveedor" : "Transporte"}
                    {a.remind
                      ? ` · próxima: ${fmtDateNum(a.remind)} · ${ars(a.remindAmount ?? 0)}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-danger-soft-foreground">
                    {ars(a.saldo)}
                  </span>
                  {a.remind && a.remind < today && <Badge tone="danger">vencido</Badge>}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Próximos vencimientos" subtitle="60 días">
          <div className="flex flex-col gap-1.5">
            {agenda.length === 0 && (
              <p className="text-xs text-muted-foreground">Nada que cobrar ni pagar con fecha.</p>
            )}
            {agenda.map((x, k) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-xs last:border-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {x.sign > 0 ? "Cobrar a " : "Pagar a "}
                    {x.who}
                  </span>
                  <span className="text-muted-foreground">
                    {fmtDateNum(x.date)} · {when(x.date)} · {x.detail}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${x.sign > 0 ? "text-success-foreground" : "text-danger-soft-foreground"}`}
                >
                  {x.sign > 0 ? "+" : "−"} {ars(x.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <ClientDebtForm open={clientDebt} onClose={() => setClientDebt(false)} />
      <SupplierDebtForm open={supplierDebt} onClose={() => setSupplierDebt(false)} />
      <Ledger account={open} onClose={() => setLedger(null)} />
    </>
  );
}
