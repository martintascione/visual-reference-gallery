import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, Pencil, Plus, Trash2, Truck, Wallet } from "lucide-react";
import type { Bank, Purchase, PurchaseItem, SupplierCheque, SupplierPayMethod } from "@/lib/types";
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
import { ProductEditor } from "@/components/product-editor";
import { bigBagKg, stoneGroup } from "@/lib/pricing";

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
  const [edit, setEdit] = useState<Purchase | null>(null);
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
                          {i.name}:{" "}
                          {(() => {
                            const pr = db.products.find((x) => x.id === i.productId);
                            const k = pr && stoneGroup(pr) === "grava" ? bigBagKg(pr) / 1000 : 1;
                            return k !== 1
                              ? `${num(i.tons / k, 2)} bolsones × ${ars(i.pricePerTon * k)}`
                              : `${num(i.tons, 2)} × ${ars(i.pricePerTon)}`;
                          })()}{" "}
                          = {ars(i.total)}
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
                    <td className="whitespace-nowrap text-right align-top">
                      <button
                        className={btn.icon}
                        onClick={() => setEdit(p)}
                        aria-label="Editar descarga"
                        title="Editar este asiento"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </button>
                      <button
                        className={btn.icon}
                        onClick={() => setDel(p)}
                        aria-label="Eliminar descarga"
                        title="Eliminar este asiento"
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
                      {a.kind === "cantera" ? "Cantera" : "Transporte o descarga"}
                      {a.remind && a.saldo > 0 ? ` · pagar el ${fmtDay(a.remind)}` : ""}
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
      <NewPurchase open={!!edit} onClose={() => setEdit(null)} edit={edit} />
      <Ledger account={open} onClose={() => setLedger(null)} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar descarga">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Se borra la descarga de {del?.supplier} del {del ? fmtDate(del.date) : ""} y se
            descuenta del stock lo que había sumado.{" "}
            {del && db.supplierPayments.some((x) => x.purchaseId === del.id)
              ? `También se anulan los ${db.supplierPayments.filter((x) => x.purchaseId === del.id).length} pagos cargados en ese asiento (vuelven a caja o banco, y los cheques de clientes vuelven a la cartera). `
              : ""}
            Los costos de los productos no se tocan. No se puede deshacer.
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
  /** Cheque propio o de un cliente (de terceros). */
  chequeKind: "propio" | "tercero";
  /** Cheque de la cartera elegido ("" = se carga uno nuevo). */
  chequeId: string;
  /** Quién me lo dio, de quién es y de qué banco (cheque de terceros que no estaba cargado). */
  from: string;
  drawer: string;
  chequeBank: string;
  /** Paga todo; si no, paga `amount` y el resto queda como saldo. */
  full: boolean;
  amount: number;
};
/** Pagos que se cargan al asentar la descarga: ninguno, uno o varios (ej. dos cheques). */
type PayBox = { on: boolean; remind: number; lines: (PayNow & { id: string })[] };
/** Monto de cada pago: el que está en "resto" toma lo que falta para llegar al total. */
const amountsOf = (b: PayBox, total: number) => {
  const fixed = b.lines.reduce((a, l) => a + (l.full ? 0 : Math.max(0, l.amount)), 0);
  const autos = b.lines.filter((l) => l.full).length;
  let left = total;
  return b.lines.map((l) => {
    const want = l.full ? Math.max(0, total - fixed) / autos : Math.max(0, l.amount);
    const a = Math.round(Math.min(want, left));
    left -= a;
    return a;
  });
};
const paidOf = (b: PayBox, total: number) =>
  b.on ? amountsOf(b, total).reduce((a, n) => a + n, 0) : 0;
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Datos del cheque para guardar en el historial de cheques. */
const chequeOf = (v: PayNow): SupplierCheque | undefined =>
  v.method !== "cheque"
    ? undefined
    : {
        kind: v.chequeKind,
        id: v.chequeKind === "tercero" && v.chequeId ? v.chequeId : undefined,
        number: v.detail.trim(),
        bank: v.chequeBank.trim(),
        drawer: v.drawer.trim(),
        from: v.from.trim(),
        dueDate: v.dueDate,
      };
const payBlank = (): PayNow => ({
  chequeKind: "propio",
  chequeId: "",
  from: "",
  drawer: "",
  chequeBank: "",
  full: true,
  amount: 0,
  on: false,
  method: "transferencia",
  account: "BBVA",
  detail: "",
  dueDate: addDays(todayISO(), 30),
  liters: 0,
});

/** Campos de un pago: medio, cuenta y los datos propios de cheque o gasoil. */
const boxBlank = (): PayBox => ({ on: false, remind: 30, lines: [{ ...payBlank(), id: uid() }] });

function PayFields({
  v,
  set,
  allowGasoil,
  onAmount,
}: {
  v: PayNow;
  set: (p: Partial<PayNow>) => void;
  allowGasoil: boolean;
  /** Al elegir un cheque de la cartera, el monto del pago pasa a ser el del cheque. */
  onAmount?: ((n: number) => void) | undefined;
}) {
  const { db } = useStore();
  const third = v.method === "cheque" && v.chequeKind === "tercero";
  const wallet = db.cheques
    .filter((c) => c.status === "cartera")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
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
      {third ? (
        <Field
          label="Cheque que entregás"
          help="Elegí un cheque de la cartera (los que te dieron los clientes) o cargá uno que todavía no estaba en el sistema. Queda en el historial de cheques con a quién se lo diste."
        >
          <Select
            value={v.chequeId}
            onChange={(e) => {
              const c = wallet.find((x) => x.id === e.target.value);
              if (!c) return set({ chequeId: "" });
              set({ chequeId: c.id, detail: c.number, dueDate: c.dueDate });
              onAmount?.(c.amount);
            }}
          >
            <option value="">Uno que no está cargado…</option>
            {wallet.map((c) => (
              <option key={c.id} value={c.id}>
                N° {c.number} · {c.clientName} · {ars(c.amount)} · vence {fmtDay(c.dueDate)}
              </option>
            ))}
          </Select>
        </Field>
      ) : v.method !== "gasoil" ? (
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
        <div className="col-span-2">
          <Segmented
            value={v.chequeKind}
            onChange={(k) => set({ chequeKind: k, chequeId: "" })}
            options={[
              { value: "propio", label: "Cheque propio" },
              { value: "tercero", label: "Cheque de un cliente (terceros)" },
            ]}
          />
        </div>
      )}
      {third && !v.chequeId && (
        <>
          <Field label="N° de cheque">
            <Input value={v.detail} onChange={(e) => set({ detail: e.target.value })} />
          </Field>
          <Field label="Banco del cheque">
            <Input value={v.chequeBank} onChange={(e) => set({ chequeBank: e.target.value })} />
          </Field>
          <Field label="Quién me lo dio" help="La persona o empresa que te entregó el cheque.">
            <Input
              list="quien-dio-cheque"
              value={v.from}
              onChange={(e) => set({ from: e.target.value })}
            />
            <datalist id="quien-dio-cheque">
              {db.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field
            label="De quién es (librador)"
            help="El titular original del cheque: quien lo firmó. Si lo dejás vacío se toma a quien te lo dio."
          >
            <Input value={v.drawer} onChange={(e) => set({ drawer: e.target.value })} />
          </Field>
          <Field label="Fecha de vencimiento" className="col-span-2">
            <Input
              type="date"
              value={v.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })}
            />
          </Field>
        </>
      )}
      {third && v.chequeId && (
        <p className="col-span-2 text-[11px] text-muted-foreground">
          {(() => {
            const c = wallet.find((x) => x.id === v.chequeId);
            return c
              ? `Me lo dio ${c.clientName || "—"} · es de ${c.drawer || "—"} · ${c.bank} · vence el ${fmtDay(c.dueDate)}. Sale de la cartera y queda entregado a este proveedor.`
              : "";
          })()}
        </p>
      )}
      {v.method === "cheque" && !third && (
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

/** Pago al asentar la descarga: todo, una parte o nada, en uno o varios pagos, con aviso para el saldo. */
function PayNowBox({
  v,
  set,
  total,
  who,
  date,
  allowGasoil,
}: {
  v: PayBox;
  set: (f: (b: PayBox) => PayBox) => void;
  total: number;
  who: string;
  date: string;
  allowGasoil: boolean;
}) {
  const amounts = amountsOf(v, total);
  const paid = paidOf(v, total);
  const rest = total - paid;
  const updLine = (id: string, patch: Partial<PayNow>) =>
    set((b) => ({ ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const one = (patch: Partial<PayNow>) =>
    set((b) => ({ ...b, lines: [{ ...payBlank(), id: uid(), ...patch }] }));
  const cheque = (days: number, patch: Partial<PayNow> = {}) => ({
    ...payBlank(),
    id: uid(),
    method: "cheque" as const,
    dueDate: addDays(date, days),
    ...patch,
  });
  return (
    <div className="mt-3 border-t border-border pt-3">
      <Toggle
        checked={v.on}
        onChange={(on) => set((b) => ({ ...b, on }))}
        label={`Le pago ahora ${who} (todo o una parte)`}
      />
      {v.on && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Rápido:</span>
            <button type="button" className={btn.ghost} onClick={() => one({ full: true })}>
              Todo
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => one({ full: false, amount: Math.round(total / 2) })}
            >
              La mitad
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() =>
                set((b) => ({
                  ...b,
                  lines: [
                    cheque(30, { full: false, amount: Math.round(total / 2) }),
                    cheque(60, { full: true }),
                  ],
                }))
              }
            >
              2 cheques a 30 y 60 días
            </button>
          </div>
          {v.lines.map((l, i) => (
            <div key={l.id} className="rounded-2xl bg-card p-3">
              <div className="mb-3 flex items-end gap-2">
                <Field
                  label={v.lines.length > 1 ? `Pago ${i + 1} · monto` : "Cuánto le pagás ahora"}
                  className="flex-1"
                  help="Si pagás solo una parte, el resto queda como saldo en la cuenta del proveedor y lo vas pagando después."
                >
                  <NumberInput
                    value={amounts[i] ?? 0}
                    onChange={(n) => updLine(l.id, { full: false, amount: n })}
                    prefix="$"
                  />
                </Field>
                {v.lines.length > 1 && (
                  <button
                    type="button"
                    className={btn.icon}
                    aria-label="Quitar este pago"
                    onClick={() =>
                      set((b) => ({ ...b, lines: b.lines.filter((x) => x.id !== l.id) }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                )}
              </div>
              <PayFields
                v={l}
                set={(p) => updLine(l.id, p)}
                allowGasoil={allowGasoil}
                onAmount={(n) => updLine(l.id, { full: false, amount: n })}
              />
            </div>
          ))}
          <button
            type="button"
            className={`${btn.ghost} self-start`}
            onClick={() =>
              set((b) => {
                const am = amountsOf(b, total);
                const left = total - am.reduce((a, n) => a + n, 0);
                // Si ya estaba todo cubierto, el pago anterior pasa a la mitad y el nuevo toma el resto.
                const lines = b.lines.map((x, k) =>
                  left > 0
                    ? { ...x, full: false, amount: am[k] ?? 0 }
                    : k === b.lines.length - 1
                      ? { ...x, full: false, amount: Math.round((am[k] ?? 0) / 2) }
                      : { ...x, full: false, amount: am[k] ?? 0 },
                );
                const prev = b.lines[b.lines.length - 1];
                const next =
                  prev?.method === "cheque"
                    ? cheque(0, { dueDate: addDays(prev.dueDate, 30), account: prev.account })
                    : { ...payBlank(), id: uid() };
                return { ...b, lines: [...lines, { ...next, full: true }] };
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Otro pago (otro cheque, efectivo, transferencia…)
          </button>
        </div>
      )}
      {rest > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 text-xs">
          <span>
            {v.on ? `Paga ${ars(paid)} · queda` : "Queda"} debiendo{" "}
            <b className="text-danger-soft-foreground">{ars(rest)}</b> · avisarme para pagarlo en
          </span>
          <span className="w-24">
            <NumberInput
              value={v.remind}
              onChange={(n) => set((b) => ({ ...b, remind: Math.max(0, Math.round(n)) }))}
              suffix="días"
            />
          </span>
          {[7, 15, 30, 60].map((d) => (
            <button
              key={d}
              type="button"
              className={v.remind === d ? btn.soft : btn.ghost}
              onClick={() => set((b) => ({ ...b, remind: d }))}
            >
              {d}
            </button>
          ))}
          <span className="text-muted-foreground">
            {v.remind > 0
              ? `Te avisa el ${fmtDay(addDays(date, v.remind))}`
              : "Sin aviso: queda solo en la cuenta"}
          </span>
        </div>
      ) : (
        total > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Queda pago{v.lines.length > 1 ? ` en ${v.lines.length} pagos` : ""}, sin saldo.
          </p>
        )
      )}
    </div>
  );
}

function NewPurchase({
  open,
  onClose,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  /** Descarga ya asentada que se está corrigiendo. */
  edit?: Purchase | null | undefined;
}) {
  const { db, addPurchase, updatePurchase, addSupplierPayment } = useStore();
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
  const [unloadBy, setUnloadBy] = useState("");
  const [payU, setPayU] = useState<PayBox>(boxBlank);
  const [updateCosts, setUpdateCosts] = useState(true);
  const [payS, setPayS] = useState<PayBox>(boxBlank);
  const [payC, setPayC] = useState<PayBox>(boxBlank);
  // Crear un producto sin salir de la descarga: al guardarlo queda elegido en ese renglón.
  const [creating, setCreating] = useState(false);
  const pending = useRef<{ lineId: string; known: Set<string> } | null>(null);
  const startCreate = (lineId: string) => {
    pending.current = { lineId, known: new Set(db.products.map((p) => p.id)) };
    setCreating(true);
  };
  useEffect(() => {
    const c = pending.current;
    if (!c) return;
    const nuevo = db.products.find((p) => p.active && !c.known.has(p.id));
    if (!nuevo) return;
    pending.current = null;
    setLines((ls) => ls.map((l) => (l.id === c.lineId ? { ...l, productId: nuevo.id } : l)));
  }, [db.products]);
  // Si se cierra sin guardar, se descarta (este efecto corre después del anterior).
  useEffect(() => {
    if (!creating) pending.current = null;
  }, [creating]);

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
  // Gravas: se cargan por bolsón (1.200 kg) al precio del bolsón; el sistema lo pasa a toneladas.
  const kOf = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    return p && stoneGroup(p) === "grava" ? bigBagKg(p) / 1000 : 1;
  };
  // Al abrir para corregir, se cargan los números del asiento tal como se habían escrito.
  useEffect(() => {
    if (!open || !edit) return;
    setDate(edit.date.slice(0, 10));
    setSupplier(edit.supplier);
    setRemito(edit.remito ?? "");
    setLines(
      edit.items.map((it) => {
        const k = kOf(it.productId ?? "");
        return {
          id: uid(),
          productId: it.productId ?? "",
          tons: Math.round((it.tons / k) * 10000) / 10000,
          price: Math.round(it.pricePerTon * k * 100) / 100,
        };
      }),
    );
    setCarrier(edit.carrier ?? "");
    const perTon = Math.round(edit.freightTons * edit.freightRate) === edit.freightTotal;
    setFMode(perTon ? "t" : "total");
    setFTons(edit.freightTons);
    setFValue(perTon ? edit.freightRate : edit.freightTotal);
    setUnload(edit.unloadCost);
    setUnloadBy(edit.unloadBy ?? "");
    setUpdateCosts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit?.id]);
  const valid = lines.filter((l) => l.productId && l.tons > 0);
  const tons = valid.reduce((a, l) => a + l.tons * kOf(l.productId), 0);
  const merch = valid.reduce((a, l) => a + l.tons * l.price, 0);
  const freightTons = fTons || tons;
  const freightTotal = fMode === "t" ? Math.round(freightTons * fValue) : fValue;
  // La descarga puede cobrarla el mismo transporte (se paga junto con el flete) u otra persona.
  const unloader = unload > 0 ? unloadBy.trim() : "";
  const sameUnloader = !!unloader && unloader.toLowerCase() === carrier.trim().toLowerCase();
  const carrierTotal = freightTotal + (sameUnloader ? unload : 0);
  const ok = supplier.trim().length > 1 && valid.length > 0;

  const save = () => {
    const items: PurchaseItem[] = valid.map((l) => ({
      productId: l.productId,
      name: products.find((p) => p.id === l.productId)?.name ?? "",
      tons: l.tons * kOf(l.productId),
      pricePerTon: l.price / kOf(l.productId),
      total: Math.round(l.tons * l.price),
    }));
    const iso = edit
      ? date === edit.date.slice(0, 10)
        ? edit.date
        : date + "T12:00:00.000Z"
      : date === todayISO()
        ? new Date().toISOString()
        : date + "T12:00:00.000Z";
    const reset = () => {
      setSupplier("");
      setRemito("");
      setLines([blankLine()]);
      setCarrier("");
      setFTons(0);
      setFValue(0);
      setUnload(0);
      setUnloadBy("");
      setPayU(boxBlank());
      setPayS(boxBlank());
      setPayC(boxBlank());
      setDate(todayISO());
      onClose();
    };
    if (edit) {
      updatePurchase(
        edit.id,
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
          unloadBy: unloader || undefined,
          unloadDue: unloader && !sameUnloader ? edit.unloadDue : undefined,
          payDue: edit.payDue,
          freightDue: carrier.trim() ? edit.freightDue : undefined,
        },
        updateCosts,
      );
      return reset();
    }
    const remindDate = (v: PayBox, total: number) =>
      total - paidOf(v, total) > 0 && v.remind > 0 ? addDays(date, v.remind) : undefined;
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
        payDue: remindDate(payS, Math.round(merch)),
        freightDue: carrier.trim() ? remindDate(payC, carrierTotal) : undefined,
        unloadBy: unloader || undefined,
        unloadDue: unloader && !sameUnloader ? remindDate(payU, unload) : undefined,
      },
      updateCosts,
    );
    const payAll = (b: PayBox, party: string, kind: "cantera" | "transporte", total: number) => {
      if (!b.on || !party) return;
      const am = amountsOf(b, total);
      b.lines.forEach((l, k) => pay(l, party, kind, am[k] ?? 0));
    };
    const pay = (v: PayNow, party: string, kind: "cantera" | "transporte", amount: number) => {
      if (amount <= 0) return;
      addSupplierPayment(
        {
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
        },
        chequeOf(v),
      );
    };
    payAll(payS, supplier.trim(), "cantera", Math.round(merch));
    payAll(payC, carrier.trim(), "transporte", carrierTotal);
    if (unloader && !sameUnloader) payAll(payU, unloader, "transporte", unload);
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={edit ? "Editar descarga" : "Nueva descarga"}
      subtitle={
        edit
          ? "Al guardar se corrige el stock por la diferencia, los costos y lo que se le debe al proveedor"
          : "Al guardar se suma el stock, se actualizan los costos y queda asentado lo que se debe"
      }
      wide
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!ok} onClick={save}>
            {edit ? "Guardar cambios" : "Asentar descarga"}
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
              const k = kOf(l.productId);
              const unit =
                k !== 1 ? "bolsones" : !p || p.unit === "kg" ? "t" : p.unit === "m2" ? "m²" : "u";
              const lastT = l.productId ? lastPrice(l.productId) : null;
              const last = lastT ? { ...lastT, price: Math.round(lastT.price * k) } : null;
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.2fr)_150px_minmax(150px,1fr)_130px_auto]"
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
                      onChange={(e) =>
                        e.target.value === "__nuevo"
                          ? startCreate(l.id)
                          : upd(l.id, { productId: e.target.value })
                      }
                    >
                      <option value="">Elegir producto…</option>
                      <option value="__nuevo">+ Crear producto nuevo…</option>
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
                    label={
                      k !== 1
                        ? `Precio bolsón ${(k * 1000).toLocaleString("es-AR")} kg`
                        : `Precio por ${unit === "t" ? "tonelada" : unit}`
                    }
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
                  {k !== 1 && (
                    <div className="col-span-full -mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      o cargá el precio por tonelada
                      <span className="w-40">
                        <NumberInput
                          value={Math.round((l.price / k) * 100) / 100}
                          onChange={(v) => upd(l.id, { price: Math.round(v * k * 100) / 100 })}
                          prefix="$"
                          suffix="/ t"
                        />
                      </span>
                      y el del bolsón se completa solo
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button className={btn.ghost} onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus className="h-3.5 w-3.5" /> Otro material del mismo camión
            </button>
            <button
              className={btn.ghost}
              onClick={() => {
                const empty = lines.find((l) => !l.productId);
                if (empty) return startCreate(empty.id);
                const nl = blankLine();
                setLines((ls) => [...ls, nl]);
                startCreate(nl.id);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Producto nuevo
            </button>
            <p className="text-xs text-muted-foreground">
              {num(tons, 2)} t en total · mercadería <b className="text-foreground">{ars(merch)}</b>
            </p>
          </div>
          {edit ? (
            <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
              Los pagos ya cargados no se tocan acá: se ven, se agregan o se borran desde la cuenta
              del proveedor. El saldo se recalcula solo con los números nuevos.
            </p>
          ) : (
            <PayNowBox
              v={payS}
              set={setPayS}
              total={Math.round(merch)}
              who="a la cantera"
              date={date}
              allowGasoil={false}
            />
          )}
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
            {unload > 0 && (
              <Field
                label="Quién cobra la descarga"
                className="col-span-2"
                hint="Vacío = personal propio, no queda deuda"
                help="Si la descarga la cobra el mismo transporte u otra persona, escribí el nombre: queda en su cuenta y la podés pagar ahora, en partes o con cheques. Si la hizo tu gente, dejalo vacío."
              >
                <div className="flex gap-1.5">
                  <Input
                    list="transportes"
                    value={unloadBy}
                    onChange={(e) => setUnloadBy(e.target.value)}
                    placeholder="Ej: el mismo transporte"
                  />
                  {carrier.trim() && !sameUnloader && (
                    <button
                      type="button"
                      className={`${btn.ghost} shrink-0`}
                      onClick={() => setUnloadBy(carrier.trim())}
                    >
                      El transporte
                    </button>
                  )}
                </div>
              </Field>
            )}
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
          {!edit && carrier.trim() && carrierTotal > 0 && (
            <PayNowBox
              v={payC}
              set={setPayC}
              total={carrierTotal}
              who={sameUnloader ? "al transporte (flete + descarga)" : "al transporte"}
              date={date}
              allowGasoil
            />
          )}
          {!edit && unloader && !sameUnloader && (
            <PayNowBox
              v={payU}
              set={setPayU}
              total={unload}
              who={`a ${unloader} por la descarga`}
              date={date}
              allowGasoil
            />
          )}
          {!edit && !(carrier.trim() && carrierTotal > 0) && !(unloader && !sameUnloader) && (
            <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
              Cargá el transporte y la tarifa (y quién cobra la descarga, si no es tu gente) para
              asentar acá mismo el pago: total, una parte, o con uno o varios cheques.
            </p>
          )}
        </div>

        <Toggle
          checked={updateCosts}
          onChange={setUpdateCosts}
          label="Actualizar costos y precios de los productos con esta descarga"
        />
      </div>
      <ProductEditor open={creating} onClose={() => setCreating(false)} product={null} />
    </Modal>
  );
}

/** Cuenta de una cantera o transporte: debe, haber y saldo, como en la planilla. */
function Ledger({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { db, addSupplierPayment, removeSupplierPayment, setSupplierReminder } = useStore();
  const [v, setV] = useState<PayNow>(payBlank);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  if (!account) return null;
  const mine = (party: string | undefined) =>
    !!party && party.trim().toLowerCase() === account.party.toLowerCase();
  const rows = [
    ...db.purchases.flatMap((p) => {
      const row = (id: string, detail: string, debe: number) => ({
        id,
        date: p.date,
        detail,
        debe,
        haber: 0,
        payId: "",
      });
      if (account.kind === "cantera")
        return mine(p.supplier)
          ? [
              row(
                p.id,
                `${p.items.map((i) => `${i.name} ${num(i.tons, 2)}`).join(", ")}${p.remito ? ` · Rto ${p.remito}` : ""}`,
                p.items.reduce((a, i) => a + i.total, 0),
              ),
            ]
          : [];
      return [
        ...(mine(p.carrier) && p.freightTotal > 0
          ? [
              row(
                p.id,
                `Flete ${p.supplier}${p.freightTons ? ` · ${num(p.freightTons, 2)} t` : ""}`,
                p.freightTotal,
              ),
            ]
          : []),
        ...(mine(p.unloadBy) && p.unloadCost > 0
          ? [row(p.id + "-d", `Descarga ${p.supplier}`, p.unloadCost)]
          : []),
      ];
    }),
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
    addSupplierPayment(
      {
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
      },
      chequeOf(v),
    );
    setAmount(0);
    setV(payBlank());
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={account.party}
      subtitle={`${account.kind === "cantera" ? "Cantera" : "Transporte o descarga"} · ${account.saldo > 0 ? `se le debe ${ars(account.saldo)}` : account.saldo < 0 ? `saldo a favor del corralón ${ars(-account.saldo)}` : "al día"}`}
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

        {account.saldo > 0 && (
          <div className="on-surface flex flex-wrap items-center gap-2 rounded-3xl bg-surface p-4 text-xs">
            <span className="font-semibold">Avisarme para pagar el saldo el</span>
            <span className="w-40">
              <Input
                type="date"
                value={account.remind ?? ""}
                onChange={(e) =>
                  setSupplierReminder(account.kind, account.party, e.target.value || undefined)
                }
              />
            </span>
            {[7, 15, 30, 60].map((d) => (
              <button
                key={d}
                type="button"
                className={btn.ghost}
                onClick={() =>
                  setSupplierReminder(account.kind, account.party, addDays(todayISO(), d))
                }
              >
                {d} d
              </button>
            ))}
            {account.remind ? (
              <button
                type="button"
                className={btn.ghost}
                onClick={() => setSupplierReminder(account.kind, account.party)}
              >
                Quitar aviso
              </button>
            ) : (
              <span className="text-muted-foreground">Sin aviso cargado</span>
            )}
          </div>
        )}

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
            set={(p) => setV((x) => ({ ...x, ...p }))}
            allowGasoil={account.kind === "transporte"}
            onAmount={setAmount}
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
