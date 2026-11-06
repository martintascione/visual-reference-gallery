import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileCheck,
  FileDown,
  History,
  Loader2,
  Mail,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type { Client, Issuer, IssuerKind, Quote, Sale } from "@/lib/types";
import {
  arcaEstado,
  cbteLetter,
  condicionIvaCode,
  emitirFactura,
  invoiceQrUrl,
  loadInvoices,
  padronLookup,
  type ArcaEstado,
  type Invoice,
} from "@/lib/arca";
import { openInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/invoice-mail";
import { useStore } from "@/lib/store";
import { defaultInvoicing } from "@/lib/seed";
import { ars, fmtDate, todayISO, uid } from "@/lib/format";
import { listPrice, qtyUnit, saleUnitsFor, unitLabel } from "@/lib/pricing";
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
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/facturalo")({
  head: () => ({
    meta: [
      { title: "Facturalo Fácil · Corralón" },
      {
        name: "description",
        content: "Facturas desde dos CUIT: monotributo y responsable inscripto.",
      },
    ],
  }),
  component: Facturalo,
});

type Line = { id: string; desc: string; qty: number; unit: string; price: number };

const kindLabel: Record<IssuerKind, string> = {
  monotributo: "Monotributo",
  ri: "Responsable inscripto",
};
const kindHint: Record<IssuerKind, string> = {
  monotributo: "Factura C · sin IVA discriminado · consumidor final",
  ri: "Factura A o B · con IVA 21%",
};

/** Tipo de comprobante según emisor y cliente. */
function invoiceType(kind: IssuerKind, client: Client | undefined) {
  if (kind === "monotributo") return "C";
  return client?.ivaCategory === "Responsable inscripto" ? "A" : "B";
}

const issuerKey = (k: IssuerKind): "ri" | "mono" => (k === "ri" ? "ri" : "mono");

function Facturalo() {
  const { db, updateSettings, pendingAction, setPendingAction, upsertClient, setInvoicePending } =
    useStore();
  const inv = db.settings.invoicing ?? defaultInvoicing();
  const ivaPct = db.settings.ivaPct;

  const [issuerId, setIssuerId] = useState(inv.issuers[0]?.id ?? "");
  const issuer = inv.issuers.find((i) => i.id === issuerId) ?? inv.issuers[0];
  const [pointId, setPointId] = useState("");
  useEffect(() => {
    setPointId(issuer?.points[0]?.id ?? "");
  }, [issuer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [clientId, setClientId] = useState("");
  const client = db.clients.find((c) => c.id === clientId);
  const [quoteId, setQuoteId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [manualTotal, setManualTotal] = useState(0);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [config, setConfig] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState<Invoice | null>(null);
  const [saleId, setSaleId] = useState<string | undefined>(undefined);
  const [estado, setEstado] = useState<ArcaEstado | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showList, setShowList] = useState(false);
  const [cuitQ, setCuitQ] = useState("");
  const [cuitBusy, setCuitBusy] = useState(false);
  const [cuitMsg, setCuitMsg] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [mailState, setMailState] = useState<{
    id: string;
    status: "enviando" | "ok" | "error";
    msg: string;
  } | null>(null);
  const [askEmail, setAskEmail] = useState<Invoice | null>(null);
  const [askEmailValue, setAskEmailValue] = useState("");

  useEffect(() => {
    setEmailDraft(client?.email ?? "");
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Guarda el email en la ficha del cliente si cambió. */
  const saveClientEmail = () => {
    if (!client) return;
    const v = emailDraft.trim();
    if ((client.email ?? "") !== v) upsertClient({ ...client, email: v || undefined });
  };

  /** Manda la factura por mail (PDF adjunto). Si no hay email, pide uno. */
  const sendMail = async (f: Invoice, to?: string) => {
    const dest = (to ?? db.clients.find((c) => c.id === f.clientId)?.email ?? "").trim();
    if (!dest) {
      setAskEmail(f);
      setAskEmailValue("");
      return;
    }
    setMailState({ id: f.id, status: "enviando", msg: `Enviando a ${dest}…` });
    try {
      const iss = inv.issuers.find((i) => issuerKey(i.kind) === f.issuer);
      await sendInvoiceEmail(db.settings, iss, f, dest);
      setMailState({ id: f.id, status: "ok", msg: `Factura enviada a ${dest}` });
      const c = db.clients.find((x) => x.id === f.clientId);
      if (c && c.email !== dest) upsertClient({ ...c, email: dest });
    } catch (e) {
      setMailState({
        id: f.id,
        status: "error",
        msg: `No se pudo enviar el mail: ${e instanceof Error ? e.message : "error"}`,
      });
    }
  };

  useEffect(() => {
    arcaEstado()
      .then(setEstado)
      .catch(() => setEstado(null));
    loadInvoices()
      .then(setInvoices)
      .catch(() => undefined);
  }, []);

  // Venta a facturar (desde el detalle de venta).
  useEffect(() => {
    if (!pendingAction || pendingAction.tipo !== "facturar") return;
    const sale = db.sales.find((x) => x.id === pendingAction.ventaId);
    setPendingAction(undefined);
    if (sale) loadSale(sale);
  }, [pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSale = (sale: Sale) => {
    setSaleId(sale.id);
    if (sale.clientId) setClientId(sale.clientId);
    const disc = sale.discountPct ?? 0;
    const factor = (1 - disc / 100) * (sale.withIva ? 1 + ivaPct / 100 : 1);
    setLines(
      sale.items.map((it) => ({
        id: uid(),
        desc: it.name,
        qty: it.qty,
        unit: unitLabel[it.unit],
        price: Math.round(it.unitPrice * (1 - it.discountPct / 100) * factor * 100) / 100,
      })),
    );
    if (sale.delivery?.price)
      setLines((ls) => [
        ...ls,
        {
          id: uid(),
          desc: "Flete y entrega",
          qty: 1,
          unit: "u",
          price:
            Math.round((sale.delivery?.price ?? 0) * (sale.withIva ? 1 + ivaPct / 100 : 1) * 100) /
            100,
        },
      ]);
    setNote(`Venta #${sale.number}`);
    setManualTotal(0);
  };

  /** Busca el CUIT en ARCA y crea o actualiza el cliente con los datos del padrón. */
  const lookupCuit = async () => {
    setCuitBusy(true);
    setCuitMsg(null);
    try {
      const p = await padronLookup(cuitQ);
      const existing = db.clients.find((c) => (c.cuit ?? "").replace(/\D/g, "") === p.cuit);
      const c: Client = existing
        ? {
            ...existing,
            name: p.nombre || existing.name,
            address: p.direccion || existing.address,
            city: p.localidad || existing.city,
            ivaCategory: p.condicionIva,
          }
        : {
            id: uid(),
            name: p.nombre,
            cuit: p.cuit,
            address: p.direccion || undefined,
            city: p.localidad || undefined,
            ivaCategory: p.condicionIva,
            creditLimit: 0,
          };
      upsertClient(c);
      setClientId(c.id);
      setCuitMsg(`${existing ? "Actualizado" : "Creado"}: ${p.nombre} · ${p.condicionIva}`);
      setCuitQ("");
    } catch (e) {
      setCuitMsg(e instanceof Error ? e.message : "No se pudo consultar ARCA");
    } finally {
      setCuitBusy(false);
    }
  };

  const emitir = async () => {
    if (!issuer || !point) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const docTipo = client?.cuit ? 80 : client?.dni ? 96 : 99;
      const docNro = client?.cuit
        ? client.cuit.replace(/\D/g, "")
        : client?.dni
          ? client.dni.replace(/\D/g, "")
          : "0";
      const cbteTipo = type === "A" ? 1 : type === "B" ? 6 : 11;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const invoice = await emitirFactura({
        issuer: issuerKey(kind),
        ptoVta: point.number,
        cbteTipo,
        fecha: date,
        docTipo,
        docNro,
        clientId: client?.id,
        clientName: client?.name ?? "Consumidor final",
        clientAddress: client
          ? [client.address, client.city].filter(Boolean).join(", ") || undefined
          : undefined,
        clientIva: client?.ivaCategory ?? "Consumidor final",
        condicionIvaReceptor: condicionIvaCode(client?.ivaCategory),
        concepto: 1,
        items: lines.map((l) => ({
          desc: l.desc || "Venta",
          qty: l.qty,
          unit: l.unit,
          price: l.price,
        })),
        neto: r2(neto),
        iva: r2(iva),
        total: r2(total),
        alicuota: ivaPct,
        note: note || undefined,
        saleId,
        quoteId: quoteId || undefined,
      });
      setDone(invoice);
      saveClientEmail();
      const dest = emailDraft.trim() || client?.email;
      setInvoices((xs) => [invoice, ...xs]);
      if (saleId) setInvoicePending(saleId, false);
      void openInvoicePdf(db.settings, issuer, invoice);
      if (dest) void sendMail(invoice, dest);
      setConfirm(false);
      setLines([]);
      setManualTotal(0);
      setNote("");
      setQuoteId("");
      setSaleId(undefined);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Presupuestos del cliente elegido (o todos, si no hay cliente).
  const quotes = useMemo(
    () =>
      db.quotes
        .filter((q) => q.status !== "perdido" && (!clientId || q.clientId === clientId))
        .sort((a, b) => b.number - a.number),
    [db.quotes, clientId],
  );

  const loadQuote = (q: Quote | undefined) => {
    setQuoteId(q?.id ?? "");
    if (!q) return;
    if (q.clientId) setClientId(q.clientId);
    setLines(
      q.items.map((it) => ({
        id: uid(),
        desc: it.name,
        qty: it.qty,
        unit: unitLabel[it.unit],
        price: Math.round(it.unitPrice * (1 - it.discountPct / 100) * 100) / 100,
      })),
    );
    if (q.delivery?.price)
      setLines((ls) => [
        ...ls,
        { id: uid(), desc: "Flete y entrega", qty: 1, unit: "u", price: q.delivery?.price ?? 0 },
      ]);
    setManualTotal(0);
  };

  const addLine = (l: Omit<Line, "id">) => setLines((ls) => [...ls, { ...l, id: uid() }]);
  const updLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const delLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));

  const linesTotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const total = lines.length ? linesTotal : manualTotal;
  const kind = issuer?.kind ?? "monotributo";
  const type = invoiceType(kind, client);
  // En RI el importe cargado se toma como final (IVA incluido) y se discrimina.
  const neto = kind === "ri" ? total / (1 + ivaPct / 100) : total;
  const iva = total - neto;
  const point = issuer?.points.find((p) => p.id === pointId);
  const ready = !!issuer && !!point && total > 0;

  const [prodQ, setProdQ] = useState("");
  const prodMatches = useMemo(() => {
    const q = prodQ.trim().toLowerCase();
    return q ? db.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [db.products, prodQ]);

  return (
    <>
      <PageHeader
        title="Facturalo Fácil"
        subtitle="Elegí desde qué CUIT facturás, el punto de venta y el cliente; armá los ítems y listo"
      >
        <button className={btn.soft} onClick={() => setShowList((v) => !v)}>
          <History className="h-4 w-4" strokeWidth={1.6} /> Emitidas
          {invoices.length ? ` (${invoices.length})` : ""}
        </button>
        <button data-tour="fact-config" className={btn.soft} onClick={() => setConfig(true)}>
          <Settings2 className="h-4 w-4" strokeWidth={1.6} /> CUITs y puntos de venta
        </button>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 1. Emisor */}
          <Card title="1 · Desde qué CUIT" icon={FileCheck}>
            <div data-tour="fact-cuit" className="grid gap-3 sm:grid-cols-2">
              {inv.issuers.map((i) => {
                const on = i.id === issuer?.id;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIssuerId(i.id)}
                    className={`flex flex-col gap-1 rounded-3xl p-4 text-left transition-all ${on ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-accent"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{kindLabel[i.kind]}</span>
                      {on && <Check className="h-4 w-4" />}
                    </span>
                    <span className={`text-xs ${on ? "opacity-80" : "text-muted-foreground"}`}>
                      {i.name}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${on ? "opacity-80" : "text-muted-foreground"}`}
                    >
                      {i.cuit ? `CUIT ${i.cuit}` : "CUIT sin cargar"}
                    </span>
                    <span
                      className={`mt-1 text-[11px] ${on ? "opacity-70" : "text-muted-foreground"}`}
                    >
                      {kindHint[i.kind]}
                    </span>
                    {estado && (
                      <span
                        className={`mt-1 text-[11px] font-medium ${estado.emisores[issuerKey(i.kind)]?.configurado ? (on ? "opacity-90" : "text-success-foreground") : on ? "opacity-70" : "text-danger-soft-foreground"}`}
                      >
                        {estado.emisores[issuerKey(i.kind)]?.configurado
                          ? "● Conectado a ARCA"
                          : "○ Sin conectar a ARCA"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div data-tour="fact-pv" className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Punto de venta">
                <Select value={pointId} onChange={(e) => setPointId(e.target.value)}>
                  {(issuer?.points ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.number).padStart(5, "0")} · {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Comprobante">
                <div className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm">
                  <Badge>Factura {type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {kind === "ri"
                      ? type === "A"
                        ? "cliente inscripto"
                        : "consumidor final / mono"
                      : "sin IVA"}
                  </span>
                </div>
              </Field>
            </div>
          </Card>

          {/* 2. Cliente y presupuesto */}
          <Card title="2 · Cliente y presupuesto" icon={FileCheck}>
            <div data-tour="fact-cliente" className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente">
                <Select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setQuoteId("");
                  }}
                >
                  <option value="">Consumidor final</option>
                  {db.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.cuit ? ` · ${c.cuit}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Traer de un presupuesto" hint="Carga los ítems del presupuesto">
                <Select
                  value={quoteId}
                  onChange={(e) => loadQuote(db.quotes.find((q) => q.id === e.target.value))}
                >
                  <option value="">Sin presupuesto</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      #{q.number} · {q.clientName} · {ars(q.total)} · {fmtDate(q.date)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={cuitQ}
                  onChange={(e) => setCuitQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookupCuit();
                  }}
                  placeholder="Buscar por CUIT en ARCA (crea o actualiza el cliente)"
                  className="h-full w-full bg-transparent text-sm outline-hidden"
                  inputMode="numeric"
                />
              </div>
              <button
                className={btn.soft}
                disabled={cuitBusy || cuitQ.replace(/\D/g, "").length !== 11}
                onClick={() => void lookupCuit()}
              >
                {cuitBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}{" "}
                Consultar padrón
              </button>
            </div>
            {cuitMsg && <p className="mt-2 text-xs text-muted-foreground">{cuitMsg}</p>}
            {client && (
              <>
                <p className="mt-3 text-xs text-muted-foreground">
                  {client.ivaCategory ?? "Categoría de IVA sin especificar"}
                  {client.cuit
                    ? ` · CUIT ${client.cuit}`
                    : client.dni
                      ? ` · DNI ${client.dni}`
                      : " · sin CUIT ni DNI cargado"}
                  {client.address ? ` · ${client.address}` : ""}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Email del cliente"
                    hint={
                      emailDraft.trim()
                        ? "Al emitir, la factura se le manda sola con el PDF adjunto"
                        : "Sin email no se envía; igual podés mandarla después"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onBlur={saveClientEmail}
                        placeholder="cliente@correo.com"
                      />
                    </div>
                  </Field>
                </div>
              </>
            )}
          </Card>

          {/* 3. Ítems */}
          <Card
            title="3 · Ítems de la factura"
            icon={FileCheck}
            subtitle="Del catálogo, genéricos, o a mano. Si no cargás ítems, poné el importe total a la derecha."
          >
            <div data-tour="fact-items" className="flex flex-col gap-3">
              <div className="relative">
                <input
                  value={prodQ}
                  onChange={(e) => setProdQ(e.target.value)}
                  placeholder="Buscar un producto del catálogo"
                  className="h-10 w-full rounded-full bg-surface px-4 text-sm outline-hidden focus:ring-2 focus:ring-ring"
                />
                {prodMatches.length > 0 && (
                  <div className="absolute inset-x-0 top-11 z-20 flex flex-col overflow-hidden rounded-3xl bg-card p-1 shadow-soft">
                    {prodMatches.map((p) => {
                      const u = saleUnitsFor(p)[0] ?? "u";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            addLine({
                              desc: p.name,
                              qty: 1,
                              unit: unitLabel[u],
                              price: listPrice(p, u),
                            });
                            setProdQ("");
                          }}
                          className="flex items-center justify-between rounded-2xl px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {ars(listPrice(p, u))}/{unitLabel[u]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {inv.genericItems.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => addLine({ desc: g, qty: 1, unit: "u", price: 0 })}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-medium hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> {g}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => addLine({ desc: "", qty: 1, unit: "u", price: 0 })}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Ítem a mano
                </button>
              </div>

              {lines.length > 0 && (
                <Table
                  head={[
                    "Descripción",
                    { label: "Cantidad", right: true },
                    "Unidad",
                    { label: "Precio", right: true },
                    { label: "Subtotal", right: true },
                    "",
                  ]}
                  min={640}
                >
                  {lines.map((l) => (
                    <tr key={l.id} className={tr}>
                      <td className="min-w-[220px]">
                        <Input
                          value={l.desc}
                          onChange={(e) => updLine(l.id, { desc: e.target.value })}
                          placeholder="Descripción"
                        />
                      </td>
                      <td className="w-28">
                        <NumberInput value={l.qty} onChange={(n) => updLine(l.id, { qty: n })} />
                      </td>
                      <td className="w-24">
                        <Input
                          value={l.unit}
                          onChange={(e) => updLine(l.id, { unit: e.target.value })}
                        />
                      </td>
                      <td className="w-36">
                        <NumberInput
                          value={l.price}
                          onChange={(n) => updLine(l.id, { price: n })}
                          prefix="$"
                        />
                      </td>
                      <td className="text-right font-semibold tabular-nums">
                        {ars(l.qty * l.price)}
                      </td>
                      <td className="w-10 text-right">
                        <button
                          onClick={() => delLine(l.id)}
                          className={btn.icon}
                          aria-label="Quitar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
        </div>

        {/* Resumen */}
        <div className="flex flex-col gap-5">
          <Card title="Importe" icon={FileCheck}>
            {lines.length === 0 ? (
              <Field
                label="Importe total"
                hint={kind === "ri" ? "IVA incluido; se discrimina abajo" : "Sin IVA"}
              >
                <NumberInput
                  value={manualTotal}
                  onChange={setManualTotal}
                  prefix="$"
                  className="text-lg font-semibold"
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                {lines.length} {lines.length === 1 ? "ítem" : "ítems"} ·{" "}
                {qtyUnit(
                  lines.reduce((a, l) => a + l.qty, 0),
                  "u",
                )}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {kind === "ri" && (
                <>
                  <Row l="Neto gravado" v={ars(neto)} />
                  <Row l={`IVA ${ivaPct}%`} v={ars(iva)} />
                </>
              )}
              <div className="flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
                <span className="text-sm">Total factura {type}</span>
                <span className="text-lg font-bold tabular-nums">{ars(total)}</span>
              </div>
            </div>
            <div className="mt-4">
              <Field label="Observaciones (opcional)">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej: orden de compra, remito…"
                />
              </Field>
            </div>
            <div data-tour="fact-emitir" className="mt-4 flex flex-col gap-2">
              <button
                className={btn.primary}
                disabled={!ready || !estado?.emisores[issuerKey(kind)]?.configurado}
                onClick={() => {
                  setErrorMsg(null);
                  setConfirm(true);
                }}
              >
                <FileCheck className="h-4 w-4" /> Emitir factura {type}
              </button>
              {estado && !estado.emisores[issuerKey(kind)]?.configurado && (
                <p className="text-center text-[11px] text-danger-soft-foreground">
                  Este CUIT todavía no está conectado a ARCA.
                </p>
              )}
              {type === "B" && kind === "ri" && !client && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Consumidor final sin identificar: válido hasta el tope que fija ARCA; para
                  importes mayores cargá DNI o CUIT.
                </p>
              )}
              <p className="text-center text-[11px] text-muted-foreground">
                {issuer?.cuit
                  ? `${kindLabel[kind]} · CUIT ${issuer.cuit}`
                  : "Cargá el CUIT del emisor en “CUITs y puntos de venta”"}
                {point ? ` · PV ${String(point.number).padStart(5, "0")}` : ""}
              </p>
            </div>
          </Card>

          {done && (
            <Card title="Última emitida" icon={FileCheck}>
              <p className="text-sm font-semibold">
                Factura {cbteLetter(done.cbteTipo)} {String(done.ptoVta).padStart(5, "0")}-
                {String(done.cbteNro).padStart(8, "0")}
              </p>
              <p className="text-xs text-muted-foreground">
                {done.clientName} · {ars(done.total)} · CAE {done.cae}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={btn.soft}
                  onClick={() => void openInvoicePdf(db.settings, issuer, done)}
                >
                  <FileDown className="h-4 w-4" /> PDF
                </button>
                <button
                  className={btn.soft}
                  disabled={mailState?.id === done.id && mailState.status === "enviando"}
                  onClick={() => void sendMail(done)}
                >
                  {mailState?.id === done.id && mailState.status === "enviando" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}{" "}
                  Enviar por mail
                </button>
                <a className={btn.ghost} href={invoiceQrUrl(done)} target="_blank" rel="noreferrer">
                  Verificar en ARCA
                </a>
              </div>
              {mailState?.id === done.id && (
                <p
                  className={`mt-2 text-xs ${mailState.status === "error" ? "text-danger-soft-foreground" : mailState.status === "ok" ? "text-success-foreground" : "text-muted-foreground"}`}
                >
                  {mailState.msg}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title={`Emitir factura ${type}`}
        subtitle="Se pide el CAE a ARCA y queda registrada. Esta operación no se puede deshacer."
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-semibold">
              {issuer?.name} · {kindLabel[kind]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              CUIT {issuer?.cuit} · PV {String(point?.number ?? 0).padStart(5, "0")} ·{" "}
              {fmtDate(date)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Cliente: {client?.name ?? "Consumidor final"}
              {client?.cuit
                ? ` · CUIT ${client.cuit}`
                : client?.dni
                  ? ` · DNI ${client.dni}`
                  : ""}{" "}
              · {client?.ivaCategory ?? "Consumidor final"}
            </p>
            {kind === "ri" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Neto {ars(neto)} · IVA {ars(iva)}
              </p>
            )}
            <p className="mt-2 text-base font-bold tabular-nums">{ars(total)}</p>
          </div>
          {errorMsg && (
            <p className="rounded-2xl bg-danger-soft px-4 py-3 text-xs text-danger-soft-foreground">
              {errorMsg}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.soft} disabled={busy} onClick={() => setConfirm(false)}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={busy} onClick={() => void emitir()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="h-4 w-4" />
            )}{" "}
            {busy ? "Pidiendo CAE…" : "Confirmar y emitir"}
          </button>
        </div>
      </Modal>

      <Modal
        open={showList}
        onClose={() => setShowList(false)}
        title="Facturas emitidas"
        subtitle="Las últimas 200, con su CAE"
        wide
      >
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se emitió ninguna factura desde la plataforma.
          </p>
        ) : (
          <Table
            head={["Comprobante", "Fecha", "Cliente", { label: "Total", right: true }, "CAE", ""]}
            min={640}
          >
            {invoices.map((f) => (
              <tr key={f.id} className={tr}>
                <td className="font-semibold">
                  {cbteLetter(f.cbteTipo)} {String(f.ptoVta).padStart(5, "0")}-
                  {String(f.cbteNro).padStart(8, "0")}
                </td>
                <td className="whitespace-nowrap">{fmtDate(f.fecha)}</td>
                <td>{f.clientName}</td>
                <td className="text-right tabular-nums">{ars(f.total)}</td>
                <td className="text-xs tabular-nums text-muted-foreground">{f.cae}</td>
                <td className="text-right">
                  <button
                    className={btn.icon}
                    aria-label="PDF"
                    onClick={() =>
                      void openInvoicePdf(
                        db.settings,
                        inv.issuers.find((i) => issuerKey(i.kind) === f.issuer),
                        f,
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                  </button>
                  <button
                    className={btn.icon}
                    aria-label="Enviar por mail"
                    title={mailState?.id === f.id ? mailState.msg : "Enviar por mail"}
                    onClick={() => void sendMail(f)}
                  >
                    {mailState?.id === f.id && mailState.status === "enviando" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Modal>

      <Modal
        open={!!askEmail}
        onClose={() => setAskEmail(null)}
        title="¿A qué email la mando?"
        subtitle={
          askEmail
            ? `Factura ${cbteLetter(askEmail.cbteTipo)} ${String(askEmail.ptoVta).padStart(5, "0")}-${String(askEmail.cbteNro).padStart(8, "0")} · ${askEmail.clientName}`
            : undefined
        }
      >
        <Field label="Email">
          <Input
            type="email"
            value={askEmailValue}
            onChange={(e) => setAskEmailValue(e.target.value)}
            placeholder="cliente@correo.com"
            autoFocus
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.soft} onClick={() => setAskEmail(null)}>
            Cancelar
          </button>
          <button
            className={btn.primary}
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(askEmailValue.trim())}
            onClick={() => {
              const f = askEmail;
              setAskEmail(null);
              if (f) void sendMail(f, askEmailValue);
            }}
          >
            <Mail className="h-4 w-4" /> Enviar
          </button>
        </div>
      </Modal>

      <IssuersModal
        open={config}
        onClose={() => setConfig(false)}
        issuers={inv.issuers}
        genericItems={inv.genericItems}
        onSave={(issuers, genericItems) => updateSettings({ invoicing: { issuers, genericItems } })}
      />
    </>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-muted-foreground">{l}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

function IssuersModal({
  open,
  onClose,
  issuers,
  genericItems,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  issuers: Issuer[];
  genericItems: string[];
  onSave: (issuers: Issuer[], genericItems: string[]) => void;
}) {
  const [list, setList] = useState<Issuer[]>(issuers);
  const [generics, setGenerics] = useState(genericItems.join("\n"));
  useEffect(() => {
    if (open) {
      setList(issuers);
      setGenerics(genericItems.join("\n"));
    }
  }, [open, issuers, genericItems]);
  const upd = (id: string, patch: Partial<Issuer>) =>
    setList((ls) => ls.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CUITs y puntos de venta"
      subtitle="Un CUIT monotributo para consumidor final y otro inscripto para facturar con IVA"
      wide
    >
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((i) => (
          <div key={i.id} className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
            <Segmented
              value={i.kind}
              onChange={(kind) => upd(i.id, { kind })}
              options={[
                { value: "monotributo", label: "Monotributo" },
                { value: "ri", label: "Resp. inscripto" },
              ]}
            />
            <Field label="Razón social / nombre">
              <Input
                value={i.name}
                onChange={(e) => upd(i.id, { name: e.target.value })}
                className="on-surface"
              />
            </Field>
            <Field label="CUIT">
              <Input
                value={i.cuit}
                onChange={(e) => upd(i.id, { cuit: e.target.value })}
                placeholder="20-12345678-9"
                className="on-surface"
              />
            </Field>
            <Field label="Domicilio fiscal">
              <Input
                value={i.address ?? ""}
                onChange={(e) => upd(i.id, { address: e.target.value })}
                className="on-surface"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ingresos brutos">
                <Input
                  value={i.iibb ?? ""}
                  onChange={(e) => upd(i.id, { iibb: e.target.value })}
                  className="on-surface"
                />
              </Field>
              <Field label="Inicio de actividades">
                <Input
                  type="date"
                  value={i.activityStart ?? ""}
                  onChange={(e) => upd(i.id, { activityStart: e.target.value })}
                  className="on-surface"
                />
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Puntos de venta</p>
              <div className="flex flex-col gap-2">
                {i.points.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <NumberInput
                      value={p.number}
                      onChange={(n) =>
                        upd(i.id, {
                          points: i.points.map((x) => (x.id === p.id ? { ...x, number: n } : x)),
                        })
                      }
                      className="on-surface w-24"
                    />
                    <Input
                      value={p.label}
                      onChange={(e) =>
                        upd(i.id, {
                          points: i.points.map((x) =>
                            x.id === p.id ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="Mostrador, web…"
                      className="on-surface"
                    />
                    <button
                      onClick={() => upd(i.id, { points: i.points.filter((x) => x.id !== p.id) })}
                      className={btn.icon}
                      aria-label="Quitar"
                      disabled={i.points.length === 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  className={btn.ghost}
                  onClick={() =>
                    upd(i.id, {
                      points: [
                        ...i.points,
                        { id: uid(), number: (i.points.at(-1)?.number ?? 0) + 1, label: "" },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar punto de venta
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Field
          label="Ítems genéricos"
          hint="Uno por línea. Aparecen como botones para facturas sin mucho detalle."
        >
          <textarea
            value={generics}
            onChange={(e) => setGenerics(e.target.value)}
            rows={4}
            className="w-full rounded-2xl bg-surface px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-ring"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          onClick={() => {
            onSave(
              list,
              generics
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            );
            onClose();
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}
