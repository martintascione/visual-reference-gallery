import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Purchase } from "@/lib/types";
import { clientBalance, supplierAccounts, useStore } from "@/lib/store";
import { addDays, ars, fmtDateNum, todayISO, uid } from "@/lib/format";
import { Field, Input, Modal, NumberInput, Segmented, btn } from "@/components/ui-bits";

export type ScheduleRow = { id: string; amount: number; date: string };

/** Reparte el total en cuotas iguales (la última absorbe el redondeo). */
export function buildSchedule(total: number, n: number, first: string, every: number) {
  const count = Math.max(1, Math.round(n));
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    amount: i === count - 1 ? Math.round(total - base * (count - 1)) : base,
    date: addDays(first, every * i),
  }));
}

/** Cronograma de pagos: un pago o varios, con importe y fecha de cada uno. */
export function ScheduleEditor({
  total,
  rows,
  setRows,
  label,
}: {
  total: number;
  rows: ScheduleRow[];
  setRows: (r: ScheduleRow[]) => void;
  /** "pagar" o "cobrar", para los textos. */
  label: "pagar" | "cobrar";
}) {
  const [n, setN] = useState(rows.length || 1);
  const [first, setFirst] = useState(rows[0]?.date ?? addDays(todayISO(), 30));
  const [every, setEvery] = useState(30);
  const [touched, setTouched] = useState(false);
  // Mientras no se toque a mano un renglón, el cronograma se arma solo con el total, las cuotas y la fecha.
  useEffect(() => {
    if (touched) return;
    setRows(buildSchedule(total, n, first, every));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, n, first, every, touched]);
  const sum = rows.reduce((a, r) => a + (r.amount || 0), 0);
  const diff = Math.round(total - sum);
  const upd = (id: string, patch: Partial<ScheduleRow>) => {
    setTouched(true);
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="on-surface rounded-3xl bg-surface p-4">
      <p className="mb-3 text-xs font-semibold">
        Cronograma de {label === "pagar" ? "pagos" : "cobros"}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cuotas">
          <NumberInput
            value={n}
            onChange={(v) => {
              setTouched(false);
              setN(Math.max(1, Math.min(48, Math.round(v) || 1)));
            }}
          />
        </Field>
        <Field label={n > 1 ? "Primera fecha" : "Fecha"}>
          <Input
            type="date"
            value={first}
            onChange={(e) => {
              setTouched(false);
              setFirst(e.target.value || todayISO());
            }}
          />
        </Field>
        {n > 1 ? (
          <Field label="Cada">
            <NumberInput
              value={every}
              onChange={(v) => {
                setTouched(false);
                setEvery(Math.max(1, Math.round(v) || 30));
              }}
              suffix="días"
            />
          </Field>
        ) : (
          <span />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[1, 2, 3, 6].map((k) => (
          <button
            key={k}
            type="button"
            className={n === k && !touched ? btn.soft : btn.ghost}
            onClick={() => {
              setTouched(false);
              setN(k);
            }}
          >
            {k === 1 ? "Un pago" : `${k} cuotas`}
          </button>
        ))}
      </div>
      {total > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {rows.map((r, k) => (
            <div key={r.id} className="flex items-end gap-2">
              <span className="w-14 pb-2.5 text-xs text-muted-foreground">
                {rows.length > 1 ? `${k + 1}/${rows.length}` : "Pago"}
              </span>
              <Field label={k === 0 ? "Importe" : ""} className="flex-1">
                <NumberInput
                  value={r.amount}
                  onChange={(v) => upd(r.id, { amount: v })}
                  prefix="$"
                />
              </Field>
              <Field label={k === 0 ? "Fecha" : ""} className="flex-1">
                <Input
                  type="date"
                  value={r.date}
                  onChange={(e) => upd(r.id, { date: e.target.value || r.date })}
                />
              </Field>
              {rows.length > 1 && (
                <button
                  type="button"
                  className={`${btn.icon} mb-1`}
                  aria-label="Quitar cuota"
                  onClick={() => {
                    setTouched(true);
                    setRows(rows.filter((x) => x.id !== r.id));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                setTouched(true);
                const last = rows[rows.length - 1];
                setRows([
                  ...rows,
                  {
                    id: uid(),
                    amount: Math.max(0, diff),
                    date: addDays(last?.date ?? first, every),
                  },
                ]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Otra cuota
            </button>
            {diff !== 0 ? (
              <span className="text-xs text-danger-soft-foreground">
                Las cuotas suman {ars(sum)}: {diff > 0 ? "faltan" : "sobran"} {ars(Math.abs(diff))}.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    const last = rows[rows.length - 1];
                    if (last) upd(last.id, { amount: last.amount + diff });
                  }}
                >
                  Ajustar la última
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Te avisa cada fecha en Inicio, Notificaciones y Calendario.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const key = (kind: string, party: string) => kind + "|" + party.trim().toLowerCase();

/**
 * Deuda nuestra con un proveedor sin cargar mercadería: saldos anteriores, facturas viejas, etc.
 * Si se arma en cuotas, cada cuota queda como una deuda con su fecha de aviso.
 */
export function SupplierDebtForm({
  open,
  onClose,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  edit?: Purchase | undefined;
}) {
  const { db, addPurchase, updatePurchase } = useStore();
  const [kind, setKind] = useState<"cantera" | "transporte">("cantera");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [due, setDue] = useState("");
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    if (!open) return;
    const k = edit?.debtOnly ?? "cantera";
    setKind(k);
    setParty(edit ? (k === "cantera" ? edit.supplier : (edit.carrier ?? "")) : "");
    setAmount(
      edit
        ? k === "cantera"
          ? edit.items.reduce((a, i) => a + i.total, 0)
          : edit.freightTotal
        : 0,
    );
    setDate(edit ? edit.date.slice(0, 10) : todayISO());
    setNote(edit?.note ?? "");
    setDue(edit ? ((k === "cantera" ? edit.payDue : edit.freightDue) ?? "") : "");
    setRows([]);
    setSeed((x) => x + 1);
  }, [open, edit]);

  const accounts = useMemo(() => supplierAccounts(db), [db]);
  const names = [
    ...new Set(
      (kind === "cantera"
        ? db.purchases.filter((p) => p.debtOnly !== "transporte").map((p) => p.supplier)
        : db.purchases.flatMap((p) => [p.carrier ?? "", p.unloadBy ?? ""])
      ).filter((x) => x.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const current = accounts.find((a) => key(a.kind, a.party) === key(kind, party));
  const editAmount = edit
    ? edit.debtOnly === "cantera"
      ? edit.items.reduce((a, i) => a + i.total, 0)
      : edit.freightTotal
    : 0;
  const before = (current?.saldo ?? 0) - (edit ? editAmount : 0);
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const ok =
    party.trim().length > 1 &&
    amount > 0 &&
    (!!edit || (rows.length > 0 && Math.round(sum) === Math.round(amount)));

  const save = () => {
    const name = party.trim();
    const iso = (d: string) =>
      edit && d === edit.date.slice(0, 10) ? edit.date : d + "T12:00:00.000Z";
    const one = (total: number, payDue: string | undefined, detail: string) =>
      kind === "cantera"
        ? {
            date: iso(date),
            supplier: name,
            items: [{ name: detail || "Deuda anterior", tons: 0, pricePerTon: 0, total }],
            freightTons: 0,
            freightRate: 0,
            freightTotal: 0,
            unloadCost: 0,
            note: detail || undefined,
            payDue,
            debtOnly: "cantera" as const,
          }
        : {
            date: iso(date),
            supplier: "",
            items: [],
            carrier: name,
            freightTons: 0,
            freightRate: 0,
            freightTotal: total,
            unloadCost: 0,
            note: detail || undefined,
            freightDue: payDue,
            debtOnly: "transporte" as const,
          };
    if (edit)
      updatePurchase(edit.id, one(Math.round(amount), due || undefined, note.trim()), false);
    else
      rows.forEach((r, k) =>
        addPurchase(
          one(
            Math.round(r.amount),
            r.date,
            rows.length > 1
              ? `Cuota ${k + 1}/${rows.length}${note.trim() ? " · " + note.trim() : ""}`
              : note.trim(),
          ),
          false,
        ),
      );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={edit ? "Editar deuda" : "Cargar deuda con un proveedor"}
      subtitle="Lo que le debemos a una cantera, proveedor o transporte, sin cargar mercadería. No toca el stock ni los costos."
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!ok} onClick={save}>
            {edit ? "Guardar cambios" : `Cargar deuda${amount > 0 ? " " + ars(amount) : ""}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="col-span-2">
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k);
                setParty("");
              }}
              options={[
                { value: "cantera", label: "Cantera / proveedor" },
                { value: "transporte", label: "Transporte" },
              ]}
            />
          </div>
          <Field
            label={kind === "cantera" ? "Cantera o proveedor" : "Transporte"}
            className="col-span-2"
            hint={
              party.trim().length > 1
                ? current
                  ? `Ya está cargado · hoy se le debe ${ars(Math.max(0, before))}`
                  : "Nuevo: queda creado con su cuenta al guardar"
                : "Elegilo de la lista o escribí uno nuevo"
            }
          >
            <Input
              list="deuda-proveedores"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder={kind === "cantera" ? "Ej: La Helena" : "Ej: Cucumelo"}
              autoFocus
            />
            <datalist id="deuda-proveedores">
              {names.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="Importe total que se le debe">
            <NumberInput value={amount} onChange={setAmount} prefix="$" />
          </Field>
          <Field
            label="Fecha de la deuda"
            help="El día de la factura o del saldo, aunque sea viejo."
          >
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Detalle (opcional)" className="col-span-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: saldo anterior, factura 0001-00000234, remito 552"
            />
          </Field>
          {edit && (
            <Field label="Avisarme para pagarla (opcional)" className="col-span-2">
              <span className="block w-40">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </span>
            </Field>
          )}
        </div>
        {!edit && (
          <ScheduleEditor
            key={seed}
            total={Math.round(amount)}
            rows={rows}
            setRows={setRows}
            label="pagar"
          />
        )}
        {!edit && party.trim().length > 1 && amount > 0 && (
          <p className="rounded-2xl bg-surface p-3 text-xs">
            {current
              ? `Hoy se le debe ${ars(Math.max(0, before))}. Con esta deuda queda en `
              : "Queda creado con una deuda de "}
            <b className="text-danger-soft-foreground">{ars(Math.max(0, before) + amount)}</b>. Los
            pagos se cargan desde su cuenta, total o en partes.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Saldo que nos debe un cliente (ya cargado o nuevo, que se crea al guardar), con su cronograma de cobro. */
export function ClientDebtForm({
  open,
  onClose,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  /** Cliente ya elegido (desde su ficha). */
  clientId?: string | undefined;
}) {
  const { db, upsertClient, addDebtSchedule } = useStore();
  const blank = { name: "", phone: "", email: "", cuit: "", amount: 0, concept: "" };
  const [f, setF] = useState(blank);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    if (!open) return;
    const c = db.clients.find((x) => x.id === clientId);
    setF(
      c
        ? { ...blank, name: c.name, phone: c.phone ?? "", email: c.email ?? "", cuit: c.cuit ?? "" }
        : blank,
    );
    setRows([]);
    setSeed((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);
  const norm = (t: string) => t.trim().toLowerCase();
  const digits = (t: string) => t.replace(/\D/g, "");
  // Si el nombre o el CUIT coinciden con un cliente, se usa ese (y se completan sus datos).
  const match =
    db.clients.find((c) => f.name.trim() && norm(c.name) === norm(f.name)) ??
    db.clients.find((c) => digits(f.cuit).length === 11 && digits(c.cuit ?? "") === digits(f.cuit));
  const pick = (name: string) => {
    const c = db.clients.find((x) => norm(x.name) === norm(name));
    setF((x) => ({
      ...x,
      name,
      ...(c
        ? { phone: c.phone ?? x.phone, email: c.email ?? x.email, cuit: c.cuit ?? x.cuit }
        : {}),
    }));
  };
  const bal = match ? clientBalance(db, match.id) : null;
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const ok =
    f.name.trim().length > 1 &&
    f.amount > 0 &&
    rows.length > 0 &&
    Math.round(sum) === Math.round(f.amount);
  const save = () => {
    const id = match?.id ?? "c" + Date.now().toString(36);
    upsertClient({
      ...(match ?? { id, name: f.name.trim(), creditLimit: 0 }),
      phone: f.phone.trim() || match?.phone,
      email: f.email.trim() || match?.email,
      cuit: f.cuit.trim() || match?.cuit,
    });
    addDebtSchedule(
      id,
      rows.map((r) => ({ amount: r.amount, date: r.date })),
      f.concept.trim(),
    );
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Cargar saldo de un cliente"
      subtitle={
        match
          ? `Se suma a la cuenta corriente de ${match.name}${bal && bal.balance > 0 ? ` (hoy debe ${ars(bal.balance)})` : ""}`
          : f.name.trim().length > 1
            ? "Cliente nuevo: se guarda solo al cargar"
            : "Lo que nos debe un cliente: saldo anterior, fiado, etc."
      }
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!ok} onClick={save}>
            Cargar {f.amount > 0 ? ars(f.amount) : ""}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Field
            label="Cliente"
            className="col-span-2"
            hint={
              f.name.trim().length > 1
                ? match
                  ? "Ya está cargado"
                  : "Nuevo: se crea al guardar con estos datos"
                : "Elegilo de la lista o escribí uno nuevo"
            }
          >
            <Input
              list="clientes-saldo"
              value={f.name}
              onChange={(e) => pick(e.target.value)}
              placeholder="Nombre o razón social"
              autoFocus
            />
            <datalist id="clientes-saldo">
              {db.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="WhatsApp">
            <Input
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              inputMode="tel"
            />
          </Field>
          <Field label="Email">
            <Input
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              type="email"
            />
          </Field>
          <Field label="CUIT">
            <Input
              value={f.cuit}
              onChange={(e) => setF({ ...f, cuit: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Importe total que debe">
            <NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} prefix="$" />
          </Field>
          <Field label="Detalle (opcional)" className="col-span-2">
            <Input
              value={f.concept}
              onChange={(e) => setF({ ...f, concept: e.target.value })}
              placeholder="Ej: saldo anterior, pedido de octubre"
            />
          </Field>
        </div>
        <ScheduleEditor
          key={seed}
          total={Math.round(f.amount)}
          rows={rows}
          setRows={setRows}
          label="cobrar"
        />
      </div>
    </Modal>
  );
}

/** Texto corto del próximo vencimiento: "19/12/2026 · $ 300.000". */
export const nextDueText = (date: string | undefined, amount: number | undefined) =>
  date ? `${fmtDateNum(date)} · ${ars(amount ?? 0)}` : "Sin fecha";
