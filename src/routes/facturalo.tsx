import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, FileCheck, Hammer, Plus, Settings2, Trash2, X } from "lucide-react";
import type { Client, Issuer, IssuerKind, Quote } from "@/lib/types";
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

function Facturalo() {
  const { db, updateSettings } = useStore();
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
  const [working, setWorking] = useState(false);
  const [config, setConfig] = useState(false);

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
            {client && (
              <p className="mt-3 text-xs text-muted-foreground">
                {client.ivaCategory ?? "Categoría de IVA sin especificar"}
                {client.cuit
                  ? ` · CUIT ${client.cuit}`
                  : client.dni
                    ? ` · DNI ${client.dni}`
                    : " · sin CUIT ni DNI cargado"}
                {client.address ? ` · ${client.address}` : ""}
              </p>
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
              <button className={btn.primary} disabled={!ready} onClick={() => setWorking(true)}>
                <FileCheck className="h-4 w-4" /> Emitir factura {type}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                {issuer?.cuit
                  ? `${kindLabel[kind]} · CUIT ${issuer.cuit}`
                  : "Cargá el CUIT del emisor en “CUITs y puntos de venta”"}
                {point ? ` · PV ${String(point.number).padStart(5, "0")}` : ""}
              </p>
            </div>
          </Card>

          <Card title="Cómo va a funcionar" icon={Hammer}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Al emitir, la factura va a salir con CAE desde ARCA (AFIP) por el CUIT elegido, se va
              a descargar en PDF con el diseño de la marca y va a quedar vinculada a la venta o
              presupuesto. Por ahora podés armarla y revisar los importes.
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={working}
        onClose={() => setWorking(false)}
        title="Estamos trabajando en esta funcionalidad"
        subtitle="La emisión electrónica con ARCA todavía no está conectada"
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-semibold">Así quedaría la factura {type}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {issuer?.name} · {kindLabel[kind]} {issuer?.cuit ? `· CUIT ${issuer.cuit}` : ""} · PV{" "}
              {String(point?.number ?? 0).padStart(5, "0")} · {fmtDate(date)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cliente: {client?.name ?? "Consumidor final"}
            </p>
            <p className="mt-2 text-base font-bold tabular-nums">{ars(total)}</p>
          </div>
          <p className="text-muted-foreground">
            Cuando esté lista, este botón va a emitir el comprobante con CAE y descargar el PDF.
            Mientras tanto, seguí facturando por el portal de ARCA con estos mismos datos.
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <button className={btn.primary} onClick={() => setWorking(false)}>
            Entendido
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
