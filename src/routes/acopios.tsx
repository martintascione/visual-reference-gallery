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
                <td className="whitespace-nowrap">{fmtDateNum(s.date.slice(0, 10))}</td>
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
  const total = Math.round(unitPrice * qty);
  const after = b.saldo - total;
  const client = db.clients.find((c) => c.id === s.clientId);
  const places = [
    "Retira en el corralón",
    ...(client?.address ? [`Entrega en ${client.address}`] : []),
    ...new Set(s.withdrawals.map((w) => w.place).filter(Boolean)),
  ];

  const addW = () => {
    if (!p || qty <= 0) return;
    addStockpileWithdrawal(s.id, {
      date: isoOf(wDate),
      place: place.trim() || "Retira en el corralón",
      productId: p.id,
      name: p.name,
      qty,
      unit: u,
      unitPrice,
      total,
      baseQty: toBaseQty(p, qty, u),
    });
    setQty(0);
    setPrice(undefined);
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
      detail: `Pago a cuenta · ${x.method === "efectivo" ? "Efectivo" : `Transferencia ${x.account}`}`,
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
        {!!s.items?.length && (
          <div className="rounded-3xl bg-surface p-4">
            <p className="mb-2 text-xs font-semibold">
              Lo presupuestado{s.withIva ? " (precios con IVA)" : ""}
            </p>
            <div className="flex flex-col gap-1 text-xs">
              {s.items.map((it) => {
                const took = s.withdrawals
                  .filter((w) => w.productId === it.productId && w.unit === it.unit)
                  .reduce((a, w) => a + w.qty, 0);
                const left = Math.max(0, it.qty - took);
                return (
                  <button
                    key={it.productId + it.unit}
                    type="button"
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-card"
                    title="Cargar un retiro de este producto"
                    onClick={() => {
                      setPid(it.productId);
                      setUnit(it.unit);
                      setPrice(undefined);
                      setQty(left || 0);
                    }}
                  >
                    <span>
                      {qtyUnit(it.qty, it.unit)} {it.name} · {ars(it.unitPrice)} c/u
                    </span>
                    <span className={left > 0 ? "font-semibold" : "text-success-foreground"}>
                      {left > 0 ? `faltan retirar ${qtyUnit(left, it.unit)}` : "retirado todo"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Truck className="h-4 w-4" strokeWidth={1.6} /> Registrar un retiro
          </p>
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
            <Field label="Fecha del retiro">
              <Input
                type="date"
                value={wDate}
                onChange={(e) => setWDate(e.target.value || todayISO())}
              />
            </Field>
            <Field label="Lugar de retiro" className="col-span-2">
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-3 text-sm">
            <span>
              {p && qty > 0 ? (
                <>
                  {qtyUnit(qty, u)} × {ars(unitPrice)} = <b>{ars(total)}</b> · le quedan{" "}
                  <b className={after < 0 ? "text-danger-soft-foreground" : ""}>{ars(after)}</b>
                  {after < 0 && " (se pasa del saldo)"}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Elegí el producto y la cantidad: el importe y el saldo se calculan solos.
                </span>
              )}
            </span>
            <button className={btn.primary} disabled={!p || qty <= 0} onClick={addW}>
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
                {confirm === m.id ? (
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
              {confirm === "all" ? (
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
