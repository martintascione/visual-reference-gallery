import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CircleHelp, Plus, Trash2, Truck, Wallet } from "lucide-react";
import type { Bank, Purchase, PurchaseItem, SupplierPayMethod } from "@/lib/types";
import { supplierAccounts, useStore } from "@/lib/store";
import { ars, fmtDate, num, todayISO, addDays, uid } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  Stat,
  Table,
  Toggle,
  btn,
  tr,
} from "@/components/ui-bits";

export const Route = createFileRoute("/descargas")({
  head: () => ({
    meta: [
      { title: "Descargas · Corralón" },
      { name: "description", content: "Descargas de proveedores, fletes y cuentas a pagar." },
    ],
  }),
  component: Descargas,
});

type Account = ReturnType<typeof supplierAccounts>[number];
const methodName: Record<SupplierPayMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  gasoil: "Gasoil",
};
const key = (kind: string, party: string) => kind + "|" + party.trim().toLowerCase();

function Descargas() {
  const { db, removePurchase } = useStore();
  const [adding, setAdding] = useState(false);
  const [ledger, setLedger] = useState<string | null>(null);
  const [del, setDel] = useState<Purchase | null>(null);
  const accounts = useMemo(() => supplierAccounts(db), [db]);
  const debt = (k: "cantera" | "transporte") =>
    accounts.filter((a) => a.kind === k && a.saldo > 0).reduce((x, a) => x + a.saldo, 0);
  const open = accounts.find((a) => key(a.kind, a.party) === ledger) ?? null;
  const saldoOf = (kind: "cantera" | "transporte", party: string) =>
    accounts.find((a) => key(a.kind, a.party) === key(kind, party))?.saldo ?? 0;

  return (
    <>
      <PageHeader
        title="Descargas de proveedores"
        subtitle="Cada descarga suma stock, actualiza costos y queda en la cuenta de la cantera y del transporte"
      >
        <button
          className={btn.soft}
          onClick={() => window.dispatchEvent(new Event("abrir-tour-descargas"))}
        >
          <CircleHelp className="h-4 w-4" strokeWidth={1.6} /> Cómo funciona
        </button>
        <button data-tour="desc-nueva" className={btn.primary} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Nueva descarga
        </button>
      </PageHeader>

      <div data-tour="desc-stats" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Debo a canteras"
          value={ars(debt("cantera"))}
          tone={debt("cantera") > 0 ? "danger" : undefined}
        />
        <Stat
          label="Debo a transportes"
          value={ars(debt("transporte"))}
          tone={debt("transporte") > 0 ? "danger" : undefined}
        />
        <Stat label="Descargas cargadas" value={String(db.purchases.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div data-tour="desc-historial" className="min-w-0">
          <Card title="Historial de descargas" icon={Truck}>
            <Table
              head={[
                "Fecha",
                "Cantera y material",
                { label: "Mercadería", right: true },
                "Transporte",
                { label: "Flete", right: true },
                "",
              ]}
              min={760}
            >
              {db.purchases.map((p) => {
                const merch = p.items.reduce((a, i) => a + i.total, 0);
                return (
                  <tr key={p.id} className={tr}>
                    <td className="whitespace-nowrap align-top">{fmtDate(p.date)}</td>
                    <td>
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => setLedger(key("cantera", p.supplier))}
                      >
                        {p.supplier}
                      </button>
                      {p.remito && (
                        <span className="text-[11px] text-muted-foreground"> · Rto {p.remito}</span>
                      )}
                      {p.items.map((i, k) => (
                        <p key={k} className="text-[11px] text-muted-foreground">
                          {i.name}: {num(i.tons, 2)} × {ars(i.pricePerTon)} = {ars(i.total)}
                        </p>
                      ))}
                    </td>
                    <td className="text-right align-top tabular-nums">
                      <p className="font-semibold">{ars(merch)}</p>
                      <Badge tone={saldoOf("cantera", p.supplier) > 0 ? "danger" : "ok"}>
                        {saldoOf("cantera", p.supplier) > 0 ? "Se debe" : "Al día"}
                      </Badge>
                    </td>
                    <td className="align-top">
                      {p.carrier ? (
                        <button
                          className="text-left hover:underline"
                          onClick={() => setLedger(key("transporte", p.carrier ?? ""))}
                        >
                          {p.carrier}
                        </button>
                      ) : (
                        "—"
                      )}
                      {p.freightTons > 0 && p.freightRate > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {num(p.freightTons, 2)} t × {ars(p.freightRate)}
                        </p>
                      )}
                      {p.unloadCost > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Descarga {ars(p.unloadCost)}
                        </p>
                      )}
                    </td>
                    <td className="text-right align-top tabular-nums">
                      {p.freightTotal > 0 ? (
                        <>
                          <p className="font-semibold">{ars(p.freightTotal)}</p>
                          {p.carrier && (
                            <Badge tone={saldoOf("transporte", p.carrier) > 0 ? "danger" : "ok"}>
                              {saldoOf("transporte", p.carrier) > 0 ? "Se debe" : "Al día"}
                            </Badge>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right align-top">
                      <button
                        className={btn.icon}
                        onClick={() => setDel(p)}
                        aria-label="Eliminar descarga"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {db.purchases.length === 0 && (
              <Empty
                title="Todavía no hay descargas"
                text='Con "Nueva descarga" cargás el camión que llegó: cantera, materiales, precio, flete y si quedó pago o se debe.'
              />
            )}
          </Card>
        </div>

        <div data-tour="desc-cuentas" className="min-w-0">
          <Card title="Cuentas con proveedores" icon={Wallet}>
            <div className="flex flex-col gap-2">
              {accounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Acá aparece cada cantera y cada transporte con lo que se le debe.
                </p>
              )}
              {accounts.map((a) => (
                <button
                  key={key(a.kind, a.party)}
                  onClick={() => setLedger(key(a.kind, a.party))}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.party}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.kind === "cantera" ? "Cantera" : "Transporte"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-sm font-bold tabular-nums ${a.saldo > 0 ? "text-danger-soft-foreground" : ""}`}
                    >
                      {ars(Math.abs(a.saldo))}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.saldo > 0 ? "se debe" : a.saldo < 0 ? "a favor" : "al día"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <NewPurchase open={adding} onClose={() => setAdding(false)} />
      <Ledger account={open} onClose={() => setLedger(null)} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar descarga">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Se borra la descarga de {del?.supplier} del {del ? fmtDate(del.date) : ""} y se
            descuenta del stock lo que había sumado. Los costos de los productos y los pagos ya
            cargados no se tocan. No se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setDel(null)}>
              Cancelar
            </button>
            <button
              className={`${btn.danger} h-10 px-5 text-sm`}
              onClick={() => {
                if (del) removePurchase(del.id);
                setDel(null);
              }}
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type Line = { id: string; productId: string; tons: number; price: number };
type PayNow = {
  on: boolean;
  method: SupplierPayMethod;
  account: Bank;
  detail: string;
  dueDate: string;
  liters: number;
};
const payBlank = (): PayNow => ({
  on: false,
  method: "transferencia",
  account: "BBVA",
  detail: "",
  dueDate: addDays(todayISO(), 30),
  liters: 0,
});

/** Campos de un pago: medio, cuenta y los datos propios de cheque o gasoil. */
function PayFields({
  v,
  set,
  allowGasoil,
}: {
  v: PayNow;
  set: (p: Partial<PayNow>) => void;
  allowGasoil: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      <Field label="Cómo se paga">
        <Select
          value={v.method}
          onChange={(e) => set({ method: e.target.value as SupplierPayMethod })}
        >
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="cheque">Cheque</option>
          {allowGasoil && <option value="gasoil">Gasoil (carga en la estación)</option>}
        </Select>
      </Field>
      {v.method !== "gasoil" ? (
        <Field label="Sale de">
          <Select
            value={v.method === "efectivo" ? "Caja" : v.account === "Caja" ? "BBVA" : v.account}
            onChange={(e) => set({ account: e.target.value as Bank })}
            disabled={v.method === "efectivo"}
          >
            {v.method === "efectivo" && <option value="Caja">Caja</option>}
            <option value="BBVA">BBVA</option>
            <option value="Provincia">Provincia</option>
          </Select>
        </Field>
      ) : (
        <Field
          label="Litros cargados"
          help="Litros de gasoil que cargó el transporte en la estación de servicio a nombre de la empresa. Es informativo: lo que descuenta de la deuda es el monto."
        >
          <NumberInput value={v.liters} onChange={(n) => set({ liters: n })} suffix="L" />
        </Field>
      )}
      {v.method === "cheque" && (
        <>
          <Field label="N° de cheque">
            <Input value={v.detail} onChange={(e) => set({ detail: e.target.value })} />
          </Field>
          <Field label="Fecha de cobro" hint="Sale del banco ese día">
            <div className="flex gap-1.5">
              <Input
                type="date"
                value={v.dueDate}
                onChange={(e) => set({ dueDate: e.target.value })}
              />
              {[30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={btn.ghost}
                  onClick={() => set({ dueDate: addDays(todayISO(), d) })}
                >
                  {d} d
                </button>
              ))}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}

function NewPurchase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addPurchase, addSupplierPayment } = useStore();
  const products = useMemo(
    () => db.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
    [db.products],
  );
  const blankLine = (): Line => ({ id: uid(), productId: "", tons: 0, price: 0 });
  const [date, setDate] = useState(todayISO());
  const [supplier, setSupplier] = useState("");
  const [remito, setRemito] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [carrier, setCarrier] = useState("");
  const [fMode, setFMode] = useState<"t" | "total">("t");
  const [fTons, setFTons] = useState(0);
  const [fValue, setFValue] = useState(0);
  const [unload, setUnload] = useState(0);
  const [updateCosts, setUpdateCosts] = useState(true);
  const [payS, setPayS] = useState<PayNow>(payBlank);
  const [payC, setPayC] = useState<PayNow>(payBlank);

  const suppliers = [...new Set(db.purchases.map((p) => p.supplier))];
  const carriers = [...new Set(db.purchases.map((p) => p.carrier).filter(Boolean) as string[])];
  const upd = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  /** Último precio pagado por ese producto (para ver si subió). */
  const lastPrice = (productId: string) => {
    for (const p of db.purchases) {
      const it = p.items.find((i) => i.productId === productId);
      if (it) return { price: it.pricePerTon, date: p.date, supplier: p.supplier };
    }
    return null;
  };
  const valid = lines.filter((l) => l.productId && l.tons > 0);
  const tons = valid.reduce((a, l) => a + l.tons, 0);
  const merch = valid.reduce((a, l) => a + l.tons * l.price, 0);
  const freightTons = fTons || tons;
  const freightTotal = fMode === "t" ? Math.round(freightTons * fValue) : fValue;
  const ok = supplier.trim().length > 1 && valid.length > 0;

  const save = () => {
    const items: PurchaseItem[] = valid.map((l) => ({
      productId: l.productId,
      name: products.find((p) => p.id === l.productId)?.name ?? "",
      tons: l.tons,
      pricePerTon: l.price,
      total: Math.round(l.tons * l.price),
    }));
    const iso = date === todayISO() ? new Date().toISOString() : date + "T12:00:00.000Z";
    const pur = addPurchase(
      {
        date: iso,
        supplier: supplier.trim(),
        remito: remito.trim() || undefined,
        items,
        carrier: carrier.trim() || undefined,
        freightTons,
        freightRate:
          fMode === "t" ? fValue : freightTons > 0 ? Math.round(fValue / freightTons) : 0,
        freightTotal,
        unloadCost: unload,
      },
      updateCosts,
    );
    const pay = (v: PayNow, party: string, kind: "cantera" | "transporte", amount: number) => {
      if (!v.on || amount <= 0 || !party) return;
      addSupplierPayment({
        date: iso,
        party,
        kind,
        amount,
        method: v.method,
        account:
          v.method === "gasoil"
            ? undefined
            : v.method === "efectivo"
              ? "Caja"
              : v.account === "Caja"
                ? "BBVA"
                : v.account,
        detail: v.method === "cheque" && v.detail ? `Cheque ${v.detail}` : undefined,
        dueDate: v.method === "cheque" ? v.dueDate : undefined,
        liters: v.method === "gasoil" ? v.liters || undefined : undefined,
        purchaseId: pur.id,
      });
    };
    pay(payS, supplier.trim(), "cantera", Math.round(merch));
    pay(payC, carrier.trim(), "transporte", freightTotal);
    setSupplier("");
    setRemito("");
    setLines([blankLine()]);
    setCarrier("");
    setFTons(0);
    setFValue(0);
    setUnload(0);
    setPayS(payBlank());
    setPayC(payBlank());
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva descarga"
      subtitle="Al guardar se suma el stock, se actualizan los costos y queda asentado lo que se debe"
      wide
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!ok} onClick={save}>
            Asentar descarga
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1fr)_150px_170px]">
          <Field
            label="Cantera"
            className="col-span-2 sm:col-span-1"
            help="El proveedor de la mercadería. Si ya le compraste, aparece en la lista."
          >
            <Input
              list="canteras"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Ej: La Helena"
            />
            <datalist id="canteras">
              {suppliers.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="N° de remito">
            <Input value={remito} onChange={(e) => setRemito(e.target.value)} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 text-xs font-semibold">Material que llegó</p>
          <div className="flex flex-col gap-3">
            {lines.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              const unit = !p || p.unit === "kg" ? "t" : p.unit === "m2" ? "m²" : "u";
              const last = l.productId ? lastPrice(l.productId) : null;
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.6fr)_110px_150px_120px_auto]"
                >
                  <Field
                    label="Producto"
                    className="col-span-2 sm:col-span-1"
                    hint={
                      last
                        ? `Última vez: ${ars(last.price)} · ${fmtDate(last.date)} · ${last.supplier}`
                        : undefined
                    }
                  >
                    <Select
                      value={l.productId}
                      onChange={(e) => upd(l.id, { productId: e.target.value })}
                    >
                      <option value="">Elegir producto…</option>
                      {products.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cantidad" hint={last ? " " : undefined}>
                    <NumberInput
                      value={l.tons}
                      onChange={(v) => upd(l.id, { tons: v })}
                      suffix={unit}
                    />
                  </Field>
                  <Field
                    label={`Precio por ${unit === "t" ? "tonelada" : unit}`}
                    hint={
                      last && l.price > 0 && l.price !== last.price
                        ? `${l.price > last.price ? "Subió" : "Bajó"} ${num(Math.abs((l.price / last.price - 1) * 100), 1)} %`
                        : last
                          ? " "
                          : undefined
                    }
                  >
                    <NumberInput
                      value={l.price}
                      onChange={(v) => upd(l.id, { price: v })}
                      prefix="$"
                    />
                  </Field>
                  <Field label="Total" hint={last ? " " : undefined}>
                    <NumberInput
                      value={Math.round(l.tons * l.price)}
                      onChange={(v) =>
                        upd(l.id, { price: l.tons > 0 ? Math.round(v / l.tons) : 0 })
                      }
                      prefix="$"
                    />
                  </Field>
                  <button
                    className={`${btn.icon} ${last ? "mb-5" : ""}`}
                    onClick={() =>
                      setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))
                    }
                    aria-label="Quitar renglón"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button className={btn.ghost} onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus className="h-3.5 w-3.5" /> Otro material del mismo camión
            </button>
            <p className="text-xs text-muted-foreground">
              {num(tons, 2)} en total · mercadería <b className="text-foreground">{ars(merch)}</b>
            </p>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <Toggle
              checked={payS.on}
              onChange={(on) => setPayS({ ...payS, on })}
              label="Ya le pagué a la cantera"
            />
            {payS.on ? (
              <div className="mt-3">
                <PayFields v={payS} set={(p) => setPayS({ ...payS, ...p })} allowGasoil={false} />
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Queda como deuda en la cuenta de la cantera. Después cargás los pagos, uno o varios.
              </p>
            )}
          </div>
        </div>

        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 text-xs font-semibold">Flete y descarga</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
            <Field
              label="Transporte"
              className="col-span-2"
              help="Quién trajo la carga. Queda con su propia cuenta para ir cargando los pagos."
            >
              <Input
                list="transportes"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Ej: Cucumelo"
              />
              <datalist id="transportes">
                {carriers.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field
              label={fMode === "t" ? "Tarifa por tonelada" : "Flete total"}
              hint={fMode === "t" && freightTotal > 0 ? `Total ${ars(freightTotal)}` : undefined}
            >
              <NumberInput value={fValue} onChange={setFValue} prefix="$" />
            </Field>
            <Field
              label="Costo de descarga"
              help="Lo que costó bajar la carga (máquina o personal). Se reparte por tonelada en el costo de los productos."
            >
              <NumberInput value={unload} onChange={setUnload} prefix="$" />
            </Field>
            <div className="col-span-full flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Segmented
                value={fMode}
                onChange={setFMode}
                options={[
                  { value: "t", label: "Por tonelada" },
                  { value: "total", label: "Total del viaje" },
                ]}
              />
              {fMode === "t" && (
                <span className="flex items-center gap-2">
                  Toneladas del flete
                  <span className="w-28">
                    <NumberInput value={fTons || tons} onChange={setFTons} suffix="t" />
                  </span>
                </span>
              )}
            </div>
          </div>
          {carrier.trim() && freightTotal > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <Toggle
                checked={payC.on}
                onChange={(on) => setPayC({ ...payC, on })}
                label="Ya le pagué todo el flete"
              />
              {payC.on ? (
                <div className="mt-3">
                  <PayFields v={payC} set={(p) => setPayC({ ...payC, ...p })} allowGasoil />
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Queda como deuda con el transporte. Los pagos parciales (gasoil, cheque, efectivo)
                  se cargan desde su cuenta.
                </p>
              )}
            </div>
          )}
        </div>

        <Toggle
          checked={updateCosts}
          onChange={setUpdateCosts}
          label="Actualizar costos y precios de los productos con esta descarga"
        />
      </div>
    </Modal>
  );
}

/** Cuenta de una cantera o transporte: debe, haber y saldo, como en la planilla. */
function Ledger({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { db, addSupplierPayment, removeSupplierPayment } = useStore();
  const [v, setV] = useState<PayNow>(payBlank);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  if (!account) return null;
  const mine = (party: string | undefined) =>
    !!party && party.trim().toLowerCase() === account.party.toLowerCase();
  const rows = [
    ...db.purchases
      .filter((p) =>
        account.kind === "cantera" ? mine(p.supplier) : mine(p.carrier) && p.freightTotal > 0,
      )
      .map((p) => ({
        id: p.id,
        date: p.date,
        detail:
          account.kind === "cantera"
            ? `${p.items.map((i) => `${i.name} ${num(i.tons, 2)}`).join(", ")}${p.remito ? ` · Rto ${p.remito}` : ""}`
            : `Flete ${p.supplier}${p.freightTons ? ` · ${num(p.freightTons, 2)} t` : ""}`,
        debe:
          account.kind === "cantera" ? p.items.reduce((a, i) => a + i.total, 0) : p.freightTotal,
        haber: 0,
        payId: "",
      })),
    ...db.supplierPayments
      .filter((p) => p.kind === account.kind && mine(p.party))
      .map((p) => ({
        id: p.id,
        date: p.date,
        detail: `${methodName[p.method]}${p.detail ? " · " + p.detail : ""}${p.liters ? ` · ${num(p.liters)} L` : ""}${p.method === "cheque" && p.dueDate ? ` · cobra el ${fmtDate(p.dueDate)}` : ""}${p.account ? ` · ${p.account}` : ""}`,
        debe: 0,
        haber: p.amount,
        payId: p.id,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  const withSaldo = rows.map((r) => ({ ...r, saldo: (run += r.debe - r.haber) }));

  const pay = () => {
    addSupplierPayment({
      date: date === todayISO() ? new Date().toISOString() : date + "T12:00:00.000Z",
      party: account.party,
      kind: account.kind,
      amount,
      method: v.method,
      account:
        v.method === "gasoil"
          ? undefined
          : v.method === "efectivo"
            ? "Caja"
            : v.account === "Caja"
              ? "BBVA"
              : v.account,
      detail: v.method === "cheque" && v.detail ? `Cheque ${v.detail}` : undefined,
      dueDate: v.method === "cheque" ? v.dueDate : undefined,
      liters: v.method === "gasoil" ? v.liters || undefined : undefined,
    });
    setAmount(0);
    setV(payBlank());
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={account.party}
      subtitle={`${account.kind === "cantera" ? "Cantera" : "Transporte"} · ${account.saldo > 0 ? `se le debe ${ars(account.saldo)}` : account.saldo < 0 ? `saldo a favor del corralón ${ars(-account.saldo)}` : "al día"}`}
      wide
    >
      <div className="flex flex-col gap-4">
        <Table
          head={[
            "Fecha",
            "Detalle",
            { label: "Debe", right: true },
            { label: "Pagado", right: true },
            { label: "Saldo", right: true },
            "",
          ]}
          min={560}
        >
          {withSaldo.map((r) => (
            <tr key={r.id} className={tr}>
              <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
              <td className="text-xs">{r.detail}</td>
              <td className="text-right tabular-nums">{r.debe ? ars(r.debe) : ""}</td>
              <td className="text-right tabular-nums text-success-foreground">
                {r.haber ? ars(r.haber) : ""}
              </td>
              <td
                className={`text-right font-semibold tabular-nums ${r.saldo > 0 ? "text-danger-soft-foreground" : ""}`}
              >
                {ars(r.saldo)}
              </td>
              <td className="text-right">
                {r.payId && (
                  <button
                    className={btn.icon}
                    onClick={() => removeSupplierPayment(r.payId)}
                    aria-label="Borrar pago"
                    title="Borrar este pago"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>

        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 text-xs font-semibold">Registrar un pago</p>
          <div className="mb-3 grid grid-cols-2 gap-x-3">
            <Field label="Monto">
              <NumberInput value={amount} onChange={setAmount} prefix="$" />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <PayFields
            v={v}
            set={(p) => setV({ ...v, ...p })}
            allowGasoil={account.kind === "transporte"}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {account.saldo > 0 ? (
              <button className={btn.ghost} onClick={() => setAmount(account.saldo)}>
                Pagar todo el saldo ({ars(account.saldo)})
              </button>
            ) : (
              <span />
            )}
            <button className={btn.primary} disabled={amount <= 0} onClick={pay}>
              Registrar pago {amount > 0 ? ars(amount) : ""}
            </button>
          </div>
          {v.method === "gasoil" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              El gasoil descuenta la deuda con el transporte, pero no saca plata de caja ni de los
              bancos: queda en la cuenta de la estación de servicio.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
