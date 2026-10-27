import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Receipt } from "lucide-react";
import type { Bank, ExpenseType, PaymentMethod } from "@/lib/types";
import { useStore } from "@/lib/store";
import { addDays, ars, dayOf, fmtDate, todayISO } from "@/lib/format";
import {
  Badge,
  Card,
  Field,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  Stat,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos · Corralón" },
      { name: "description", content: "Gastos fijos, imprevistos y débitos bancarios." },
    ],
  }),
  component: Gastos,
});

const typeLabel: Record<ExpenseType, string> = {
  fijo: "Fijo",
  imprevisto: "Imprevisto",
  debito: "Débito bancario",
  flete: "Flete / camión",
  compra: "Compra mercadería",
};
const methodLabel: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  debito: "Débito",
  credito: "Crédito",
  cheque: "Cheque",
  cta_cte: "Cta. cte.",
};

function Gastos() {
  const { db, pendingAction, setPendingAction } = useStore();
  const [range, setRange] = useState<"mes" | "semana" | "hoy" | "todo">("mes");
  const [open, setOpen] = useState<ExpenseType | null>(null);
  const [prefill, setPrefill] = useState<{
    concept?: string | undefined;
    amount?: number | undefined;
    account?: Bank | undefined;
  } | null>(null);
  useEffect(() => {
    if (pendingAction?.tipo === "nuevo_gasto") {
      setPrefill({
        concept: pendingAction.concepto,
        amount: pendingAction.monto,
        account: pendingAction.cuenta,
      });
      setOpen(pendingAction.tipo_gasto ?? "imprevisto");
      setPendingAction(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);
  const today = todayISO();
  const from =
    range === "hoy"
      ? today
      : range === "semana"
        ? addDays(today, -6)
        : range === "mes"
          ? today.slice(0, 8) + "01"
          : "0000";
  const list = useMemo(() => db.expenses.filter((e) => dayOf(e.date) >= from), [db.expenses, from]);
  const total = list.reduce((a, e) => a + e.amount, 0);
  const byType = (t: ExpenseType) =>
    list.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0);
  const fixedMonthly = db.settings.fixedExpenses.reduce((a, f) => a + f.amount, 0);
  const dayNum = Number(today.slice(8, 10));
  const upcoming = db.settings.fixedExpenses
    .filter((f) => f.day >= dayNum)
    .sort((a, b) => a.day - b.day);

  return (
    <>
      <PageHeader title="Gastos y débitos" subtitle="Todo lo que sale, y de qué cuenta sale">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "semana", label: "7 días" },
            { value: "mes", label: "Este mes" },
            { value: "todo", label: "Todo" },
          ]}
        />
        <button className={btn.soft} onClick={() => setOpen("debito")}>
          <Plus className="h-4 w-4" /> Débito bancario
        </button>
        <button className={btn.primary} onClick={() => setOpen("imprevisto")}>
          <Plus className="h-4 w-4" /> Gasto
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Gastado en el período" value={ars(total)} sub={`${list.length} movimientos`} />
        <Stat label="Débitos bancarios" value={ars(byType("debito"))} />
        <Stat
          label="Imprevistos"
          value={ars(byType("imprevisto"))}
          tone={byType("imprevisto") ? "danger" : undefined}
        />
        <Stat
          label="Fijos mensuales (config.)"
          value={ars(fixedMonthly)}
          sub={`${ars(Math.round(fixedMonthly / 30))} por día`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card icon={Receipt} title="Gastos registrados">
          <Table
            head={[
              "Fecha",
              "Concepto",
              "Tipo",
              "Pagó con",
              "Salió de",
              { label: "Monto", right: true },
            ]}
            min={640}
          >
            {list.map((e) => (
              <tr key={e.id} className={tr}>
                <td className="whitespace-nowrap text-muted-foreground">{fmtDate(e.date)}</td>
                <td className="font-medium">{e.concept}</td>
                <td>
                  <Badge
                    tone={
                      e.type === "imprevisto" ? "danger" : e.type === "debito" ? "dark" : "muted"
                    }
                  >
                    {typeLabel[e.type]}
                  </Badge>
                </td>
                <td className="text-muted-foreground">{methodLabel[e.method]}</td>
                <td className="text-muted-foreground">{e.account}</td>
                <td className="text-right font-semibold tabular-nums">{ars(e.amount)}</td>
              </tr>
            ))}
          </Table>
          {list.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin gastos en este período.
            </p>
          )}
        </Card>

        <Card icon={CalendarDays} title="Próximos débitos fijos">
          <p className="mb-3 text-xs text-muted-foreground">
            Según lo cargado en Configuración. Cuando el banco lo debite, registralo con el botón.
          </p>
          <div className="flex flex-col gap-2">
            {upcoming.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 text-xs"
              >
                <div>
                  <p className="font-medium">{f.concept}</p>
                  <p className="text-muted-foreground">
                    Día {f.day} · {f.account}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{ars(f.amount)}</span>
                  <QuickDebit concept={f.concept} amount={f.amount} account={f.account} />
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">No quedan débitos fijos este mes.</p>
            )}
          </div>
        </Card>
      </div>

      <ExpenseModal
        type={open}
        onClose={() => {
          setOpen(null);
          setPrefill(null);
        }}
        prefill={prefill}
      />
    </>
  );
}

function QuickDebit({
  concept,
  amount,
  account,
}: {
  concept: string;
  amount: number;
  account: Bank;
}) {
  const { addExpense } = useStore();
  const [done, setDone] = useState(false);
  return (
    <button
      className={`${btn.primary} h-8 px-3 text-xs`}
      disabled={done}
      onClick={() => {
        addExpense({
          date: new Date().toISOString(),
          type: "fijo",
          concept,
          amount,
          account,
          method: "transferencia",
        });
        setDone(true);
      }}
    >
      {done ? "Listo" : "Debitado"}
    </button>
  );
}

function ExpenseModal({
  type,
  onClose,
  prefill,
}: {
  type: ExpenseType | null;
  onClose: () => void;
  prefill?:
    | { concept?: string | undefined; amount?: number | undefined; account?: Bank | undefined }
    | null
    | undefined;
}) {
  const { addExpense } = useStore();
  const [t, setT] = useState<ExpenseType>("imprevisto");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState<Bank>("Caja");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [date, setDate] = useState(todayISO());
  const [lastType, setLastType] = useState<ExpenseType | null>(null);
  if (type && type !== lastType) {
    setLastType(type);
    setT(type);
    if (type === "debito") {
      setAccount("BBVA");
      setMethod("transferencia");
    }
    if (prefill) {
      if (prefill.concept) setConcept(prefill.concept);
      if (prefill.amount) setAmount(prefill.amount);
      if (prefill.account) setAccount(prefill.account);
    }
  }
  const save = () => {
    addExpense({ date: `${date}T12:00:00`, type: t, concept, amount, account, method });
    onClose();
    setConcept("");
    setAmount(0);
  };
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      title={t === "debito" ? "Débito bancario" : "Nuevo gasto"}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" className="col-span-2">
          <Select value={t} onChange={(e) => setT(e.target.value as ExpenseType)}>
            {(Object.keys(typeLabel) as ExpenseType[]).map((k) => (
              <option key={k} value={k}>
                {typeLabel[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Concepto" className="col-span-2">
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder={t === "debito" ? "Impuesto, comisión, débito automático…" : "Qué se pagó"}
            autoFocus
          />
        </Field>
        <Field label="Monto">
          <NumberInput value={amount} onChange={setAmount} prefix="$" />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t === "debito" ? "Banco que debitó" : "Salió de"}>
          <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
            {t !== "debito" && <option value="Caja">Caja</option>}
            <option value="BBVA">BBVA</option>
            <option value="Provincia">Provincia</option>
          </Select>
        </Field>
        {t !== "debito" && (
          <Field label="Cómo se pagó">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="debito">Tarjeta de débito</option>
              <option value="credito">Tarjeta de crédito</option>
              <option value="cheque">Cheque</option>
            </Select>
          </Field>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Los gastos del día se suman automáticamente al cierre de lote.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button className={btn.primary} disabled={!concept || amount <= 0} onClick={save}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}
