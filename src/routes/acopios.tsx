import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Search, Trash2, Truck, Wallet } from "lucide-react";
import type { Bank, Quote, SaleUnit, Stockpile } from "@/lib/types";
import { stockpileBalance, useStore } from "@/lib/store";
import { ars, fmtDateNum, num, todayISO } from "@/lib/format";
import { listPrice, qtyUnit, saleUnitsFor, toBaseQty, unitLabelFor } from "@/lib/pricing";
import {
  Badge,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Stat,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/acopios")({
  head: () => ({
    meta: [
      { title: "Acopios · Corralón" },
      {
        name: "description",
        content: "Pagos a cuenta de los clientes y los retiros de mercadería contra ese saldo.",
      },
    ],
  }),
  component: Acopios,
});

const unitShort: Record<SaleUnit, string> = {
  kg: "kg",
  t: "t",
  bolson: "bolsas",
  bigbag: "bolsones",
  bigbag2: "bolsones",
  viaje: "viajes",
  m2: "m²",
  u: "u",
  l: "L",
};

const isoOf = (d: string) => (d === todayISO() ? new Date().toISOString() : d + "T12:00:00.000Z");

function Acopios() {
  const { db } = useStore();
  const list = useMemo(() => db.stockpiles ?? [], [db.stockpiles]);
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fromQuote, setFromQuote] = useState<Quote | null>(null);
  // Desde Presupuestos ("Pasar a acopio"): se abre el alta ya cargada con ese presupuesto.
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("ap-acopio-desde");
      if (!id) return;
      sessionStorage.removeItem("ap-acopio-desde");
      const q = db.quotes.find((x) => x.id === id);
      if (q) {
        setFromQuote(q);
        setAdding(true);
      }
    } catch {
      /* sin storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.find((s) => s.id === openId) ?? null;
  // Desde el detalle de una venta "queda en acopio": se abre ese acopio.
  useEffect(() => {
    try {
      const saleId = sessionStorage.getItem("ap-acopio-abrir");
      if (!saleId) return;
      sessionStorage.removeItem("ap-acopio-abrir");
      const sp = list.find((x) => x.saleId === saleId);
      if (sp) setOpenId(sp.id);
    } catch {
      /* sin storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = list
    .filter((s) => showClosed || !s.closed)
    .filter((s) => !q.trim() || s.clientName.toLowerCase().includes(q.trim().toLowerCase()))
    .map((s) => ({ s, b: stockpileBalance(s) }))
    .sort((x, y) => y.b.saldo - x.b.saldo);
  const active = list.filter((s) => !s.closed).map((s) => stockpileBalance(s));
  const favor = active.reduce((a, b) => a + Math.max(0, b.saldo), 0);
  const month = todayISO().slice(0, 7);
  const takenMonth = list
    .flatMap((s) => s.withdrawals)
    .filter((w) => w.date.slice(0, 7) === month)
    .reduce((a, w) => a + w.total, 0);

  return (
    <>
      <PageHeader
        title="Acopios"
        subtitle="El cliente paga a cuenta y va retirando la mercadería. El saldo se descuenta solo con cada retiro."
      >
        <button className={btn.primary} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Nuevo acopio
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Mercadería pagada sin retirar"
          value={ars(favor)}
          sub="Saldo a favor de los clientes"
        />
        <Stat label="Acopios abiertos" value={String(active.length)} />
        <Stat label="Retirado este mes" value={ars(takenMonth)} />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente"
              className="pl-9"
            />
          </div>
          <button className={btn.ghost} onClick={() => setShowClosed((x) => !x)}>
            {showClosed ? "Ocultar cerrados" : "Ver también los cerrados"}
          </button>
        </div>
        <Table
          head={[
            "Cliente",
            "Desde",
            { label: "Pagado", right: true },
            { label: "Retirado", right: true },
            { label: "Le queda", right: true },
            "Último retiro",
          ]}
          min={720}
        >
          {rows.map(({ s, b }) => {
            const last = [...s.withdrawals].sort((x, y) => y.date.localeCompare(x.date))[0];
            return (
              <tr key={s.id} className={`${tr} cursor-pointer`} onClick={() => setOpenId(s.id)}>
                <td>
                  <p className="font-medium">{s.clientName}</p>
                  {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
                  {s.closed && <Badge>Cerrado</Badge>}
                </td>
                <td className="whitespace-nowrap">
                  {fmtDateNum(s.date.slice(0, 10))}
                  {s.pickupBy && (
                    <p
                      className={`text-[11px] ${!s.closed && s.pickupBy < todayISO() ? "text-danger-soft-foreground" : "text-muted-foreground"}`}
                    >
                      retira hasta {fmtDateNum(s.pickupBy)}
                    </p>
                  )}
                </td>
                <td className="text-right tabular-nums">{ars(b.paid)}</td>
                <td className="text-right tabular-nums">{ars(b.taken)}</td>
                <td
                  className={`text-right font-semibold tabular-nums ${b.saldo < 0 ? "text-danger-soft-foreground" : ""}`}
                >
                  {ars(b.saldo)}
                </td>
                <td className="text-xs text-muted-foreground">
                  {last
                    ? `${fmtDateNum(last.date.slice(0, 10))} · ${qtyUnit(last.qty, last.unit)} ${last.name}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </Table>
        {rows.length === 0 && (
          <Empty
            title={list.length ? "Ningún acopio coincide" : "Todavía no hay acopios"}
            text='Con "Nuevo acopio" anotás lo que pagó el cliente a cuenta. Después vas cargando cada retiro y el saldo se descuenta solo.'
          />
        )}
      </Card>

      <NewStockpile
        open={adding}
        fromQuote={fromQuote}
        onClose={() => {
          setAdding(false);
          setFromQuote(null);
        }}
        onCreated={(id) => setOpenId(id)}
      />
      <StockpileDetail s={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function PayInputs({
  amount,
  setAmount,
  method,
  setMethod,
  account,
  setAccount,
  date,
  setDate,
}: {
  amount: number;
  setAmount: (n: number) => void;
  method: "efectivo" | "transferencia";
  setMethod: (m: "efectivo" | "transferencia") => void;
  account: Bank;
  setAccount: (b: Bank) => void;
  date: string;
  setDate: (d: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
      <Field label="Monto pagado a cuenta">
        <NumberInput value={amount} onChange={setAmount} prefix="$" />
      </Field>
      <Field label="Fecha">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
      </Field>
      <Field label="Cómo pagó">
        <Select
          value={method}
          onChange={(e) => setMethod(e.target.value as "efectivo" | "transferencia")}
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
        </Select>
      </Field>
      <Field label="Entra en">
        <Select
          value={method === "efectivo" ? "Caja" : account}
          onChange={(e) => setAccount(e.target.value as Bank)}
          disabled={method === "efectivo"}
        >
          {method === "efectivo" && <option value="Caja">Caja</option>}
          <option value="BBVA">BBVA</option>
          <option value="Provincia">Provincia</option>
        </Select>
      </Field>
    </div>
  );
}

function NewStockpile({
  open,
  onClose,
  onCreated,
  fromQuote,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  fromQuote?: Quote | null;
}) {
  const { db, upsertClient, addStockpile, addStockpilePayment, updateQuote } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<"efectivo" | "transferencia">("transferencia");
  const [account, setAccount] = useState<Bank>("BBVA");
  useEffect(() => {
    if (!open) return;
    const q = fromQuote;
    setName(q && q.clientName.toLowerCase() !== "consumidor final" ? q.clientName : "");
    setPhone(q?.phone ?? "");
    setNote(q ? `Presupuesto N° ${String(q.number).padStart(4, "0")}` : "");
    setAmount(q?.total ?? 0);
    setDate(todayISO());
  }, [open, fromQuote]);
  const norm = (t: string) => t.trim().toLowerCase();
  const match = db.clients.find((c) => name.trim() && norm(c.name) === norm(name));
  const ok = name.trim().length > 1 && amount > 0;
  const save = () => {
    const clientId = match?.id ?? "c" + Date.now().toString(36);
    if (!match)
      upsertClient({
        id: clientId,
        name: name.trim(),
        phone: phone.trim() || undefined,
        creditLimit: 0,
      });
    const q = fromQuote;
    // Precio final por unidad de lo presupuestado: con la bonificación del ítem, la del total y el IVA si va.
    const k = q
      ? (1 - (q.discountPct ?? 0) / 100) * (q.withIva ? 1 + db.settings.ivaPct / 100 : 1)
      : 1;
    const id = addStockpile({
      clientId,
      clientName: match?.name ?? name.trim(),
      date: isoOf(date),
      note: note.trim() || undefined,
      ...(q
        ? {
            quoteId: q.id,
            withIva: q.withIva || undefined,
            items: q.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              qty: i.qty,
              unit: i.unit,
              unitPrice: Math.round((i.qty ? i.subtotal / i.qty : i.unitPrice) * k),
            })),
          }
        : {}),
    });
    if (q) updateQuote(q.id, { status: "aceptado" });
    addStockpilePayment(id, {
      date: isoOf(date),
      amount,
      method,
      account: method === "efectivo" ? "Caja" : account,
    });
    onClose();
    onCreated(id);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        fromQuote
          ? `Acopio del presupuesto N° ${String(fromQuote.number).padStart(4, "0")}`
          : "Nuevo acopio"
      }
      subtitle={
        fromQuote
          ? `Lo presupuestado (${ars(fromQuote.total)}) queda guardado con sus precios para valorizar cada retiro`
          : "Lo que el cliente paga a cuenta para ir retirando la mercadería de a poco"
      }
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!ok} onClick={save}>
            Crear acopio{amount > 0 ? ` con ${ars(amount)}` : ""}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Field
            label="Cliente"
            hint={
              name.trim().length > 1
                ? match
                  ? "Ya está cargado"
                  : "Nuevo: se crea al guardar"
                : "Elegilo de la lista o escribí uno nuevo"
            }
          >
            <Input
              list="acopio-clientes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre o razón social"
              autoFocus
            />
            <datalist id="acopio-clientes">
              {db.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          {match ? (
            <span />
          ) : (
            <Field label="WhatsApp (opcional)">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
          )}
          <Field label="Detalle (opcional)" className="col-span-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: obra calle San Martín 450, 10 t de piedra partida"
            />
          </Field>
        </div>
        <PayInputs
          amount={amount}
          setAmount={setAmount}
          method={method}
          setMethod={setMethod}
          account={account}
          setAccount={setAccount}
          date={date}
          setDate={setDate}
        />
      </div>
    </Modal>
  );
}

type AcItem = NonNullable<Stockpile["items"]>[number];

/** Productos del acopio: retira hasta, y editar cantidades, precios, sumar o sacar productos. */
function ItemsEditor({ s }: { s: Stockpile }) {
  const { db, updateStockpile } = useStore();
  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState<AcItem[]>([]);
  const [pid, setPid] = useState("");
  const [unit, setUnit] = useState<SaleUnit>("t");
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState<number | undefined>(undefined);
  useEffect(() => setEdit(false), [s.id]);
  const products = useMemo(
    () => db.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
    [db.products],
  );
  const items = s.items ?? [];
  const b = stockpileBalance(s);
  const value = items.reduce((a, i) => a + Math.round(i.unitPrice * i.qty), 0);
  const ivaK = s.withIva ? 1 + db.settings.ivaPct / 100 : 1;
  const p = products.find((x) => x.id === pid);
  const units = p ? saleUnitsFor(p) : [];
  const u = p && units.includes(unit) ? unit : (units[0] ?? "u");
  const unitPrice = price ?? (p ? Math.round(listPrice(p, u) * ivaK) : 0);
  const took = (it: AcItem) =>
    s.withdrawals
      .filter((w) => w.productId === it.productId && w.unit === it.unit)
      .reduce((a, w) => a + w.qty, 0);
  const sale = s.saleId ? db.sales.find((x) => x.id === s.saleId) : undefined;
  const start = () => {
    setRows(items.map((i) => ({ ...i })));
    setPid("");
    setQty(0);
    setPrice(undefined);
    setEdit(true);
  };
  const addRow = () => {
    if (!p || qty <= 0) return;
    setRows((r) => [...r, { productId: p.id, name: p.name, qty, unit: u, unitPrice }]);
    setPid("");
    setQty(0);
    setPrice(undefined);
  };
  const save = () => {
    updateStockpile(s.id, { items: rows.filter((r) => r.qty > 0) });
    setEdit(false);
  };
  const newValue = rows.reduce((a, i) => a + Math.round(i.unitPrice * i.qty), 0);
  const diff = (edit ? newValue : value) - b.paid;
  return (
    <div className="on-surface rounded-3xl bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold">
          <Package className="h-4 w-4" strokeWidth={1.6} /> Productos acopiados
          {sale && (
            <span className="font-normal text-muted-foreground">· venta #{sale.number}</span>
          )}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Retira hasta</span>
          <span className="w-40">
            <Input
              type="date"
              value={s.pickupBy ?? ""}
              onChange={(e) => updateStockpile(s.id, { pickupBy: e.target.value || undefined })}
            />
          </span>
        </div>
      </div>
      {!edit ? (
        <>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin productos cargados: los retiros se cargan con cualquier producto.
            </p>
          )}
          {items.map((it) => (
            <p
              key={it.productId + it.unit}
              className="flex justify-between gap-2 border-b border-border/40 py-1 text-xs last:border-0"
            >
              <span>
                {qtyUnit(it.qty, it.unit)} {it.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {ars(it.unitPrice)} c/u · retiró {qtyUnit(took(it), it.unit)}
                </span>
              </span>
              <span className="tabular-nums">{ars(Math.round(it.unitPrice * it.qty))}</span>
            </p>
          ))}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Acopiado {ars(value)} · pagado {ars(b.paid)}
              {items.length > 0 && diff !== 0 && (
                <b className={diff > 0 ? "text-danger-soft-foreground" : ""}>
                  {" "}
                  · {diff > 0 ? `falta cobrar ${ars(diff)}` : `a favor ${ars(-diff)}`}
                </b>
              )}
            </span>
            <button className={`${btn.soft} h-8 px-3 text-xs`} onClick={start}>
              Editar productos
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_110px_120px_auto] items-center gap-2 rounded-2xl bg-card p-2 text-xs"
            >
              <span className="truncate font-medium">
                {r.name}
                {took(r) > 0 && (
                  <span className="block font-normal text-muted-foreground">
                    ya retiró {qtyUnit(took(r), r.unit)}
                  </span>
                )}
              </span>
              <NumberInput
                value={r.qty}
                onChange={(v) =>
                  setRows((x) => x.map((y, j) => (j === i ? { ...y, qty: Math.max(0, v) } : y)))
                }
                suffix={unitShort[r.unit]}
              />
              <NumberInput
                value={r.unitPrice}
                onChange={(v) =>
                  setRows((x) =>
                    x.map((y, j) => (j === i ? { ...y, unitPrice: Math.max(0, v) } : y)),
                  )
                }
                prefix="$"
              />
              <button
                className={btn.icon}
                aria-label="Sacar producto"
                title="Sacar este producto del acopio"
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-card p-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_120px_auto]">
            <Select
              value={pid}
              onChange={(e) => {
                setPid(e.target.value);
                setPrice(undefined);
              }}
              className="col-span-2 sm:col-span-1"
            >
              <option value="">Sumar un producto…</option>
              {products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select value={u} onChange={(e) => setUnit(e.target.value as SaleUnit)} disabled={!p}>
              {units.map((x) => (
                <option key={x} value={x}>
                  {unitShort[x]}
                </option>
              ))}
            </Select>
            <NumberInput value={qty} onChange={setQty} suffix={unitShort[u]} />
            <NumberInput value={unitPrice} onChange={(v) => setPrice(v)} prefix="$" />
            <button
              className={`${btn.soft} h-9 px-3 text-xs`}
              disabled={!p || qty <= 0}
              onClick={addRow}
            >
              <Plus className="h-3.5 w-3.5" /> Sumar
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Acopiado {ars(newValue)} · pagado {ars(b.paid)}
              {diff !== 0 && (
                <b className={diff > 0 ? "text-danger-soft-foreground" : ""}>
                  {" "}
                  · {diff > 0 ? `falta cobrar ${ars(diff)}` : `a favor ${ars(-diff)}`}
                </b>
              )}
            </span>
            <span className="flex gap-2">
              <button className={btn.soft} onClick={() => setEdit(false)}>
                Cancelar
              </button>
              <button className={btn.primary} onClick={save}>
                Guardar productos
              </button>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si suma productos, cobrá la diferencia con "Otro pago a cuenta". La venta original no se
            modifica: el acopio lleva la cuenta de lo que falta retirar.
          </p>
        </div>
      )}
    </div>
  );
}

function StockpileDetail({ s, onClose }: { s: Stockpile | null; onClose: () => void }) {
  const {
    db,
    addStockpilePayment,
    removeStockpilePayment,
    addStockpileWithdrawal,
    removeStockpileWithdrawal,
    updateStockpile,
    removeStockpile,
  } = useStore();
  const products = useMemo(
    () => db.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
    [db.products],
  );
  // Retiro
  const [wDate, setWDate] = useState(todayISO());
  const [place, setPlace] = useState("Retira en el corralón");
  const [pid, setPid] = useState("");
  const [unit, setUnit] = useState<SaleUnit>("t");
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState<number | undefined>(undefined);
  // Retiro de lo presupuestado: cantidad que se lleva hoy de cada producto.
  const [takes, setTakes] = useState<Record<string, number>>({});
  const [showOther, setShowOther] = useState(false);
  // Pago
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [pDate, setPDate] = useState(todayISO());
  const [method, setMethod] = useState<"efectivo" | "transferencia">("transferencia");
  const [account, setAccount] = useState<Bank>("BBVA");
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    setPid("");
    setQty(0);
    setPrice(undefined);
    setTakes({});
    setShowOther(false);
    setPayOpen(false);
    setConfirm(null);
  }, [s?.id]);

  if (!s) return null;
  const b = stockpileBalance(s);
  const p = products.find((x) => x.id === pid);
  const units = p ? saleUnitsFor(p) : [];
  const u = p && units.includes(unit) ? unit : (units[0] ?? "u");
  const quoted = p ? s.items?.find((x) => x.productId === p.id && x.unit === u) : undefined;
  const ivaK = s.withIva ? 1 + db.settings.ivaPct / 100 : 1;
  // Precio del presupuesto si ese producto estaba presupuestado; si no, lista de hoy (con IVA si el acopio va con IVA).
  const unitPrice = price ?? quoted?.unitPrice ?? (p ? Math.round(listPrice(p, u) * ivaK) : 0);
  const otherTotal = p && qty > 0 ? Math.round(unitPrice * qty) : 0;
  const keyOf = (it: { productId: string; unit: SaleUnit }) => it.productId + "|" + it.unit;
  const quotedRows = (s.items ?? []).map((it) => {
    const took = s.withdrawals
      .filter((w) => w.productId === it.productId && w.unit === it.unit)
      .reduce((a, w) => a + w.qty, 0);
    const now = takes[keyOf(it)] ?? 0;
    return { it, took, left: Math.max(0, it.qty - took), now, sub: Math.round(it.unitPrice * now) };
  });
  const quotedTotal = quotedRows.reduce((a, r) => a + r.sub, 0);
  const total = quotedTotal + (showOther || !s.items?.length ? otherTotal : 0);
  const after = b.saldo - total;
  const hasOther = (showOther || !s.items?.length) && !!p && qty > 0;
  const client = db.clients.find((c) => c.id === s.clientId);
  const places = [
    "Retira en el corralón",
    ...(client?.address ? [`Entrega en ${client.address}`] : []),
    ...new Set(s.withdrawals.map((w) => w.place).filter(Boolean)),
  ];

  const addW = () => {
    const where = place.trim() || "Retira en el corralón";
    const when = isoOf(wDate);
    for (const r of quotedRows) {
      if (r.now <= 0) continue;
      const prod = db.products.find((x) => x.id === r.it.productId);
      addStockpileWithdrawal(s.id, {
        date: when,
        place: where,
        productId: r.it.productId,
        name: r.it.name,
        qty: r.now,
        unit: r.it.unit,
        unitPrice: r.it.unitPrice,
        total: r.sub,
        baseQty: prod ? toBaseQty(prod, r.now, r.it.unit) : r.now,
      });
    }
    if (hasOther && p)
      addStockpileWithdrawal(s.id, {
        date: when,
        place: where,
        productId: p.id,
        name: p.name,
        qty,
        unit: u,
        unitPrice,
        total: otherTotal,
        baseQty: toBaseQty(p, qty, u),
      });
    setTakes({});
    setQty(0);
    setPid("");
    setPrice(undefined);
    setShowOther(false);
  };
  const addP = () => {
    if (amount <= 0) return;
    addStockpilePayment(s.id, {
      date: isoOf(pDate),
      amount,
      method,
      account: method === "efectivo" ? "Caja" : account,
    });
    setAmount(0);
    setPayOpen(false);
  };

  const moves = [
    ...s.payments.map((x) => ({
      id: x.id,
      kind: "pago" as const,
      date: x.date,
      detail:
        x.method === "venta"
          ? `Pagado en la ${x.detail ?? "venta"}`
          : `Pago a cuenta · ${x.method === "efectivo" ? "Efectivo" : `Transferencia ${x.account}`}`,
      fromSale: x.method === "venta",
      plus: x.amount,
      minus: 0,
    })),
    ...s.withdrawals.map((x) => ({
      id: x.id,
      kind: "retiro" as const,
      date: x.date,
      detail: `${qtyUnit(x.qty, x.unit)} ${x.name} × ${ars(x.unitPrice)} · ${x.place}`,
      plus: 0,
      minus: x.total,
      fromSale: false,
    })),
  ].sort((x, y) => x.date.localeCompare(y.date));
  let run = 0;
  const withSaldo = moves.map((m) => ({ ...m, saldo: (run += m.plus - m.minus) }));

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Acopio · ${s.clientName}`}
      subtitle={`Pagó ${ars(b.paid)} · retiró ${ars(b.taken)} · ${b.saldo >= 0 ? `le quedan ${ars(b.saldo)}` : `debe ${ars(-b.saldo)}`}`}
    >
      <div className="flex flex-col gap-4">
        <ItemsEditor s={s} />
        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Truck className="h-4 w-4" strokeWidth={1.6} /> Registrar un retiro
          </p>
          <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            <Field label="Fecha del retiro">
              <Input
                type="date"
                value={wDate}
                onChange={(e) => setWDate(e.target.value || todayISO())}
              />
            </Field>
            <Field label="Dónde lo retira o se entrega" className="sm:col-span-2">
              <Input
                list="acopio-lugares"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
              <datalist id="acopio-lugares">
                {places.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
          </div>

          {quotedRows.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Productos acopiados{s.withIva ? " (precios con IVA)" : ""}: poné cuánto se lleva hoy
              </p>
              {quotedRows.map((r) => (
                <div
                  key={keyOf(r.it)}
                  className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 rounded-2xl bg-card p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto_110px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.it.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {qtyUnit(r.it.qty, r.it.unit)} acopiado · {ars(r.it.unitPrice)} c/u ·{" "}
                      {r.left > 0 ? (
                        <b className="text-foreground">faltan {qtyUnit(r.left, r.it.unit)}</b>
                      ) : (
                        <span className="text-success-foreground">retirado todo</span>
                      )}
                    </p>
                  </div>
                  <NumberInput
                    value={r.now}
                    onChange={(v) => setTakes((t) => ({ ...t, [keyOf(r.it)]: Math.max(0, v) }))}
                    suffix={unitShort[r.it.unit]}
                  />
                  <button
                    type="button"
                    className={`${btn.ghost} hidden sm:inline-flex`}
                    disabled={r.left <= 0}
                    onClick={() => setTakes((t) => ({ ...t, [keyOf(r.it)]: r.left }))}
                  >
                    Todo lo que falta
                  </button>
                  <p className="hidden text-right text-sm font-semibold tabular-nums sm:block">
                    {r.sub ? ars(r.sub) : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          {quotedRows.length > 0 && !showOther ? (
            <button
              type="button"
              className={`${btn.ghost} mt-2`}
              onClick={() => setShowOther(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Otro producto (fuera del acopio)
            </button>
          ) : (
            <div className={quotedRows.length ? "mt-3 rounded-2xl bg-card p-3" : ""}>
              {quotedRows.length > 0 && (
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                  Otro producto, fuera del acopio
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
                <Field label="Producto" className="col-span-2">
                  <Select
                    value={pid}
                    onChange={(e) => {
                      setPid(e.target.value);
                      setPrice(undefined);
                      const np = products.find((x) => x.id === e.target.value);
                      if (np) {
                        // Igual que en la venta: viaje o tonelada si van primero; si no, bolsa en piedras.
                        const us = saleUnitsFor(np);
                        setUnit(
                          (us[0] === "viaje" || us[0] === "t"
                            ? us[0]
                            : us[np.category === "piedra" ? 1 : 0]) ?? "u",
                        );
                      }
                    }}
                  >
                    <option value="">Elegir producto…</option>
                    {products.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cantidad">
                  <NumberInput value={qty} onChange={setQty} />
                </Field>
                <Field label="Unidad">
                  <Select
                    value={u}
                    onChange={(e) => {
                      setUnit(e.target.value as SaleUnit);
                      setPrice(undefined);
                    }}
                    disabled={!p}
                  >
                    {p &&
                      units.map((x) => (
                        <option key={x} value={x}>
                          {unitLabelFor(p, x)}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field
                  label="Precio unitario"
                  hint={quoted && price === undefined ? "Precio del presupuesto" : undefined}
                  help="Si el producto estaba en el presupuesto, sale con ese precio. Si no, con la lista de hoy. Se puede cambiar a mano."
                >
                  <NumberInput value={unitPrice} onChange={(v) => setPrice(v)} prefix="$" />
                </Field>
                <p className="col-span-2 self-end pb-2.5 text-sm sm:col-span-3">
                  {p && qty > 0 ? (
                    <>
                      {qtyUnit(qty, u)} × {ars(unitPrice)} = <b>{ars(otherTotal)}</b>
                    </>
                  ) : null}
                </p>
              </div>
              {quotedRows.length > 0 && (
                <button
                  type="button"
                  className={`${btn.ghost} mt-1`}
                  onClick={() => {
                    setShowOther(false);
                    setPid("");
                    setQty(0);
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-3 text-sm">
            <span>
              {total > 0 ? (
                <>
                  Retiro de hoy <b>{ars(total)}</b> · le quedan{" "}
                  <b className={after < 0 ? "text-danger-soft-foreground" : ""}>{ars(after)}</b>
                  {after < 0 && " (se pasa del saldo)"}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {quotedRows.length
                    ? "Poné la cantidad que se lleva de cada producto: el importe y el saldo se calculan solos."
                    : "Elegí el producto y la cantidad: el importe y el saldo se calculan solos."}
                </span>
              )}
            </span>
            <button className={btn.primary} disabled={total <= 0} onClick={addW}>
              Registrar retiro{total > 0 ? ` · ${ars(total)}` : ""}
            </button>
          </div>
        </div>

        <Table
          head={[
            "Fecha",
            "Detalle",
            { label: "Pagó", right: true },
            { label: "Retiró", right: true },
            { label: "Saldo", right: true },
            "",
          ]}
          min={620}
        >
          {withSaldo.map((m) => (
            <tr key={m.id} className={tr}>
              <td className="whitespace-nowrap">{fmtDateNum(m.date.slice(0, 10))}</td>
              <td className="text-xs">
                {m.kind === "pago" ? (
                  <Wallet className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.6} />
                ) : (
                  <Package className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.6} />
                )}
                {m.detail}
              </td>
              <td className="text-right tabular-nums text-success-foreground">
                {m.plus ? ars(m.plus) : ""}
              </td>
              <td className="text-right tabular-nums">{m.minus ? ars(m.minus) : ""}</td>
              <td
                className={`text-right font-semibold tabular-nums ${m.saldo < 0 ? "text-danger-soft-foreground" : ""}`}
              >
                {ars(m.saldo)}
              </td>
              <td className="text-right">
                {m.fromSale ? null : confirm === m.id ? (
                  <button
                    className={btn.danger}
                    onClick={() => {
                      if (m.kind === "pago") removeStockpilePayment(s.id, m.id);
                      else removeStockpileWithdrawal(s.id, m.id);
                      setConfirm(null);
                    }}
                  >
                    Sí, borrar
                  </button>
                ) : (
                  <button
                    className={btn.icon}
                    aria-label="Borrar"
                    title={
                      m.kind === "pago"
                        ? "Borrar este pago (sale de caja o banco)"
                        : "Borrar este retiro (vuelve al stock)"
                    }
                    onClick={() => setConfirm(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>

        {payOpen ? (
          <div className="on-surface rounded-3xl bg-surface p-4">
            <p className="mb-3 text-xs font-semibold">Otro pago a cuenta</p>
            <PayInputs
              amount={amount}
              setAmount={setAmount}
              method={method}
              setMethod={setMethod}
              account={account}
              setAccount={setAccount}
              date={pDate}
              setDate={setPDate}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={btn.soft} onClick={() => setPayOpen(false)}>
                Cancelar
              </button>
              <button className={btn.primary} disabled={amount <= 0} onClick={addP}>
                Registrar pago {amount > 0 ? ars(amount) : ""}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className={btn.soft} onClick={() => setPayOpen(true)}>
              <Plus className="h-4 w-4" /> Otro pago a cuenta
            </button>
            <div className="flex gap-2">
              <button
                className={btn.ghost}
                onClick={() => updateStockpile(s.id, { closed: !s.closed })}
              >
                {s.closed ? "Reabrir acopio" : "Cerrar acopio"}
              </button>
              {s.saleId ? null : confirm === "all" ? (
                <button
                  className={btn.danger}
                  onClick={() => {
                    removeStockpile(s.id);
                    onClose();
                  }}
                >
                  Sí, eliminar todo
                </button>
              ) : (
                <button
                  className={btn.ghost}
                  title="Borra el acopio, saca sus pagos de caja y devuelve al stock lo retirado"
                  onClick={() => setConfirm("all")}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} /> Eliminar acopio
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Los pagos entran en caja o banco el día que se cargan. Cada retiro descuenta el stock y el
          saldo del cliente. {s.withIva ? "Precios con IVA incluido." : "Precios sin IVA."}{" "}
          {num(s.withdrawals.length)} retiros cargados.
        </p>
      </div>
    </Modal>
  );
}
