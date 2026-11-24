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
  Hammer,
} from "lucide-react";
import type {
  Cheque,
  Delivery,
  MethodConfig,
  Payment,
  Product,
  Quote,
  Sale,
  SaleItem,
  SaleUnit,
} from "@/lib/types";
import { clientBalance, useStore } from "@/lib/store";
import { lineTotals, listPrice, saleUnitsFor, unitLabel, unitLabelFor } from "@/lib/pricing";
import { addDays, ars, daysBetween, fmtDate, num, todayISO } from "@/lib/format";
import { Badge, Card, Field, Input, NumberInput, Segmented, Select, Toggle, btn } from "./ui-bits";

type Line = {
  productId: string;
  qty: number;
  unit: SaleUnit;
  price?: number | undefined;
  note?: string | undefined;
  /** Bonificación % del ítem cargada a mano (manda sobre el descuento por cantidad). */
  disc?: number | undefined;
};
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
  editQuote,
  editSale,
}: {
  mode: "venta" | "presupuesto";
  fromQuote?: Quote | undefined;
  /** Presupuesto existente que se edita (se guarda sobre el mismo número). */
  editQuote?: Quote | undefined;
  /** Venta existente que se corrige (se guarda sobre el mismo número). */
  editSale?: Sale | undefined;
}) {
  const {
    db,
    addSale,
    updateSale,
    setEditSale,
    addQuote,
    updateQuote,
    setEditQuote,
    upsertClient,
    setPendingQuote,
    pendingAction,
    setPendingAction,
  } = useStore();
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
  // Cliente que lo busca en el corralón o pone su transporte: flete por su cuenta, editable.
  const [pickupOn, setPickupOn] = useState(false);
  const [pickupAmt, setPickupAmt] = useState(db.settings.pickupFee ?? 30000);
  // Servicio de colocación: se le cobra al cliente; un % queda para la empresa y el resto es del colocador.
  const [installOn, setInstallOn] = useState(false);
  const [installAmt, setInstallAmt] = useState(0);
  const [installPct, setInstallPct] = useState(db.settings.installFeePct ?? 20);
  const [installer, setInstaller] = useState("");
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
  const [discountPct, setDiscountPct] = useState(0);
  const [invoicePending, setInvoicePending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Precarga desde el asistente ("vendele 10 bolsones de piedra blanca a Juan")
  useEffect(() => {
    if (!pendingAction || pendingAction.tipo !== "nueva_venta") return;
    const a = pendingAction;
    setPendingAction(undefined);
    if (a.cliente) {
      const c = db.clients.find((x) => x.name.toLowerCase() === a.cliente!.toLowerCase());
      if (c) {
        setClientId(c.id);
        setClientName(c.name);
        setPhone(c.phone ?? "");
      } else setClientName(a.cliente);
    }
    if (a.items?.length) {
      const ls: Line[] = [];
      for (const it of a.items) {
        const p =
          active.find((x) => x.name.toLowerCase() === it.producto.toLowerCase()) ??
          active.find((x) => x.name.toLowerCase().includes(it.producto.toLowerCase()));
        if (!p) continue;
        const units = saleUnitsFor(p);
        const unit: SaleUnit =
          it.unidad && units.includes(it.unidad)
            ? it.unidad
            : (units[p.category === "piedra" ? 1 : 0] ?? "u");
        ls.push({ productId: p.id, qty: it.cantidad || 1, unit });
      }
      if (ls.length) setLines(ls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  // Precarga desde un presupuesto (aceptado → venta, o edición del presupuesto)
  useEffect(() => {
    const src = fromQuote ?? editQuote;
    if (!src) return;
    setLines(
      src.items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unit: i.unit,
        price: i.unitPrice,
        note: i.note,
        disc: i.discountPct,
      })),
    );
    setClientId(src.clientId ?? "");
    setClientName(src.clientName);
    setPhone(src.phone ?? "");
    setWithIva(src.withIva);
    setNote(src.note ?? "");
    setDiscountPct(src.discountPct ?? 0);
    setPickupOn(!!src.pickupFee);
    setInstallOn(!!src.install);
    if (src.install) {
      setInstallAmt(src.install.amount);
      setInstallPct(src.install.feePct);
      setInstaller(src.install.installer ?? "");
    }
    if (src.pickupFee) setPickupAmt(src.pickupFee);
    if (src.delivery) {
      setDeliveryOn(true);
      setDelivery(
        fromQuote ? { ...src.delivery, date: todayISO(), done: false } : { ...src.delivery },
      );
    }
    if (editQuote) setValidDays(Math.max(1, daysBetween(todayISO(), editQuote.validUntil)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuote, editQuote]);

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
        const t = lineTotals(p, l.qty, l.unit, l.price, l.disc);
        return [
          {
            productId: p.id,
            name: p.name,
            qty: l.qty,
            unit: l.unit,
            ...t,
            note: l.note?.trim() || undefined,
          },
        ];
      }),
    [lines, db.products],
  );

  const itemsTotal = items.reduce((a, i) => a + i.subtotal, 0);
  const discount = Math.round((itemsTotal * (discountPct || 0)) / 100);
  const unload = deliveryOn ? (delivery.unloadPrice ?? 0) : 0;
  const pickup = !deliveryOn && pickupOn ? Math.max(0, pickupAmt) : 0;
  const install = installOn ? Math.max(0, installAmt) : 0;
  const installFee = Math.round((install * installPct) / 100);
  const subtotal =
    itemsTotal - discount + (deliveryOn ? delivery.price : 0) + unload + pickup + install;
  const iva = withIva ? Math.round(subtotal * (s.ivaPct / 100)) : 0;
  const total = subtotal + iva;
  const cost =
    items.reduce((a, i) => a + i.cost, 0) +
    (deliveryOn ? delivery.cost : 0) +
    (install - installFee);
  const paid = pays.reduce((a, p) => a + (p.amount || 0), 0);
  const remaining = total - paid;

  // El primer pago sigue al total hasta que la dueña lo toque
  const [touched, setTouched] = useState(false);
  // Descarga sugerida: bolsón grande o bolsas chicas (valores de Configuración), hasta que se edite a mano.
  // Al editar o convertir un presupuesto se respeta lo que ya tenía.
  const [unloadTouched, setUnloadTouched] = useState(!!(editSale ?? editQuote ?? fromQuote));
  const unloadSuggested = lines.some((l) => l.unit === "bigbag" || l.unit === "bigbag2")
    ? (s.unloadChargeBigBag ?? 70000)
    : lines.some((l) => l.unit === "bolson")
      ? (s.unloadChargeBags ?? 20000)
      : 0;
  useEffect(() => {
    if (!deliveryOn || unloadTouched) return;
    setDelivery((d) =>
      d.unloadPrice === unloadSuggested ? d : { ...d, unloadPrice: unloadSuggested },
    );
  }, [deliveryOn, unloadTouched, unloadSuggested]);

  // Precarga para corregir una venta ya guardada.
  useEffect(() => {
    if (!editSale) return;
    setLines(
      editSale.items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unit: i.unit,
        price: i.unitPrice,
        note: i.note,
        disc: i.discountPct,
      })),
    );
    setClientId(editSale.clientId ?? "");
    setClientName(editSale.clientName);
    setPhone(db.clients.find((c) => c.id === editSale.clientId)?.phone ?? "");
    setWithIva(editSale.withIva);
    setNote(editSale.note ?? "");
    setDiscountPct(editSale.discountPct ?? 0);
    setPickupOn(!!editSale.pickupFee);
    setInstallOn(!!editSale.install);
    if (editSale.install) {
      setInstallAmt(editSale.install.amount);
      setInstallPct(editSale.install.feePct);
      setInstaller(editSale.install.installer ?? "");
    }
    if (editSale.pickupFee) setPickupAmt(editSale.pickupFee);
    setInvoicePending(!!editSale.invoicePending);
    if (editSale.delivery) {
      setDeliveryOn(true);
      setDelivery({ ...editSale.delivery });
    }
    const ps = editSale.payments.map((p) => {
      const m =
        methods.find(
          (x) =>
            x.method === p.method && x.bank === p.bank && (x.gateway ?? "") === (p.gateway ?? ""),
        ) ?? methods.find((x) => x.method === p.method);
      return {
        methodId: m?.id ?? methods[0]?.id ?? "",
        amount: p.amount,
        installments: p.installments ?? 1,
        dues: p.dues ?? 1,
      };
    });
    if (ps.length) setPays(ps);
    setTouched(ps.length > 1);
    const ch = editSale.payments.find((p) => p.chequeId);
    const c = ch ? db.cheques.find((x) => x.id === ch.chequeId) : undefined;
    if (c)
      setCheque({
        number: c.number,
        bank: c.bank,
        drawer: c.drawer,
        dueDate: c.dueDate,
        echeq: c.echeq,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSale]);
  useEffect(() => {
    if (!touched && pays.length === 1 && pays[0]) setPays([{ ...pays[0], amount: total }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const addLine = (p: Product) => {
    // Construcción arranca por viaje; el resto de las piedras, por bolsa.
    const us = saleUnitsFor(p);
    const unit: SaleUnit =
      (us[0] === "viaje" || us[0] === "t" ? us[0] : us[p.category === "piedra" ? 1 : 0]) ?? "u";
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

  // Cliente nuevo escrito a mano: se guarda solo en Clientes al salir del campo del nombre,
  // así ya queda elegido para cuenta corriente, cheques y próximas ventas.
  const [autoId, setAutoId] = useState("");
  const isRealName = (n: string) =>
    n.trim().length > 1 && n.trim().toLowerCase() !== "consumidor final";
  const autoSaveClient = (name = clientName, tel = phone) => {
    const n = name.trim();
    if (!isRealName(n)) return undefined;
    if (clientId && clientId !== autoId) return clientId;
    const same = db.clients.find(
      (c) => c.id !== autoId && c.name.trim().toLowerCase() === n.toLowerCase(),
    );
    if (same && !autoId) {
      setClientId(same.id);
      setClientName(same.name);
      if (!tel) setPhone(same.phone ?? "");
      return same.id;
    }
    const prev = db.clients.find((c) => c.id === autoId);
    const id = prev?.id ?? "c" + Date.now().toString(36);
    upsertClient({
      ...(prev ?? { creditLimit: 0 }),
      id,
      name: n,
      phone: tel.trim() || prev?.phone,
    });
    setAutoId(id);
    setClientId(id);
    return id;
  };

  const pickClient = (id: string) => {
    setAutoId("");
    setClientId(id);
    const c = db.clients.find((x) => x.id === id);
    if (c) {
      setClientName(c.name);
      setPhone(c.phone ?? "");
      if (c.address && !delivery.address) setDelivery((d) => ({ ...d, address: c.address! }));
    } else setClientName("Consumidor final");
  };

  const cfgOf = (id: string) => methods.find((m) => m.id === id);
  // Al corregir una venta, lo que ya descontó esa misma venta vuelve a contar como disponible.
  const ownQty = (productId: string) =>
    editSale?.items.filter((x) => x.productId === productId).reduce((a, x) => a + x.baseQty, 0) ??
    0;
  const stockIssues = items.filter(
    (i) =>
      (db.products.find((p) => p.id === i.productId)?.stock ?? 0) + ownQty(i.productId) < i.baseQty,
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
  const ctaWithoutClient = !!ctaPay && !clientId && !isRealName(clientName);
  const chequeIncomplete = !!chequePay && (!cheque.number || !cheque.bank || !cheque.dueDate);

  const canSaveSale =
    items.length > 0 &&
    Math.abs(remaining) < 1 &&
    !ctaWithoutClient &&
    !chequeIncomplete &&
    pays.every((p) => p.amount > 0);
  const canSaveQuote = items.length > 0 && clientName.trim().length > 0;

  const ensureClient = () => {
    if (clientId && clientId !== autoId) return clientId;
    return autoSaveClient() ?? (clientId || undefined);
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
    if (editSale) {
      updateSale(
        editSale.id,
        {
          date: editSale.date,
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
          invoicePending: invoicePending || undefined,
          discountPct: discountPct || undefined,
          pickupFee: pickup || undefined,
          install:
            install > 0
              ? { amount: install, feePct: installPct, installer: installer.trim() || undefined }
              : undefined,
        },
        chequeDraft,
      );
      setEditSale(undefined);
      setSaved(`Venta #${editSale.number} actualizada · total ${ars(total)}`);
      setTimeout(() => nav({ to: "/ventas" }), 900);
      return;
    }
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
        invoicePending: invoicePending || undefined,
        discountPct: discountPct || undefined,
        pickupFee: pickup || undefined,
        install:
          install > 0
            ? { amount: install, feePct: installPct, installer: installer.trim() || undefined }
            : undefined,
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
    if (editQuote) {
      updateQuote(editQuote.id, {
        validUntil: addDays(today, validDays),
        clientId: cid,
        clientName: clientName.trim(),
        phone: phone || undefined,
        items,
        delivery: deliveryOn ? delivery : undefined,
        withIva,
        subtotal,
        iva,
        total,
        // Si estaba vencido o perdido, al editarlo vuelve a quedar abierto.
        status:
          editQuote.status === "vencido" || editQuote.status === "perdido"
            ? "enviado"
            : editQuote.status,
        lostReason: editQuote.status === "perdido" ? undefined : editQuote.lostReason,
        note: note || undefined,
        discountPct: discountPct || undefined,
        pickupFee: pickup || undefined,
        install:
          install > 0
            ? { amount: install, feePct: installPct, installer: installer.trim() || undefined }
            : undefined,
      });
      setEditQuote(undefined);
      setSaved("Presupuesto actualizado");
      setTimeout(() => nav({ to: "/presupuestos" }), 900);
      return;
    }
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
      discountPct: discountPct || undefined,
      pickupFee: pickup || undefined,
      install:
        install > 0
          ? { amount: install, feePct: installPct, installer: installer.trim() || undefined }
          : undefined,
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
              data-tour="venta-productos"
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
                    ? ars(listPrice(p, "bolson")) + "/bolsa"
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
                  className="grid grid-cols-2 items-end gap-2 rounded-2xl bg-surface p-3 sm:grid-cols-[minmax(0,1.6fr)_90px_120px_130px_84px_auto_auto]"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Stock {num(p.stock)} {p.unit === "m2" ? "m²" : p.unit}
                      {it.discountPct > 0 &&
                        ` · ${num(it.discountPct, 1)} % ${l.disc !== undefined ? "bonif." : "desc. por cantidad"}`}
                    </p>
                  </div>
                  <Field label="Cantidad">
                    <NumberInput
                      value={l.qty}
                      onChange={(v) => updLine(i, { qty: v })}
                      min={0}
                      step={l.unit === "t" ? 0.5 : 1}
                    />
                  </Field>
                  <Field label="Unidad">
                    <Select
                      value={l.unit}
                      onChange={(e) => updLine(i, { unit: e.target.value as SaleUnit })}
                    >
                      {saleUnitsFor(p).map((u) => (
                        <option key={u} value={u}>
                          {unitLabelFor(p, u)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Precio por ${unitLabel[l.unit]}`}>
                    <NumberInput
                      value={l.price ?? listPrice(p, l.unit)}
                      onChange={(v) => updLine(i, { price: v })}
                      prefix="$"
                    />
                  </Field>
                  <Field
                    label="Bonif."
                    help="Bonificación de este ítem solo. Si el producto tiene descuento por cantidad, aparece solo y se puede cambiar. La bonificación del total sigue estando abajo, al lado del IVA."
                  >
                    <NumberInput
                      value={l.disc ?? it.discountPct}
                      onChange={(v) => updLine(i, { disc: Math.min(100, Math.max(0, v)) })}
                      suffix="%"
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
                  <div className="col-span-2 sm:col-span-7">
                    {l.note === undefined ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => updLine(i, { note: "" })}
                      >
                        + Agregar nota a este ítem
                      </button>
                    ) : (
                      <Input
                        value={l.note}
                        onChange={(e) => updLine(i, { note: e.target.value })}
                        onBlur={() => !l.note?.trim() && updLine(i, { note: undefined })}
                        placeholder="Nota del ítem: medidas, color, aclaración… (sale en el presupuesto)"
                        className="h-9 text-xs"
                        autoFocus={!l.note}
                      />
                    )}
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
          {!deliveryOn && (
            <div className="flex flex-wrap items-center gap-3">
              <Toggle
                checked={pickupOn}
                onChange={setPickupOn}
                label="Cobrar flete por su cuenta (lo busca o pone su transporte)"
              />
              {pickupOn && (
                <span className="w-40">
                  <NumberInput value={pickupAmt} onChange={setPickupAmt} prefix="$" />
                </span>
              )}
            </div>
          )}
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
                  prefix="$"
                />
              </Field>
              <Field label="Costo del viaje">
                <NumberInput
                  value={delivery.cost}
                  onChange={(v) => setDelivery({ ...delivery, cost: v })}
                  prefix="$"
                />
              </Field>
              <Field
                label="Descarga al cliente"
                className="col-span-2"
                hint={
                  unloadTouched
                    ? "Monto a mano para este pedido"
                    : "Sugerido según bolsas o bolsón; se puede cambiar"
                }
              >
                <NumberInput
                  value={delivery.unloadPrice ?? 0}
                  onChange={(v) => {
                    setUnloadTouched(true);
                    setDelivery({ ...delivery, unloadPrice: v });
                  }}
                  prefix="$"
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

        <Card
          title="Servicio de colocación"
          icon={Hammer}
          action={
            <Toggle
              checked={installOn}
              onChange={setInstallOn}
              label={installOn ? "Con colocación" : "Sin colocación"}
            />
          }
        >
          {installOn ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field
                  label="Importe de la colocación"
                  help="Lo que se le cobra al cliente por colocar. Se suma al total."
                >
                  <NumberInput value={installAmt} onChange={setInstallAmt} prefix="$" />
                </Field>
                <Field
                  label="Queda para la empresa"
                  help="El % de la colocación que queda para el corralón (habitual 20 a 30 %). El resto es del colocador."
                >
                  <NumberInput
                    value={installPct}
                    onChange={(v) => setInstallPct(Math.min(100, Math.max(0, v)))}
                    suffix="%"
                  />
                </Field>
                <Field label="Colocador (opcional)" className="col-span-2">
                  <Input
                    value={installer}
                    onChange={(e) => setInstaller(e.target.value)}
                    placeholder="Nombre del colocador"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[20, 25, 30].map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={installPct === x ? btn.soft : btn.ghost}
                    onClick={() => setInstallPct(x)}
                  >
                    {x} %
                  </button>
                ))}
                {install > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    Empresa <b className="text-foreground">{ars(installFee)}</b> · Colocador{" "}
                    <b className="text-foreground">{ars(install - installFee)}</b>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Prendelo para sumar la colocación como servicio adicional: el cliente ve un solo
              importe y acá se reparte entre la empresa y el colocador.
            </p>
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
            {(!clientId || clientId === autoId) && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => autoSaveClient()}
                    placeholder="Nombre del cliente"
                  />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => autoId && autoSaveClient()}
                    placeholder="Teléfono (opcional)"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {clientId === autoId && autoId
                    ? "Cliente nuevo guardado en Clientes. Ya podés cobrarle a cuenta corriente."
                    : "Escribí el nombre y se guarda solo como cliente nuevo. Si lo dejás en Consumidor final no se guarda nada."}
                </p>
              </>
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
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label="IVA"
                help={`Los precios de lista son sin IVA. 'Con IVA' le suma el ${s.ivaPct}% al total: es lo que corresponde cuando la venta va con Factura A (cliente responsable inscripto). 'Sin IVA' cobra el precio de lista tal cual.`}
              >
                <Segmented
                  value={withIva ? "con" : "sin"}
                  onChange={(v) => setWithIva(v === "con")}
                  options={[
                    { value: "sin", label: "Sin IVA" },
                    { value: "con", label: `Con IVA ${s.ivaPct}%` },
                  ]}
                />
              </Field>
              <Field label="Bonificación" className="w-28">
                <NumberInput
                  value={discountPct}
                  onChange={(v) => setDiscountPct(Math.min(100, Math.max(0, v)))}
                  suffix="%"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="flex justify-between text-muted-foreground">
              <span>Productos</span>
              <span className="tabular-nums">{ars(itemsTotal)}</span>
            </p>
            {discount > 0 && (
              <p className="flex justify-between text-muted-foreground">
                <span>Bonificación {num(discountPct, 1)} %</span>
                <span className="tabular-nums">− {ars(discount)}</span>
              </p>
            )}
            {deliveryOn && (
              <p className="flex justify-between text-muted-foreground">
                <span>Flete</span>
                <span className="tabular-nums">{ars(delivery.price)}</span>
              </p>
            )}
            {unload > 0 && (
              <p className="flex justify-between text-muted-foreground">
                <span>Descarga</span>
                <span className="tabular-nums">{ars(unload)}</span>
              </p>
            )}
            {pickup > 0 && (
              <p className="flex justify-between text-muted-foreground">
                <span>Flete por su cuenta</span>
                <span className="tabular-nums">{ars(pickup)}</span>
              </p>
            )}
            {install > 0 && (
              <p className="flex justify-between text-muted-foreground">
                <span>Servicio de colocación</span>
                <span className="tabular-nums">{ars(install)}</span>
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
                          prefix="$"
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
                            : `Acredita en ${cfg.bank}${cfg.settleDays ? ` en ${cfg.settleDays} días` : " en el día"}${cfg.feePct ? ` · comisión ${num(cfg.feePct, 2)} % (${ars(Math.round((p.amount * cfg.feePct) / 100))})` : ""}`}
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
                          />
                        </Field>
                        <Field label="Banco emisor">
                          <Input
                            value={cheque.bank}
                            onChange={(e) => setCheque({ ...cheque, bank: e.target.value })}
                            placeholder="Nación, Galicia…"
                          />
                        </Field>
                        <Field label="Librador">
                          <Input
                            value={cheque.drawer}
                            onChange={(e) => setCheque({ ...cheque, drawer: e.target.value })}
                            placeholder={clientName}
                          />
                        </Field>
                        <Field label="Fecha de cobro">
                          <Input
                            type="date"
                            value={cheque.dueDate}
                            onChange={(e) => setCheque({ ...cheque, dueDate: e.target.value })}
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
                  Para vender a cuenta corriente escribí el nombre del cliente (se guarda solo) o
                  elegí uno de la lista.
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
              <Toggle
                checked={invoicePending}
                onChange={setInvoicePending}
                label="Falta hacer la factura"
              />
              <button
                className={`${btn.primary} h-12 w-full text-base`}
                disabled={!canSaveSale || !!saved}
                onClick={saveSale}
              >
                {saved ??
                  (editSale
                    ? `Guardar cambios · ${ars(total)}`
                    : `Cobrar y guardar · ${ars(total)}`)}
              </button>
              {editSale && !saved && (
                <button
                  className={`${btn.ghost} w-full`}
                  onClick={() => {
                    setEditSale(undefined);
                    nav({ to: "/ventas" });
                  }}
                >
                  Cancelar sin guardar
                </button>
              )}
            </div>
          </Card>
        ) : (
          <Card title="Presupuesto" icon={FileText}>
            <div className="flex flex-col gap-3">
              <Field label="Válido por (días)">
                <NumberInput value={validDays} onChange={setValidDays} suffix="días" />
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
                {saved ?? (editQuote ? "Guardar cambios" : "Guardar presupuesto")}
              </button>
              {editQuote && !saved && (
                <button
                  className={`${btn.ghost} w-full`}
                  onClick={() => {
                    setEditQuote(undefined);
                    nav({ to: "/presupuestos" });
                  }}
                >
                  Cancelar sin guardar
                </button>
              )}
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
