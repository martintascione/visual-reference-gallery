import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CalendarClock,
  Clock,
  FileCheck2,
  Pencil,
  Plus,
  Upload,
  Scale,
  Trash2,
  Minus,
  Wallet,
} from "lucide-react";
import type { Bank, Cheque, ChequeStatus, Movement } from "@/lib/types";
import { accountBalance, movementLink, pendingSettlements, useStore } from "@/lib/store";
import { chequeLabel } from "@/lib/cheque-labels";
import {
  BUSINESS_BANKS,
  FELIX_BANK,
  FELIX_NAME,
  SEPARATE_BANK,
  SEPARATE_NAME,
  bankLabel,
} from "@/lib/banks";
import { ChequeForm } from "@/components/cheque-form";
import { Link } from "@tanstack/react-router";
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

const kindLabel: Record<string, string> = {
  venta: "Venta",
  cobro: "Cobro",
  gasto: "Gasto",
  debito: "Débito",
  ingreso: "Ingreso",
  compra: "Compra",
  flete: "Flete",
  ajuste: "Ajuste de saldo",
  egreso: "Egreso",
  transferencia: "Transferencia",
};

function Caja() {
  const { db, settleMovement, setChequeStatus, removeMovement } = useStore();
  const [editMove, setEditMove] = useState<Movement | null>(null);
  const [moveMsg, setMoveMsg] = useState<{ text: string; saleId?: string } | null>(null);
  const saleOf = (m: Movement) => movementLink(db, m).sale;
  const delMove = (m: Movement) => {
    const l = movementLink(db, m);
    const extra = l.due
      ? " La cuota vuelve a quedar pendiente."
      : l.cheque
        ? " El cheque vuelve a la cartera."
        : l.supplierPay
          ? " También se borra el pago al proveedor y vuelve su deuda."
          : l.expense
            ? " También se borra el gasto."
            : l.stockpilePay
              ? " También se saca el pago del acopio."
              : "";
    if (
      !window.confirm(
        `Eliminar "${m.concept}" (${ars(Math.abs(m.amount))})?${extra}${m.closureId ? " Ojo: ya estaba en un cierre del día." : ""}`,
      )
    )
      return;
    const err = removeMovement(m.id);
    setMoveMsg(err ? { text: err } : null);
  };
  const [acc, setAcc] = useState<Bank | "todas">("todas");
  const [newCheque, setNewCheque] = useState(false);
  const [income, setIncome] = useState(false);
  const [adjust, setAdjust] = useState(false);
  // Cuenta aparte (Corralón El Tecla): sus propios botones con la cuenta ya elegida.
  const [teclaCheque, setTeclaCheque] = useState(false);
  const [teclaIncome, setTeclaIncome] = useState(false);
  const [teclaOut, setTeclaOut] = useState(false);
  const [teclaAdjust, setTeclaAdjust] = useState(false);
  const [felixPay, setFelixPay] = useState(false);
  const [felixAdjust, setFelixAdjust] = useState(false);
  const felixBal = accountBalance(db, FELIX_BANK);
  const felixOut = db.movements
    .filter((m) => m.account === FELIX_BANK && m.kind === "transferencia" && m.amount < 0)
    .reduce((acc, m) => acc - m.amount, 0);
  // Cobros que entraron por Felix, por cómo le pagó el cliente (efectivo, transferencia, cheque…).
  const felixIn = Object.entries(
    db.movements
      .filter((m) => m.account === FELIX_BANK && m.method === "felix" && m.amount > 0)
      .reduce<Record<string, { amount: number; n: number }>>((acc, m) => {
        const how = (m.via ?? "Sin detalle").split(" · ")[0] || "Sin detalle";
        const x = (acc[how] ??= { amount: 0, n: 0 });
        x.amount += m.amount;
        x.n += 1;
        return acc;
      }, {}),
  );
  const today = todayISO();
  const pending = pendingSettlements(db);
  const pendingByBank = (b: Bank) =>
    pending
      .filter((m) => m.account === b)
      .reduce((a, m) => a + m.amount - Math.round((m.amount * (m.feePct ?? 0)) / 100), 0);
  const moves = useMemo(
    () =>
      db.movements
        .filter((m) => (acc === "todas" ? BUSINESS_BANKS.includes(m.account) : m.account === acc))
        .slice(0, 60),
    [db.movements, acc],
  );
  const isTecla = (c: Cheque) =>
    c.ownerAccount === SEPARATE_BANK ||
    (c.status === "depositado" && c.depositBank === SEPARATE_BANK);
  const openCheques = db.cheques
    .filter((c) => c.status === "cartera" || c.status === "depositado")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const cheques = openCheques.filter((c) => !isTecla(c));
  const teclaCheques = openCheques.filter(isTecla);
  const teclaPending = pendingByBank(SEPARATE_BANK);
  const chequesTotal = cheques.reduce((a, c) => a + c.amount, 0);

  const felixMoves = db.movements
    .filter((m) => m.account === FELIX_BANK || m.account === "El Tecla")
    .slice(0, 80);
  const renderRow = (m: Movement) => (
    <tr key={m.id} className={tr}>
      <td className="whitespace-nowrap text-muted-foreground">
        {fmtDate(m.date)} {m.date.length > 10 ? fmtTime(m.date) : ""}
      </td>
      <td className="font-medium">
        {m.concept}
        {m.account === FELIX_BANK && m.kind === "transferencia" && m.via && (
          <p className="text-[11px] font-normal text-muted-foreground">Felix pagó: {m.via}</p>
        )}
        {m.method === "felix" && m.amount > 0 && (
          <p className="text-[11px] font-normal text-muted-foreground">
            Le pagó a Felix{m.via ? `: ${m.via}` : ""}
          </p>
        )}
      </td>
      <td>
        <Badge tone={m.amount < 0 ? "danger" : "muted"}>
          {m.account === FELIX_BANK && m.kind === "transferencia" && m.amount < 0
            ? "Pago de Felix"
            : (kindLabel[m.kind] ?? m.kind)}
          {m.gateway ? ` · ${m.gateway}` : ""}
        </Badge>
      </td>
      <td className="text-muted-foreground">{m.account === "El Tecla" ? "Felix" : m.account}</td>
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
      <td className="whitespace-nowrap text-right">
        {saleOf(m) ? (
          <Link
            to="/ventas"
            search={{ id: m.refId }}
            className="text-[11px] text-muted-foreground underline"
            title="Los cobros de una venta se cambian editando la venta"
          >
            Ver venta
          </Link>
        ) : (
          <>
            <button
              className={btn.icon}
              aria-label="Editar movimiento"
              title="Editar movimiento"
              onClick={() => setEditMove(m)}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
            <button
              className={btn.icon}
              aria-label="Eliminar movimiento"
              title="Eliminar movimiento"
              onClick={() => delMove(m)}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHeader title="Caja y bancos" subtitle="Dónde está la plata hoy">
        <button className={btn.soft} onClick={() => setAdjust(true)}>
          <Scale className="h-4 w-4" strokeWidth={1.6} /> Saldo inicial / ajuste
        </button>
        <button className={btn.soft} onClick={() => setIncome(true)}>
          <Plus className="h-4 w-4" /> Ingreso extra
        </button>
        <button className={btn.primary} onClick={() => setNewCheque(true)}>
          <FileCheck2 className="h-4 w-4" strokeWidth={1.6} /> Cargar cheque
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUSINESS_BANKS.map((b) => (
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

      <Card
        title="Felix · Corralón El Tecla"
        icon={Wallet}
        className="mb-4"
        action={
          <span className="text-[11px] text-muted-foreground">
            No se suma a la caja del negocio
          </span>
        }
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {felixBal >= 0
                ? "Felix (El Tecla) le debe a Áridos"
                : "Áridos le debe a Felix (El Tecla)"}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{ars(Math.abs(felixBal))}</p>
            <p className="text-[11px] text-muted-foreground">
              {felixOut > 0 ? `Ya pagó ${ars(felixOut)}` : "Todavía no pagó nada"}
              {teclaPending ? ` · + ${ars(teclaPending)} por acreditar` : ""}
              {teclaCheques.length
                ? ` · ${teclaCheques.length} cheques · ${ars(teclaCheques.reduce((a, c) => a + c.amount, 0))}`
                : ""}
            </p>
            {felixIn.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Cobrado por Felix:</span>
                {felixIn.map(([how, v]) => (
                  <Badge key={how}>
                    {how}: {ars(v.amount)} ({v.n})
                  </Badge>
                ))}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn.primary} onClick={() => setFelixPay(true)}>
              <Banknote className="h-4 w-4" /> Cargar retiro / pago de Felix
            </button>
            <button className={btn.soft} onClick={() => setTeclaCheque(true)}>
              <FileCheck2 className="h-4 w-4" strokeWidth={1.6} /> Cheque en su cuenta
            </button>
            <button className={btn.soft} onClick={() => setTeclaIncome(true)}>
              <Plus className="h-4 w-4" /> Ingreso
            </button>
            <button className={btn.soft} onClick={() => setTeclaOut(true)}>
              <Minus className="h-4 w-4" /> Egreso
            </button>
            <button className={btn.soft} onClick={() => setFelixAdjust(true)}>
              <Scale className="h-4 w-4" strokeWidth={1.6} /> Saldo inicial / ajuste
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Suma lo que los clientes le pagaron a Felix (cobro "Otra: Felix (El Tecla)"), los cheques
          de Áridos acreditados en su cuenta y otros ingresos. Baja con cada retiro o pago de Felix.
        </p>
        {teclaCheques.length > 0 && (
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            {teclaCheques.map((c) => (
              <ChequeRow
                key={c.id}
                c={c}
                days={daysBetween(today, c.dueDate)}
                onStatus={setChequeStatus}
              />
            ))}
          </div>
        )}
        {moveMsg && (
          <p className="mb-3 rounded-2xl bg-danger-soft px-4 py-2 text-xs text-danger-soft-foreground">
            {moveMsg.text}
          </p>
        )}
        <Table
          head={[
            "Fecha",
            "Concepto",
            "Tipo",
            "Cuenta",
            "Estado",
            { label: "Monto", right: true },
            "",
          ]}
          min={720}
        >
          {felixMoves.map(renderRow)}
        </Table>
        {felixMoves.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">
            Todavía no hay movimientos.
          </p>
        )}
      </Card>

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

        <Card
          icon={CalendarClock}
          title="Cartera de cheques"
          action={
            <Link to="/cheques" className={btn.ghost}>
              Ver historial de cheques
            </Link>
          }
        >
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
          {moveMsg && (
            <p className="mb-3 rounded-2xl bg-danger-soft px-4 py-2 text-xs text-danger-soft-foreground">
              {moveMsg.text}
            </p>
          )}
          <Table
            head={[
              "Fecha",
              "Concepto",
              "Tipo",
              "Cuenta",
              "Estado",
              { label: "Monto", right: true },
              "",
            ]}
            min={720}
          >
            {moves.map(renderRow)}
          </Table>
        </Card>
      </div>

      <ChequeForm open={newCheque} onClose={() => setNewCheque(false)} />
      <NewIncome open={income} onClose={() => setIncome(false)} />
      <AdjustBalance open={adjust} onClose={() => setAdjust(false)} />
      <ChequeForm
        open={teclaCheque}
        onClose={() => setTeclaCheque(false)}
        ownerAccount={SEPARATE_BANK}
      />
      <NewIncome
        open={teclaIncome}
        onClose={() => setTeclaIncome(false)}
        fixedAccount={SEPARATE_BANK}
      />
      <NewIncome
        open={teclaOut}
        onClose={() => setTeclaOut(false)}
        fixedAccount={SEPARATE_BANK}
        out
      />
      <FelixSettle open={felixPay} onClose={() => setFelixPay(false)} max={felixBal} />
      <AdjustBalance
        open={felixAdjust}
        onClose={() => setFelixAdjust(false)}
        fixedAccount={FELIX_BANK}
      />
      <AdjustBalance
        open={teclaAdjust}
        onClose={() => setTeclaAdjust(false)}
        fixedAccount={SEPARATE_BANK}
      />
      <MoveEdit
        move={editMove}
        onClose={(err) => {
          setEditMove(null);
          setMoveMsg(err ? { text: err } : null);
        }}
      />
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
  onStatus: (id: string, s: ChequeStatus, bank?: Bank, givenTo?: string) => void;
}) {
  const [bank, setBank] = useState<Bank>(
    c.ownerAccount === SEPARATE_BANK ? SEPARATE_BANK : "Provincia",
  );
  const [to, setTo] = useState("");
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
              <option value={SEPARATE_BANK}>Felix (El Tecla)</option>
            </Select>
            <button
              className={`${btn.primary} h-8 px-3 text-xs`}
              onClick={() => onStatus(c.id, "depositado", bank)}
            >
              <Upload className="h-3 w-3" /> Depositar
            </button>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="A quién se lo das"
              className="h-8 w-40 text-xs"
            />
            <button
              className={btn.ghost}
              disabled={to.trim().length < 2}
              onClick={() => onStatus(c.id, "endosado", undefined, to)}
            >
              Entregar a proveedor
            </button>
          </>
        )}
        {c.status === "depositado" && (
          <button
            className={`${btn.primary} h-8 px-3 text-xs`}
            onClick={() => onStatus(c.id, "acreditado")}
          >
            Acreditado en {c.depositBank ? bankLabel(c.depositBank) : ""}
          </button>
        )}
        <button className={btn.danger} onClick={() => onStatus(c.id, "rechazado")}>
          Rechazado
        </button>
      </div>
    </div>
  );
}

/** Editar un movimiento: fecha, concepto, monto y cuenta. Se corrige también lo que depende de él. */
function MoveEdit({
  move,
  onClose,
}: {
  move: Movement | null;
  onClose: (err?: string | null) => void;
}) {
  const { db, updateMovement } = useStore();
  const [date, setDate] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState<Bank>("Caja");
  const [last, setLast] = useState<string | undefined>(undefined);
  if (move?.id !== last) {
    setLast(move?.id);
    if (move) {
      setDate(move.date.slice(0, 10));
      setConcept(move.concept);
      setAmount(Math.abs(move.amount));
      setAccount(move.account);
    }
  }
  if (!move) return null;
  const l = movementLink(db, move);
  const note = l.due
    ? "Es el cobro de una cuota: si cambiás el monto, se corrige lo pagado de la cuota."
    : l.cheque
      ? "Es el depósito de un cheque: el monto se cambia editando el cheque."
      : l.supplierPay
        ? "Es un pago a proveedor: se corrige también en su cuenta corriente y en Gastos."
        : l.expense
          ? "Se corrige también en Gastos."
          : l.stockpilePay
            ? "Es un pago de acopio: se corrige también en el acopio."
            : "";
  const save = () => {
    const iso =
      date === move.date.slice(0, 10) ? move.date : new Date(`${date}T12:00:00`).toISOString();
    onClose(updateMovement(move.id, { date: iso, concept, amount, account }));
  };
  return (
    <Modal open onClose={() => onClose()} title="Editar movimiento">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Concepto" className="col-span-2">
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
        </Field>
        <Field label={move.amount < 0 ? "Monto (sale)" : "Monto (entra)"}>
          <NumberInput value={amount} onChange={setAmount} prefix="$" disabled={!!l.cheque} />
        </Field>
        <Field label="Fecha">
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </Field>
        <Field label="Cuenta">
          <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
            <option value="Caja">Caja</option>
            <option value="BBVA">BBVA</option>
            <option value="Provincia">Provincia</option>
            <option value={SEPARATE_BANK}>{SEPARATE_NAME}</option>
          </Select>
        </Field>
        {note && <p className="col-span-2 text-xs text-muted-foreground">{note}</p>}
        {move.closureId && (
          <p className="col-span-2 text-xs text-danger-soft-foreground">
            Este movimiento ya está en un cierre del día: el resumen de ese cierre no se recalcula.
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={() => onClose()}>
          Cancelar
        </button>
        <button className={btn.primary} disabled={amount <= 0} onClick={save}>
          Guardar cambios
        </button>
      </div>
    </Modal>
  );
}

/** Felix le paga a Áridos parte del saldo: retiro de efectivo, transferencia o cheque. Va descontando la deuda. */
function FelixSettle({ open, onClose, max }: { open: boolean; onClose: () => void; max: number }) {
  const { settleFelix } = useStore();
  const [amount, setAmount] = useState(0);
  const [how, setHow] = useState<"efectivo" | "transferencia" | "cheque" | "otro">("efectivo");
  const [to, setTo] = useState<Bank>("BBVA");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [chq, setChq] = useState({
    number: "",
    bank: "",
    drawer: "",
    dueDate: todayISO(),
    echeq: false,
  });
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setAmount(Math.max(0, max));
      setDate(todayISO());
      setNote("");
      setHow("efectivo");
      setChq({ number: "", bank: "", drawer: "", dueDate: todayISO(), echeq: false });
    }
  }
  const dest: Bank = how === "efectivo" ? "Caja" : to;
  const ok =
    amount > 0 && (how !== "cheque" || (!!chq.number.trim() && !!chq.bank.trim() && !!chq.dueDate));
  return (
    <Modal open={open} onClose={onClose} title="Felix le paga a Áridos (retiro)">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe" hint={max > 0 ? `El Tecla debe ${ars(max)}` : "Cuenta saldada"}>
          <NumberInput value={amount} onChange={setAmount} prefix="$" />
        </Field>
        <Field label="Cómo le pagó">
          <Select value={how} onChange={(e) => setHow(e.target.value as typeof how)}>
            <option value="efectivo">Retiro de efectivo (entra en Caja)</option>
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque (va a la cartera)</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        {(how === "transferencia" || how === "otro") && (
          <Field label="Entra en">
            <Select value={to} onChange={(e) => setTo(e.target.value as Bank)}>
              <option value="BBVA">BBVA</option>
              <option value="Provincia">Provincia</option>
              <option value="Caja">Caja</option>
            </Select>
          </Field>
        )}
        <Field label="Fecha">
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </Field>
        {how === "cheque" && (
          <>
            <Field label="N° de cheque *">
              <Input
                value={chq.number}
                onChange={(e) => setChq({ ...chq, number: e.target.value })}
              />
            </Field>
            <Field label="Banco *">
              <Input value={chq.bank} onChange={(e) => setChq({ ...chq, bank: e.target.value })} />
            </Field>
            <Field label="Librador">
              <Input
                value={chq.drawer}
                onChange={(e) => setChq({ ...chq, drawer: e.target.value })}
                placeholder="Felix (El Tecla)"
              />
            </Field>
            <Field label="Vencimiento (fecha de cobro)">
              <Input
                type="date"
                value={chq.dueDate}
                onChange={(e) => setChq({ ...chq, dueDate: e.target.value })}
              />
            </Field>
            <div className="col-span-2">
              <Toggle
                checked={chq.echeq}
                onChange={(v) => setChq({ ...chq, echeq: v })}
                label="Es e-cheq"
              />
            </div>
          </>
        )}
        <Field label="Nota (opcional)" className="col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="col-span-2 text-xs text-muted-foreground">
          {how === "cheque"
            ? "El saldo con Felix baja ya y el cheque queda en la cartera de Áridos: la plata entra al banco cuando lo depositás."
            : `El saldo con Felix baja y la plata suma en ${dest}.`}{" "}
          {amount > 0 && max > 0 && amount < max ? `Le queda debiendo ${ars(max - amount)}.` : ""}
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={!ok}
          onClick={() => {
            const iso =
              date === todayISO()
                ? new Date().toISOString()
                : new Date(`${date}T12:00:00`).toISOString();
            settleFelix({
              date: iso,
              amount,
              how,
              to: dest,
              note,
              cheque: how === "cheque" ? chq : undefined,
            });
            onClose();
          }}
        >
          Registrar {amount > 0 ? ars(amount) : ""}
        </button>
      </div>
    </Modal>
  );
}

/** Carga el saldo real de una cuenta: el sistema registra solo la diferencia. */
function AdjustBalance({
  open,
  onClose,
  fixedAccount,
}: {
  open: boolean;
  onClose: () => void;
  fixedAccount?: Bank;
}) {
  const { db, adjustBalance } = useStore();
  const [accountSel, setAccount] = useState<Bank>("Caja");
  const account = fixedAccount ?? accountSel;
  const [real, setReal] = useState(0);
  const [note, setNote] = useState("");
  // "saldo": cargo lo que hay hoy en la cuenta. "importe": sumo (o resto) un monto para que cierre.
  const [mode, setMode] = useState<"saldo" | "importe">("saldo");
  const [delta, setDelta] = useState(0);
  const [minus, setMinus] = useState(false);
  const now = accountBalance(db, account);
  const target = mode === "saldo" ? real : now + (minus ? -delta : delta);
  const diff = Math.round(target - now);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        fixedAccount
          ? `Saldo inicial / ajuste · ${bankLabel(fixedAccount)}`
          : "Saldo inicial / ajuste de saldo"
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuenta" className={fixedAccount ? "hidden" : ""}>
          <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
            <option value="Caja">Caja</option>
            <option value="BBVA">BBVA</option>
            <option value="Provincia">Provincia</option>
            <option value={SEPARATE_BANK}>{SEPARATE_NAME}</option>
          </Select>
        </Field>
        <div className="col-span-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "saldo", label: "Cargar el saldo que tengo hoy" },
              { value: "importe", label: "Sumar o restar un importe" },
            ]}
          />
        </div>
        {mode === "saldo" ? (
          <Field label="Saldo real hoy" hint={`En el sistema figura ${ars(now)}`}>
            <NumberInput value={real} onChange={setReal} prefix="$" />
          </Field>
        ) : (
          <Field label="Importe" hint={`En el sistema figura ${ars(now)}`}>
            <div className="flex items-center gap-2">
              <Select
                value={minus ? "-" : "+"}
                onChange={(e) => setMinus(e.target.value === "-")}
                className="w-20"
              >
                <option value="+">+</option>
                <option value="-">−</option>
              </Select>
              <NumberInput value={delta} onChange={setDelta} prefix="$" />
            </div>
          </Field>
        )}
        <Field label="Nota (opcional)" className="col-span-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={now === 0 ? "Saldo inicial" : "Ajuste de saldo"}
          />
        </Field>
        <p className="col-span-2 text-xs text-muted-foreground">
          {diff === 0
            ? "El saldo ya coincide."
            : `Se registra un ajuste de ${diff > 0 ? "+" : "−"}${ars(Math.abs(diff))} en ${account}. No cuenta como venta ni como gasto.`}
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={diff === 0}
          onClick={() => {
            adjustBalance(account, target, note);
            setReal(0);
            setDelta(0);
            setNote("");
            onClose();
          }}
        >
          Guardar saldo
        </button>
      </div>
    </Modal>
  );
}

function NewIncome({
  open,
  onClose,
  fixedAccount,
  out,
}: {
  open: boolean;
  onClose: () => void;
  fixedAccount?: Bank;
  /** Egreso: plata que sale de la cuenta. */
  out?: boolean;
}) {
  const { addIncome, addOutflow } = useStore();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [accountSel, setAccount] = useState<Bank>("Caja");
  const account = fixedAccount ?? accountSel;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        fixedAccount
          ? `${out ? "Egreso" : "Ingreso"} · ${bankLabel(fixedAccount)}`
          : out
            ? "Egreso"
            : "Ingreso extra"
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Concepto" className="col-span-2">
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder={
              out
                ? "Transferencia, comisión del banco, retiro…"
                : "Aporte, devolución, venta de un equipo…"
            }
          />
        </Field>
        <Field label="Monto">
          <NumberInput value={amount} onChange={setAmount} prefix="$" />
        </Field>
        {fixedAccount ? (
          <Field label="Fecha">
            <Input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
        ) : (
          <Field label={out ? "Sale de" : "Entra en"}>
            <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
              <option value="Caja">Caja</option>
              <option value="BBVA">BBVA</option>
              <option value="Provincia">Provincia</option>
              <option value={SEPARATE_BANK}>{SEPARATE_NAME}</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={!concept || amount <= 0}
          onClick={() => {
            const iso =
              date === todayISO()
                ? new Date().toISOString()
                : new Date(`${date}T12:00:00`).toISOString();
            if (out) addOutflow(iso, concept, amount, account);
            else addIncome(iso, concept, amount, account);
            setConcept("");
            setAmount(0);
            onClose();
          }}
        >
          Registrar
        </button>
      </div>
    </Modal>
  );
}
