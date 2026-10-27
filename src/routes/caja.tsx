import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Building2, CalendarClock, Clock, FileCheck2, Plus, Upload } from "lucide-react";
import type { Bank, Cheque, ChequeStatus } from "@/lib/types";
import { accountBalance, pendingSettlements, useStore } from "@/lib/store";
import { addDays, ars, dayOf, daysBetween, fmtDate, fmtTime, todayISO } from "@/lib/format";
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
  Table,
  Toggle,
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/caja")({
  head: () => ({
    meta: [
      { title: "Caja y bancos · Corralón" },
      {
        name: "description",
        content: "Saldos por cuenta, liquidaciones pendientes y cartera de cheques.",
      },
    ],
  }),
  component: Caja,
});

const chequeLabel: Record<ChequeStatus, string> = {
  cartera: "En cartera",
  depositado: "Depositado",
  acreditado: "Acreditado",
  endosado: "Endosado",
  rechazado: "Rechazado",
};
const kindLabel: Record<string, string> = {
  venta: "Venta",
  cobro: "Cobro",
  gasto: "Gasto",
  debito: "Débito",
  ingreso: "Ingreso",
  compra: "Compra",
  flete: "Flete",
};

function Caja() {
  const { db, settleMovement, setChequeStatus } = useStore();
  const [acc, setAcc] = useState<Bank | "todas">("todas");
  const [newCheque, setNewCheque] = useState(false);
  const [income, setIncome] = useState(false);
  const today = todayISO();
  const pending = pendingSettlements(db);
  const pendingByBank = (b: Bank) =>
    pending
      .filter((m) => m.account === b)
      .reduce((a, m) => a + m.amount - Math.round((m.amount * (m.feePct ?? 0)) / 100), 0);
  const moves = useMemo(
    () => db.movements.filter((m) => acc === "todas" || m.account === acc).slice(0, 60),
    [db.movements, acc],
  );
  const cheques = db.cheques
    .filter((c) => c.status === "cartera" || c.status === "depositado")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const chequesTotal = cheques.reduce((a, c) => a + c.amount, 0);

  return (
    <>
      <PageHeader title="Caja y bancos" subtitle="Dónde está la plata hoy">
        <button className={btn.soft} onClick={() => setIncome(true)}>
          <Plus className="h-4 w-4" /> Ingreso extra
        </button>
        <button className={btn.primary} onClick={() => setNewCheque(true)}>
          <FileCheck2 className="h-4 w-4" strokeWidth={1.6} /> Cargar cheque
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["Caja", "BBVA", "Provincia"] as Bank[]).map((b) => (
          <button
            key={b}
            onClick={() => setAcc(acc === b ? "todas" : b)}
            className={`rounded-3xl p-4 text-left transition-colors ${acc === b ? "bg-primary text-primary-foreground" : "bg-card shadow-soft"}`}
          >
            <p
              className={`flex items-center gap-1.5 text-xs ${acc === b ? "opacity-70" : "text-muted-foreground"}`}
            >
              {b === "Caja" ? (
                <Banknote className="h-3.5 w-3.5" />
              ) : (
                <Building2 className="h-3.5 w-3.5" />
              )}
              {b}
            </p>
            <p className="mt-2 text-lg font-bold tracking-tight md:text-xl">
              {ars(accountBalance(db, b))}
            </p>
            <p className={`mt-1 text-[11px] ${acc === b ? "opacity-70" : "text-muted-foreground"}`}>
              {pendingByBank(b) ? `+ ${ars(pendingByBank(b))} por acreditar` : "nada pendiente"}
            </p>
          </button>
        ))}
        <div className="rounded-3xl bg-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileCheck2 className="h-3.5 w-3.5" /> Cheques en cartera
          </p>
          <p className="mt-2 text-lg font-bold tracking-tight md:text-xl">{ars(chequesTotal)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{cheques.length} cheques</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card icon={Clock} title="Liquidaciones pendientes (Payway y depósitos)">
          <p className="mb-3 text-xs text-muted-foreground">
            Cobros con tarjeta y cheques depositados que todavía no se acreditaron. Cuando aparezca
            en el banco, marcalo como acreditado. Más adelante esto se concilia solo con el reporte
            de Payway.
          </p>
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada pendiente de acreditación.</p>
          )}
          <div className="flex flex-col gap-2">
            {pending.map((m) => {
              const eta = addDays(dayOf(m.date), m.settleDays ?? 0);
              const late = eta < today;
              const fee = Math.round((m.amount * (m.feePct ?? 0)) / 100);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.concept}</p>
                    <p className={late ? "text-danger-soft-foreground" : "text-muted-foreground"}>
                      {m.gateway ?? "Depósito"} → {m.account} ·{" "}
                      {late
                        ? `debió acreditar el ${fmtDate(eta)}`
                        : `acredita ${eta === today ? "hoy" : "el " + fmtDate(eta)}`}
                      {fee ? ` · comisión ${ars(fee)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{ars(m.amount - fee)}</span>
                    <button
                      className={`${btn.primary} h-8 px-3 text-xs`}
                      onClick={() => settleMovement(m.id, true)}
                    >
                      Acreditado
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card icon={CalendarClock} title="Cartera de cheques">
          {cheques.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay cheques en cartera.</p>
          )}
          <div className="flex flex-col gap-2">
            {cheques.map((c) => {
              const d = daysBetween(today, c.dueDate);
              return <ChequeRow key={c.id} c={c} days={d} onStatus={setChequeStatus} />;
            })}
          </div>
          {db.cheques.some(
            (c) => c.status === "acreditado" || c.status === "endosado" || c.status === "rechazado",
          ) && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Historial</summary>
              {db.cheques
                .filter(
                  (c) =>
                    c.status === "acreditado" ||
                    c.status === "endosado" ||
                    c.status === "rechazado",
                )
                .map((c) => (
                  <p key={c.id} className="flex justify-between py-1 text-muted-foreground">
                    <span>
                      N° {c.number} · {c.clientName} · {chequeLabel[c.status]}
                    </span>
                    <span>{ars(c.amount)}</span>
                  </p>
                ))}
            </details>
          )}
        </Card>

        <Card
          title={acc === "todas" ? "Movimientos de todas las cuentas" : `Movimientos · ${acc}`}
          className="xl:col-span-2"
          action={
            <Segmented
              value={acc}
              onChange={setAcc}
              options={[
                { value: "todas", label: "Todas" },
                { value: "Caja", label: "Caja" },
                { value: "BBVA", label: "BBVA" },
                { value: "Provincia", label: "Provincia" },
              ]}
            />
          }
        >
          <Table
            head={[
              "Fecha",
              "Concepto",
              "Tipo",
              "Cuenta",
              "Estado",
              { label: "Monto", right: true },
            ]}
            min={640}
          >
            {moves.map((m) => (
              <tr key={m.id} className={tr}>
                <td className="whitespace-nowrap text-muted-foreground">
                  {fmtDate(m.date)} {m.date.length > 10 ? fmtTime(m.date) : ""}
                </td>
                <td className="font-medium">{m.concept}</td>
                <td>
                  <Badge tone={m.amount < 0 ? "danger" : "muted"}>
                    {kindLabel[m.kind] ?? m.kind}
                    {m.gateway ? ` · ${m.gateway}` : ""}
                  </Badge>
                </td>
                <td className="text-muted-foreground">{m.account}</td>
                <td>
                  {m.settled === false ? (
                    <Badge tone="dark">Por acreditar</Badge>
                  ) : (
                    <Badge tone="ok">OK</Badge>
                  )}
                </td>
                <td
                  className={`text-right font-semibold tabular-nums ${m.amount < 0 ? "text-danger-soft-foreground" : ""}`}
                >
                  {m.amount < 0 ? "−" : "+"}
                  {ars(Math.abs(m.amount))}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <NewCheque open={newCheque} onClose={() => setNewCheque(false)} />
      <NewIncome open={income} onClose={() => setIncome(false)} />
    </>
  );
}

function ChequeRow({
  c,
  days,
  onStatus,
}: {
  c: Cheque;
  days: number;
  onStatus: (id: string, s: ChequeStatus, bank?: Bank) => void;
}) {
  const [bank, setBank] = useState<Bank>("Provincia");
  const tone = days < 0 ? "danger" : days <= 3 ? "dark" : "muted";
  return (
    <div className="rounded-2xl bg-surface p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {c.clientName} · {c.bank}
            {c.echeq && <Badge className="ml-1">e-cheq</Badge>}
          </p>
          <p className="text-muted-foreground">
            N° {c.number} · librador {c.drawer} · {chequeLabel[c.status]}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{ars(c.amount)}</p>
          <Badge tone={tone}>
            {days < 0 ? `venció hace ${-days} d` : days === 0 ? "cobra hoy" : `cobra en ${days} d`}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {c.status === "cartera" && (
          <>
            <Select
              value={bank}
              onChange={(e) => setBank(e.target.value as Bank)}
              className="h-8 w-28 text-xs"
            >
              <option value="BBVA">BBVA</option>
              <option value="Provincia">Provincia</option>
            </Select>
            <button
              className={`${btn.primary} h-8 px-3 text-xs`}
              onClick={() => onStatus(c.id, "depositado", bank)}
            >
              <Upload className="h-3 w-3" /> Depositar
            </button>
            <button className={btn.ghost} onClick={() => onStatus(c.id, "endosado")}>
              Endosar a proveedor
            </button>
          </>
        )}
        {c.status === "depositado" && (
          <button
            className={`${btn.primary} h-8 px-3 text-xs`}
            onClick={() => onStatus(c.id, "acreditado")}
          >
            Acreditado en {c.depositBank}
          </button>
        )}
        <button className={btn.danger} onClick={() => onStatus(c.id, "rechazado")}>
          Rechazado
        </button>
      </div>
    </div>
  );
}

function NewCheque({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addCheque } = useStore();
  const [c, setC] = useState({
    number: "",
    bank: "",
    drawer: "",
    dueDate: addDays(todayISO(), 30),
    amount: 0,
    clientId: "",
    echeq: false,
  });
  const save = () => {
    const client = db.clients.find((x) => x.id === c.clientId);
    addCheque({
      number: c.number,
      bank: c.bank,
      drawer: c.drawer || client?.name || "",
      dueDate: c.dueDate,
      amount: c.amount,
      status: "cartera",
      clientId: client?.id,
      clientName: client?.name ?? c.drawer,
      echeq: c.echeq,
    });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Cargar cheque recibido">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cliente" className="col-span-2">
          <Select value={c.clientId} onChange={(e) => setC({ ...c, clientId: e.target.value })}>
            <option value="">Sin cliente cargado</option>
            {db.clients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="N° de cheque">
          <Input value={c.number} onChange={(e) => setC({ ...c, number: e.target.value })} />
        </Field>
        <Field label="Banco emisor">
          <Input value={c.bank} onChange={(e) => setC({ ...c, bank: e.target.value })} />
        </Field>
        <Field label="Librador">
          <Input value={c.drawer} onChange={(e) => setC({ ...c, drawer: e.target.value })} />
        </Field>
        <Field label="Fecha de cobro">
          <Input
            type="date"
            value={c.dueDate}
            onChange={(e) => setC({ ...c, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Monto">
          <NumberInput value={c.amount} onChange={(v) => setC({ ...c, amount: v })} prefix="$" />
        </Field>
        <div className="flex items-end pb-2">
          <Toggle checked={c.echeq} onChange={(v) => setC({ ...c, echeq: v })} label="Es e-cheq" />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={!c.number || !c.bank || c.amount <= 0}
          onClick={save}
        >
          Guardar en cartera
        </button>
      </div>
    </Modal>
  );
}

function NewIncome({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addIncome } = useStore();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState<Bank>("Caja");
  return (
    <Modal open={open} onClose={onClose} title="Ingreso extra">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Concepto" className="col-span-2">
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Aporte, devolución, venta de un equipo…"
          />
        </Field>
        <Field label="Monto">
          <NumberInput value={amount} onChange={setAmount} prefix="$" />
        </Field>
        <Field label="Entra en">
          <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
            <option value="Caja">Caja</option>
            <option value="BBVA">BBVA</option>
            <option value="Provincia">Provincia</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={!concept || amount <= 0}
          onClick={() => {
            addIncome(new Date().toISOString(), concept, amount, account);
            onClose();
          }}
        >
          Registrar
        </button>
      </div>
    </Modal>
  );
}
