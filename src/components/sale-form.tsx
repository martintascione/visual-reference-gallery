import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  FileText,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import type {
  Cheque,
  Delivery,
  MethodConfig,
  Payment,
  Product,
  Quote,
  SaleItem,
  SaleUnit,
} from "@/lib/types";
import { clientBalance, useStore } from "@/lib/store";
import { lineTotals, listPrice, saleUnitsFor, unitLabel } from "@/lib/pricing";
import { addDays, ars, fmtDate, num, todayISO } from "@/lib/format";
import { Badge, Card, Field, Input, NumberInput, Segmented, Select, Toggle, btn } from "./ui-bits";

type Line = { productId: string; qty: number; unit: SaleUnit; price?: number | undefined };
type PayDraft = { methodId: string; amount: number; installments: number; dues: number };
type ChequeDraft = {
  number: string;
  bank: string;
  drawer: string;
  dueDate: string;
  echeq: boolean;
};

export function SaleForm({
  mode,
  fromQuote,
}: {
  mode: "venta" | "presupuesto";
  fromQuote?: Quote | undefined;
}) {
  const { db, addSale, addQuote, upsertClient, setPendingQuote } = useStore();
  const nav = useNavigate();
  const s = db.settings;
  const active = db.products.filter((p) => p.active);
  const methods = s.methods.filter((m) => m.active);

  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState("Consumidor final");
  const [phone, setPhone] = useState("");
  const [withIva, setWithIva] = useState(false);
  const [note, setNote] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>({
    address: "",
    zone: s.zones[0]?.name ?? "",
    price: s.zones[0]?.price ?? 0,
    cost: s.zones[0]?.cost ?? 0,
    date: todayISO(),
    done: false,
  });
  const [pays, setPays] = useState<PayDraft[]>([
    { methodId: methods[0]?.id ?? "", amount: 0, installments: 1, dues: 1 },
  ]);
  const [cheque, setCheque] = useState<ChequeDraft>({
    number: "",
    bank: "",
    drawer: "",
    dueDate: addDays(todayISO(), 30),
    echeq: false,
  });
  const [validDays, setValidDays] = useState(s.quoteValidDays);
  const [saved, setSaved] = useState<string | null>(null);

  // Precarga desde un presupuesto aceptado
  useEffect(() => {
    if (!fromQuote) return;
    setLines(
      fromQuote.items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unit: i.unit,
        price: i.unitPrice,
      })),
    );
    setClientId(fromQuote.clientId ?? "");
    setClientName(fromQuote.clientName);
    setPhone(fromQuote.phone ?? "");
    setWithIva(fromQuote.withIva);
    setNote(fromQuote.note ?? "");
    if (fromQuote.delivery) {
      setDeliveryOn(true);
      setDelivery({ ...fromQuote.delivery, date: todayISO(), done: false });
    }
  }, [fromQuote]);

  const results = useMemo(
    () =>
      q
        ? active.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
        : active.slice(0, 8),
    [q, active],
  );

  const items: SaleItem[] = useMemo(
    () =>
      lines.flatMap((l) => {
        const p = db.products.find((x) => x.id === l.productId);
        if (!p) return [];
        const t = lineTotals(p, l.qty, l.unit, l.price);
        return [{ productId: p.id, name: p.name, qty: l.qty, unit: l.unit, ...t }];
      }),
    [lines, db.products],
  );

  const itemsTotal = items.reduce((a, i) => a + i.subtotal, 0);
  const subtotal = itemsTotal + (deliveryOn ? delivery.price : 0);
  const iva = withIva
    ? Math.round(
        items.reduce(
          (a, i) =>
            a +
            (i.subtotal * (db.products.find((p) => p.id === i.productId)?.ivaPct ?? s.ivaPct)) /
              100,
          0,
        ) + (deliveryOn ? (delivery.price * s.ivaPct) / 100 : 0),
      )
    : 0;
  const total = subtotal + iva;
  const cost = items.reduce((a, i) => a + i.cost, 0) + (deliveryOn ? delivery.cost : 0);
  const paid = pays.reduce((a, p) => a + (p.amount || 0), 0);
  const remaining = total - paid;

  // El primer pago sigue al total hasta que la dueña lo toque
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && pays.length === 1 && pays[0]) setPays([{ ...pays[0], amount: total }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const addLine = (p: Product) => {
    const unit: SaleUnit = saleUnitsFor(p)[p.category === "piedra" ? 1 : 0] ?? "u";
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id && l.unit === unit);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: p.id, qty: 1, unit }];
    });
    setQ("");
  };
  const updLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l, j) =>
        j === i ? { ...l, ...patch, ...(patch.unit ? { price: undefined } : {}) } : l,
      ),
    );
  const delLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  const pickZone = (name: string) => {
    const z = s.zones.find((x) => x.name === name);
    setDelivery((d) => ({ ...d, zone: name, price: z?.price ?? d.price, cost: z?.cost ?? d.cost }));
  };

  const pickClient = (id: string) => {
    setClientId(id);
    const c = db.clients.find((x) => x.id === id);
    if (c) {
      setClientName(c.name);
      setPhone(c.phone ?? "");
      if (c.address && !delivery.address) setDelivery((d) => ({ ...d, address: c.address! }));
    } else setClientName("Consumidor final");
  };

  const cfgOf = (id: string) => methods.find((m) => m.id === id);
  const stockIssues = items.filter(
    (i) => (db.products.find((p) => p.id === i.productId)?.stock ?? 0) < i.baseQty,
  );
  const ctaPay = pays.find((p) => cfgOf(p.methodId)?.method === "cta_cte");
  const chequePay = pays.find((p) => cfgOf(p.methodId)?.method === "cheque");
  const client = db.clients.find((c) => c.id === clientId);
  const balance = client ? clientBalance(db, client.id) : null;
  const overLimit =
    !!ctaPay &&
    !!client &&
    client.creditLimit > 0 &&
    (balance?.balance ?? 0) + ctaPay.amount > client.creditLimit;
  const ctaWithoutClient = !!ctaPay && !clientId;
  const chequeIncomplete = !!chequePay && (!cheque.number || !cheque.bank || !cheque.dueDate);

  const canSaveSale =
    items.length > 0 &&
    Math.abs(remaining) < 1 &&
    !ctaWithoutClient &&
    !chequeIncomplete &&
    pays.every((p) => p.amount > 0);
  const canSaveQuote = items.length > 0 && clientName.trim().length > 0;

  const ensureClient = () => {
    if (clientId) return clientId;
    if (
      clientName.trim() &&
      clientName.trim().toLowerCase() !== "consumidor final" &&
      (phone || mode === "presupuesto")
    ) {
      const id = "c" + Date.now().toString(36);
      upsertClient({ id, name: clientName.trim(), phone: phone || undefined, creditLimit: 0 });
      return id;
    }
    return undefined;
  };

  const saveSale = () => {
    const cid = ensureClient();
    const payments: Payment[] = pays.map((p) => {
      const cfg = cfgOf(p.methodId) as MethodConfig;
      return {
        method: cfg.method,
        amount: p.amount,
        bank: cfg.bank,
        gateway: cfg.gateway,
        installments: cfg.method === "credito" ? p.installments : undefined,
        dues: cfg.method === "cta_cte" ? p.dues : undefined,
      };
    });
    const chequeDraft: Omit<Cheque, "id"> | undefined = chequePay
      ? {
          number: cheque.number,
          bank: cheque.bank,
          drawer: cheque.drawer || clientName,
          dueDate: cheque.dueDate,
          amount: chequePay.amount,
          status: "cartera",
          clientId: cid,
          clientName,
          echeq: cheque.echeq,
        }
      : undefined;
    const sale = addSale(
      {
        date: new Date().toISOString(),
        clientId: cid,
        clientName: clientName.trim() || "Consumidor final",
        items,
        delivery: deliveryOn ? delivery : undefined,
        payments,
        withIva,
        subtotal,
        iva,
        total,
        cost,
        note: note || undefined,
        fromQuoteId: fromQuote?.id,
      },
      chequeDraft,
    );
    setPendingQuote(undefined);
    setSaved(`Venta guardada · total ${ars(sale.total)}`);
    setTimeout(() => nav({ to: "/ventas" }), 900);
  };

  const saveQuote = () => {
    const cid = ensureClient();
    const today = todayISO();
    addQuote({
      date: new Date().toISOString(),
      validUntil: addDays(today, validDays),
      followUp: addDays(today, s.followUpDays),
      clientId: cid,
      clientName: clientName.trim(),
      phone: phone || undefined,
      items,
      delivery: deliveryOn ? delivery : undefined,
      withIva,
      subtotal,
      iva,
      total,
      status: "enviado",
      note: note || undefined,
    });
    setSaved("Presupuesto guardado");
    setTimeout(() => nav({ to: "/presupuestos" }), 900);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* Productos */}
      <div className="flex flex-col gap-4">
        <Card>
          <label className="flex h-11 items-center gap-2 rounded-full bg-surface px-4">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar y agregar producto"
              className="min-w-0 flex-1 bg-transparent text-sm outline-hidden"
              autoFocus
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addLine(p)}
                className="group flex items-center gap-2 rounded-full bg-surface py-1.5 pl-3 pr-1.5 text-xs font-medium transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {p.name}
                <span className="text-[10px] text-muted-foreground group-hover:text-primary-foreground/70">
                  {p.category === "piedra"
                    ? ars(p.bagPrice ?? 0) + "/bolsón"
                    : ars(p.price) + (p.unit === "m2" ? "/m²" : "")}
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-card text-foreground">
                  <Plus className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title={mode === "venta" ? "Productos de la venta" : "Productos del presupuesto"}
          icon={ShoppingCart}
        >
          {lines.length === 0 && (
            <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground">
              Buscá un producto arriba y tocalo para agregarlo.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const p = db.products.find((x) => x.id === l.productId)!;
              const it = items[i];
              if (!it) return null;
              const low = p.stock < it.baseQty;
              return (
                <div
                  key={i}
                  className="grid grid-cols-2 items-end gap-2 rounded-2xl bg-surface p-3 sm:grid-cols-[minmax(0,1.6fr)_90px_120px_130px_auto_auto]"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Stock {num(p.stock)} {p.unit === "m2" ? "m²" : p.unit}
                      {it.discountPct > 0 && ` · ${it.discountPct}% desc. por cantidad`}
                    </p>
                  </div>
                  <Field label="Cantidad">
                    <NumberInput
                      value={l.qty}
                      onChange={(v) => updLine(i, { qty: v })}
                      min={0}
                      step={l.unit === "t" ? 0.5 : 1}
                      className="h-9"
                    />
                  </Field>
                  <Field label="Unidad">
                    <Select
                      value={l.unit}
                      onChange={(e) => updLine(i, { unit: e.target.value as SaleUnit })}
                      className="h-9"
                    >
                      {saleUnitsFor(p).map((u) => (
                        <option key={u} value={u}>
                          {unitLabel[u]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Precio por ${unitLabel[l.unit]}`}>
                    <NumberInput
                      value={l.price ?? listPrice(p, l.unit)}
                      onChange={(v) => updLine(i, { price: v })}
                      className="h-9"
                    />
                  </Field>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Subtotal</p>
                    <p className="text-sm font-bold tabular-nums">{ars(it.subtotal)}</p>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {low && (
                      <AlertTriangle
                        className="h-4 w-4 text-danger-soft-foreground"
                        aria-label="Sin stock suficiente"
                      />
                    )}
                    <button className={btn.icon} onClick={() => delLine(i)} aria-label="Quitar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {stockIssues.length > 0 && (
            <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-2 text-xs text-danger-soft-foreground">
              No hay stock suficiente de {stockIssues.map((i) => i.name).join(", ")}. Se puede
              vender igual y el stock queda en negativo hasta que se cargue la compra.
            </p>
          )}
        </Card>

        <Card
          title="Entrega a domicilio"
          icon={Truck}
          action={
            <Toggle
              checked={deliveryOn}
              onChange={setDeliveryOn}
              label={deliveryOn ? "Con flete" : "Retira en el local"}
            />
          }
        >
          {deliveryOn && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Dirección" className="col-span-2">
                <Input
                  value={delivery.address}
                  onChange={(e) => setDelivery({ ...delivery, address: e.target.value })}
                  placeholder="Calle, número, localidad"
                />
              </Field>
              <Field label="Zona" className="col-span-2">
                <Select value={delivery.zone} onChange={(e) => pickZone(e.target.value)}>
                  {s.zones.map((z) => (
                    <option key={z.id} value={z.name}>
                      {z.name}
                    </option>
                  ))}
                  <option value="Otra">Otra / a convenir</option>
                </Select>
              </Field>
              <Field label="Cobra al cliente">
                <NumberInput
                  value={delivery.price}
                  onChange={(v) => setDelivery({ ...delivery, price: v })}
                />
              </Field>
              <Field label="Costo del viaje">
                <NumberInput
                  value={delivery.cost}
                  onChange={(v) => setDelivery({ ...delivery, cost: v })}
                />
              </Field>
              <Field label="Fecha de entrega" className="col-span-2">
                <Input
                  type="date"
                  value={delivery.date}
                  onChange={(e) => setDelivery({ ...delivery, date: e.target.value })}
                />
              </Field>
            </div>
          )}
        </Card>
      </div>

      {/* Resumen y cobro */}
      <div className="flex flex-col gap-4">
        <Card title="Cliente">
          <div className="flex flex-col gap-3">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Consumidor final / cliente nuevo</option>
              {db.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {!clientId && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nombre"
                />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                />
              </div>
            )}
            {balance && balance.balance > 0 && (
              <p className="text-xs text-muted-foreground">
                Debe {ars(balance.balance)}
                {balance.overdue > 0 && (
                  <span className="text-danger-soft-foreground">
                    {" "}
                    · {ars(balance.overdue)} vencido
                  </span>
                )}
                {client && client.creditLimit > 0 && ` · límite ${ars(client.creditLimit)}`}
              </p>
            )}
            <Segmented
              value={withIva ? "con" : "sin"}
              onChange={(v) => setWithIva(v === "con")}
              options={[
                { value: "sin", label: "Sin IVA" },
                { value: "con", label: `Con IVA ${s.ivaPct}%` },
              ]}
            />
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="flex justify-between text-muted-foreground">
              <span>Productos</span>
              <span className="tabular-nums">{ars(itemsTotal)}</span>
            </p>
            {deliveryOn && (
              <p className="flex justify-between text-muted-foreground">
                <span>Flete</span>
                <span className="tabular-nums">{ars(delivery.price)}</span>
              </p>
            )}
            {withIva && (
              <p className="flex justify-between text-muted-foreground">
                <span>IVA</span>
                <span className="tabular-nums">{ars(iva)}</span>
              </p>
            )}
            <p className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums">{ars(total)}</span>
            </p>
            {mode === "venta" && items.length > 0 && (
              <p className="flex justify-between text-[11px] text-muted-foreground">
                <span>Ganancia estimada</span>
                <span className="tabular-nums">{ars(subtotal - cost)}</span>
              </p>
            )}
          </div>
        </Card>

        {mode === "venta" ? (
          <Card
            title="Cómo cobra"
            action={
              pays.length < 4 && (
                <button
                  className={btn.ghost}
                  onClick={() => {
                    setTouched(true);
                    setPays([
                      ...pays,
                      {
                        methodId: methods[0]?.id ?? "",
                        amount: Math.max(0, remaining),
                        installments: 1,
                        dues: 1,
                      },
                    ]);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Otro pago
                </button>
              )
            }
          >
            <div className="flex flex-col gap-3">
              {pays.map((p, i) => {
                const cfg = cfgOf(p.methodId);
                return (
                  <div key={i} className="rounded-2xl bg-surface p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-end gap-2">
                      <Field label="Medio">
                        <Select
                          value={p.methodId}
                          onChange={(e) =>
                            setPays(
                              pays.map((x, j) =>
                                j === i ? { ...x, methodId: e.target.value } : x,
                              ),
                            )
                          }
                          className="h-9"
                        >
                          {methods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Monto">
                        <NumberInput
                          value={p.amount}
                          onChange={(v) => {
                            setTouched(true);
                            setPays(pays.map((x, j) => (j === i ? { ...x, amount: v } : x)));
                          }}
                          className="h-9"
                        />
                      </Field>
                      <button
                        className={btn.icon}
                        disabled={pays.length === 1}
                        onClick={() => {
                          setTouched(true);
                          setPays(pays.filter((_, j) => j !== i));
                        }}
                        aria-label="Quitar pago"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {cfg && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {cfg.method === "cheque"
                          ? "Queda en cartera de cheques"
                          : cfg.method === "cta_cte"
                            ? "Se carga a la cuenta corriente del cliente"
                            : `Acredita en ${cfg.bank}${cfg.settleDays ? ` en ${cfg.settleDays} días` : " en el día"}${cfg.feePct ? ` · comisión ${cfg.feePct}% (${ars(Math.round((p.amount * cfg.feePct) / 100))})` : ""}`}
                      </p>
                    )}
                    {cfg?.method === "credito" && (
                      <Field label="Cuotas" className="mt-2 w-28">
                        <Select
                          value={p.installments}
                          onChange={(e) =>
                            setPays(
                              pays.map((x, j) =>
                                j === i ? { ...x, installments: Number(e.target.value) } : x,
                              ),
                            )
                          }
                          className="h-9"
                        >
                          {[1, 3, 6, 12].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? "pago" : "cuotas"}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    {cfg?.method === "cta_cte" && (
                      <div className="mt-2 flex items-end gap-2">
                        <Field label="Cuotas mensuales" className="w-28">
                          <NumberInput
                            value={p.dues}
                            onChange={(v) =>
                              setPays(
                                pays.map((x, j) => (j === i ? { ...x, dues: Math.max(1, v) } : x)),
                              )
                            }
                            className="h-9"
                          />
                        </Field>
                        <p className="pb-2 text-[11px] text-muted-foreground">
                          {p.dues} × {ars(Math.round(p.amount / Math.max(1, p.dues)))}
                        </p>
                      </div>
                    )}
                    {cfg?.method === "cheque" && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Field label="N° de cheque">
                          <Input
                            value={cheque.number}
                            onChange={(e) => setCheque({ ...cheque, number: e.target.value })}
                            className="h-9"
                          />
                        </Field>
                        <Field label="Banco emisor">
                          <Input
                            value={cheque.bank}
                            onChange={(e) => setCheque({ ...cheque, bank: e.target.value })}
                            className="h-9"
                            placeholder="Nación, Galicia…"
                          />
                        </Field>
                        <Field label="Librador">
                          <Input
                            value={cheque.drawer}
                            onChange={(e) => setCheque({ ...cheque, drawer: e.target.value })}
                            className="h-9"
                            placeholder={clientName}
                          />
                        </Field>
                        <Field label="Fecha de cobro">
                          <Input
                            type="date"
                            value={cheque.dueDate}
                            onChange={(e) => setCheque({ ...cheque, dueDate: e.target.value })}
                            className="h-9"
                          />
                        </Field>
                        <div className="col-span-2">
                          <Toggle
                            checked={cheque.echeq}
                            onChange={(v) => setCheque({ ...cheque, echeq: v })}
                            label="Es e-cheq"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-1 text-sm">
                <span className="text-muted-foreground">
                  {remaining > 0.5 ? "Falta cobrar" : remaining < -0.5 ? "Sobra" : "Cobro completo"}
                </span>
                <span
                  className={`font-semibold tabular-nums ${Math.abs(remaining) < 1 ? "text-success-foreground" : "text-danger-soft-foreground"}`}
                >
                  {Math.abs(remaining) < 1 ? (
                    <Check className="inline h-4 w-4" />
                  ) : (
                    ars(Math.abs(remaining))
                  )}
                </span>
              </div>
              {ctaWithoutClient && (
                <p className="text-xs text-danger-soft-foreground">
                  Para vender a cuenta corriente hay que elegir un cliente cargado.
                </p>
              )}
              {overLimit && (
                <p className="text-xs text-danger-soft-foreground">
                  Supera el límite de crédito del cliente ({ars(client!.creditLimit)}). Se puede
                  guardar igual.
                </p>
              )}
              {chequeIncomplete && (
                <p className="text-xs text-danger-soft-foreground">
                  Completá número, banco y fecha del cheque.
                </p>
              )}
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional)"
              />
              <button
                className={`${btn.primary} h-12 w-full text-base`}
                disabled={!canSaveSale || !!saved}
                onClick={saveSale}
              >
                {saved ?? `Cobrar y guardar · ${ars(total)}`}
              </button>
            </div>
          </Card>
        ) : (
          <Card title="Presupuesto" icon={FileText}>
            <div className="flex flex-col gap-3">
              <Field label="Válido por (días)">
                <NumberInput value={validDays} onChange={setValidDays} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Vence el {fmtDate(addDays(todayISO(), validDays))} · recordatorio de seguimiento en{" "}
                {s.followUpDays} días.
              </p>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional)"
              />
              <button
                className={`${btn.primary} h-12 w-full text-base`}
                disabled={!canSaveQuote || !!saved}
                onClick={saveQuote}
              >
                {saved ?? "Guardar presupuesto"}
              </button>
            </div>
          </Card>
        )}
        {fromQuote && (
          <p className="px-1 text-xs text-muted-foreground">
            <Badge tone="dark">Desde presupuesto #{fromQuote.number}</Badge>
          </p>
        )}
      </div>
    </div>
  );
}
