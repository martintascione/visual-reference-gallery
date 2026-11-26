import { FELIX_METHOD } from "@/lib/banks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { reportError } from "./errors";
import type {
  Bank,
  Cheque,
  ChequeStatus,
  Client,
  Closure,
  DB,
  Due,
  Expense,
  Movement,
  Purchase,
  SupplierPayment,
  Payment,
  PaymentMethod,
  Product,
  Quote,
  Sale,
  Settings,
  StockMove,
  SupplierCheque,
  Stockpile,
  StockpilePayment,
  StockpileWithdrawal,
} from "./types";
import { emptyDB } from "./seed";
import { demoDB } from "./demo-seed";

/** Modo demo: datos de ejemplo en memoria, sin Supabase (para previsualizar y probar). */
export const DEMO = (import.meta.env as Record<string, string | undefined>)["VITE_DEMO"] === "1";
import { addDays, dayOf, todayISO, uid } from "./format";
import { stoneCalc } from "./pricing";
import { fromRow, supabase, toRow } from "./supabase";
import type { Session } from "@supabase/supabase-js";
import type { AssistantAction } from "./assistant";

// Persistencia en Supabase. Las pantallas usan el mismo useStore(): el estado vive en memoria
// y cada cambio se sincroniza con la base (se guardan solo las filas que cambiaron).

type Draft<T> = Omit<T, "id">;

type Actions = {
  upsertProduct: (p: Product) => void;
  /** Alta o actualización de varios productos en un solo guardado (importación desde el asistente). */
  upsertProducts: (ps: Product[]) => void;
  removeProduct: (id: string) => void;
  addStockMove: (m: Draft<StockMove>) => void;
  addSale: (s: Omit<Sale, "id" | "number">, cheque?: Draft<Cheque>) => Sale;
  /** Corrige una venta: deshace lo que generó y la vuelve a registrar con el mismo número. */
  updateSale: (id: string, s: Omit<Sale, "id" | "number">, cheque?: Draft<Cheque>) => void;
  /** Elimina una venta: devuelve el stock y borra sus movimientos, cuotas y cheque en cartera. */
  removeSale: (id: string) => void;
  setEditSale: (id?: string) => void;
  setDeliveryDone: (saleId: string, done: boolean) => void;
  setInvoicePending: (saleId: string, pending: boolean) => void;
  addQuote: (q: Omit<Quote, "id" | "number">) => Quote;
  updateQuote: (id: string, patch: Partial<Quote>) => void;
  removeQuote: (id: string) => void;
  /** Presupuesto que se está editando en Nueva venta. */
  setEditQuote: (id?: string) => void;
  upsertClient: (c: Client) => void;
  /** Deuda de un cliente con cronograma propio: cada pago con su importe y fecha. */
  addDebtSchedule: (
    clientId: string,
    rows: { amount: number; date: string }[],
    concept?: string,
  ) => void;
  /** Carga una deuda en cuenta corriente sin venta (saldo anterior, fiado, etc.). */
  addDebt: (
    clientId: string,
    amount: number,
    dues: number,
    firstDue: string,
    concept?: string,
  ) => void;
  payDue: (
    dueId: string,
    amount: number,
    method: PaymentMethod,
    bank: Bank,
    gateway?: "Payway",
    extra?: {
      date?: string | undefined;
      via?: string | undefined;
      cheque?:
        | { number: string; bank: string; drawer: string; dueDate: string; echeq?: boolean }
        | undefined;
    },
  ) => void;
  /** Borra un cobro de cuota mal cargado: la cuota vuelve a quedar pendiente. */
  undoDuePayment: (ref: { movementId?: string; chequeId?: string }) => string | null;
  /** Borra un cliente sin deuda. Las ventas y presupuestos viejos quedan con su nombre. */
  removeClient: (id: string) => void;
  /** Une dos clientes (ej. duplicados): todo lo de "from" pasa a "to" y "from" se borra. */
  mergeClients: (fromId: string, toId: string) => void;
  /** Deja una cuenta con el saldo real de hoy (saldo inicial o ajuste). */
  adjustBalance: (account: Bank, real: number, note?: string) => void;
  addCheque: (c: Draft<Cheque>) => Cheque;
  /** Corrige los datos de un cheque. Devuelve un aviso si algo no se pudo cambiar. */
  updateCheque: (
    id: string,
    patch: Partial<
      Pick<
        Cheque,
        | "number"
        | "bank"
        | "drawer"
        | "dueDate"
        | "receivedDate"
        | "echeq"
        | "amount"
        | "givenTo"
        | "givenDate"
      >
    >,
  ) => string | null;
  /** Corrige un movimiento de caja o banco y lo que depende de él (cuota, gasto, pago, acopio). */
  updateMovement: (
    id: string,
    patch: { date?: string; concept?: string; amount?: number; account?: Bank },
  ) => string | null;
  /** Borra un movimiento y deshace lo que generó. Devuelve el motivo si no se puede. */
  removeMovement: (id: string) => string | null;
  /** Borra un cheque mal cargado. Devuelve el motivo si no se puede. */
  removeCheque: (id: string) => string | null;
  setChequeStatus: (id: string, status: ChequeStatus, depositBank?: Bank, givenTo?: string) => void;
  addExpense: (e: Draft<Expense>) => void;
  /** Asienta una descarga: suma stock, guarda el historial y (si se pide) actualiza costos y precios. */
  addPurchase: (p: Draft<Purchase>, updateCosts: boolean) => Purchase;
  /** Corrige una descarga ya asentada: ajusta el stock por la diferencia y (si se pide) los costos. */
  updatePurchase: (id: string, p: Draft<Purchase>, updateCosts: boolean) => void;
  /** Borra una descarga: descuenta el stock que había sumado y anula los pagos cargados en ese asiento. */
  removePurchase: (id: string) => void;
  /** Pago a cantera o transporte. Efectivo, transferencia y cheque salen de caja/banco; gasoil no. */
  addSupplierPayment: (p: Draft<SupplierPayment>, cheque?: SupplierCheque) => void;
  /** Cambia (o quita, sin fecha) el aviso para pagarle el saldo a una cantera o a un transporte. */
  setSupplierReminder: (kind: "cantera" | "transporte", party: string, date?: string) => void;
  removeSupplierPayment: (id: string) => void;
  addIncome: (date: string, concept: string, amount: number, account: Bank) => void;
  /** Acopios: el cliente paga a cuenta y retira mercadería contra ese saldo. */
  addStockpile: (s: Omit<Stockpile, "id" | "payments" | "withdrawals">) => string;
  /** Plata que sale de una cuenta sin ser gasto del negocio (ej. de la cuenta de El Tecla). */
  addOutflow: (date: string, concept: string, amount: number, account: Bank) => void;
  /** Felix le paga a Áridos parte del saldo: efectivo a la Caja, transferencia a un banco o un cheque a la cartera. */
  settleFelix: (p: {
    date: string;
    amount: number;
    how: "efectivo" | "transferencia" | "cheque" | "otro";
    to: Bank;
    note?: string | undefined;
    cheque?:
      { number: string; bank: string; drawer: string; dueDate: string; echeq: boolean } | undefined;
  }) => void;
  /** Pasa plata de una cuenta a otra (ej. Felix le transfiere a Áridos lo que cobró). */
  addTransfer: (date: string, from: Bank, to: Bank, amount: number, concept: string) => void;
  updateStockpile: (
    id: string,
    patch: Partial<Pick<Stockpile, "note" | "closed" | "items" | "pickupBy">>,
  ) => void;
  removeStockpile: (id: string) => void;
  addStockpilePayment: (id: string, pay: Omit<StockpilePayment, "id" | "movementId">) => void;
  removeStockpilePayment: (id: string, payId: string) => void;
  addStockpileWithdrawal: (id: string, w: Omit<StockpileWithdrawal, "id">) => void;
  removeStockpileWithdrawal: (id: string, wId: string) => void;
  settleMovement: (id: string, settled: boolean) => void;
  closeDay: (cashCounted: number, note?: string) => Closure;
  updateSettings: (patch: Partial<Settings>) => void;
  resetDemo: () => void;
  setPendingQuote: (id?: string) => void;
  setPendingAction: (a?: AssistantAction) => void;
};

type Ctx = {
  db: DB;
  pendingQuoteId: string | undefined;
  editQuoteId: string | undefined;
  editSaleId: string | undefined;
  pendingAction: AssistantAction | undefined;
  session: Session | null;
  ready: boolean;
  syncError: string | null;
} & Actions;

const StoreCtx = createContext<Ctx | null>(null);

type Collection =
  | "products"
  | "sales"
  | "quotes"
  | "clients"
  | "dues"
  | "cheques"
  | "movements"
  | "expenses"
  | "stockMoves"
  | "closures"
  | "purchases"
  | "supplierPayments"
  | "stockpiles";
const collections: { key: Collection; table: string }[] = [
  { key: "products", table: "products" },
  { key: "clients", table: "clients" },
  { key: "sales", table: "sales" },
  { key: "quotes", table: "quotes" },
  { key: "dues", table: "dues" },
  { key: "cheques", table: "cheques" },
  { key: "movements", table: "movements" },
  { key: "expenses", table: "expenses" },
  { key: "stockMoves", table: "stock_moves" },
  { key: "closures", table: "closures" },
  { key: "purchases", table: "purchases" },
  { key: "supplierPayments", table: "supplier_payments" },
  { key: "stockpiles", table: "stockpiles" },
];

async function loadAll(): Promise<DB> {
  const db = emptyDB();
  const results = await Promise.all(
    collections.map((c) =>
      supabase.from(c.table).select("*").order("updated_at", { ascending: false }),
    ),
  );
  results.forEach((r, i) => {
    if (r.error) throw r.error;
    const c = collections[i]!;
    (db[c.key] as unknown[]) = (r.data ?? []).map((row) => fromRow(row as Record<string, unknown>));
  });
  // orden que esperan las pantallas: lo más nuevo primero
  db.sales.sort((a, b) => b.date.localeCompare(a.date));
  db.quotes.sort((a, b) => b.date.localeCompare(a.date));
  db.movements.sort((a, b) => b.date.localeCompare(a.date));
  db.expenses.sort((a, b) => b.date.localeCompare(a.date));
  db.stockMoves.sort((a, b) => b.date.localeCompare(a.date));
  db.cheques.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  db.closures.sort((a, b) => b.date.localeCompare(a.date));
  db.purchases.sort((a, b) => b.date.localeCompare(a.date));
  db.supplierPayments.sort((a, b) => b.date.localeCompare(a.date));
  db.stockpiles.sort((a, b) => b.date.localeCompare(a.date));
  const st = await supabase.from("settings").select("*").eq("id", "main").maybeSingle();
  if (st.error) throw st.error;
  if (st.data) {
    db.settings = { ...db.settings, ...(st.data.data as Settings) };
    // Medio "Otra: Felix" (cuenta corriente con El Tecla): se agrega si la configuración guardada no lo tiene.
    if (!db.settings.methods.some((m) => m.method === "felix"))
      db.settings.methods = [...db.settings.methods, FELIX_METHOD];
    db.counters = { ...db.counters, ...(st.data.counters as DB["counters"]) };
  } else {
    const ins = await supabase
      .from("settings")
      .insert({ id: "main", data: db.settings, counters: db.counters });
    if (ins.error) throw ins.error;
  }
  return db;
}

/** Mueve el stock por un retiro de acopio (sign -1 sale, 1 vuelve). */
function stockpileStock(d: DB, s: Stockpile, w: StockpileWithdrawal, sign: 1 | -1, why: string) {
  const p = d.products.find((x) => x.id === w.productId);
  if (!p) return;
  p.stock += sign * w.baseQty;
  d.stockMoves.unshift({
    id: uid(),
    date: sign < 0 ? w.date : new Date().toISOString(),
    productId: p.id,
    qty: sign * w.baseQty,
    reason: sign < 0 ? "venta" : "ajuste",
    note: `${why} · ${s.clientName}${w.place ? " · " + w.place : ""}`,
  });
}

/** Pagado, retirado y saldo a favor de un acopio. */
export function stockpileBalance(s: Stockpile) {
  const paid = s.payments.reduce((a, p) => a + p.amount, 0);
  const taken = s.withdrawals.reduce((a, w) => a + w.total, 0);
  return { paid, taken, saldo: paid - taken };
}

/** Suma (sign 1) o saca (sign -1) del stock lo que trajo una descarga. */
function purchaseStock(
  d: DB,
  pur: Purchase,
  sign: 1 | -1,
  move?: { reason: StockMove["reason"]; note: string; date: string },
) {
  for (const it of pur.items) {
    const p = d.products.find((x) => x.id === it.productId);
    if (!p || it.tons <= 0) continue;
    const qty = (p.unit === "kg" ? it.tons * 1000 : it.tons) * sign;
    p.stock += qty;
    if (move)
      d.stockMoves.unshift({
        id: uid(),
        date: move.date,
        productId: p.id,
        qty,
        reason: move.reason,
        note: move.note,
      });
  }
}

/** Lleva a los productos el precio del proveedor, el flete y la descarga de ese asiento. */
function purchaseCosts(d: DB, pur: Purchase) {
  const tons = pur.items.reduce((a, i) => a + i.tons, 0);
  const freightPerTon = tons > 0 ? pur.freightTotal / tons : 0;
  const unloadPerTon = tons > 0 ? pur.unloadCost / tons : 0;
  for (const it of pur.items) {
    const p = d.products.find((x) => x.id === it.productId);
    if (!p || it.tons <= 0 || it.pricePerTon <= 0) continue;
    if (p.category === "piedra" && p.stoneCost) {
      p.stoneCost = {
        ...p.stoneCost,
        purchasePerTon: it.pricePerTon,
        ...(pur.freightTotal > 0 ? { freightPerTon: Math.round(freightPerTon) } : {}),
        ...(pur.unloadCost > 0 ? { unloadPerTon: Math.round(unloadPerTon) } : {}),
      };
      const c = stoneCalc(p.stoneCost, p.bagKg ?? d.settings.bagKg);
      p.cost = c.costKg;
      p.price = c.priceKg;
      p.bagPrice = c.priceBag;
    } else {
      // Lajas, líquidos y unitarios: el precio es por unidad; se mantiene el mismo margen.
      const margin = p.cost > 0 ? p.price / p.cost : 1 + (d.settings.defaultMarginPct ?? 40) / 100;
      const fr = pur.freightTotal > 0 ? freightPerTon : (p.freight ?? 0);
      p.freight = fr || undefined;
      p.cost = Math.round(it.pricePerTon + fr + unloadPerTon);
      p.price = Math.round(p.cost * margin);
    }
  }
}

/** De dónde viene un movimiento de caja o banco, para corregir o deshacer todo junto. */
export function movementLink(d: DB, m: Movement) {
  const ref = m.refId;
  const sale = m.kind === "venta" && ref ? d.sales.find((x) => x.id === ref) : undefined;
  const due = ref ? d.dues.find((x) => x.id === ref) : undefined;
  const cheque = m.method === "cheque" && ref ? d.cheques.find((x) => x.id === ref) : undefined;
  const stockpile = ref ? (d.stockpiles ?? []).find((x) => x.id === ref) : undefined;
  const stockpilePay = stockpile?.payments.find((x) => x.movementId === m.id);
  const expense = ref ? d.expenses.find((x) => x.id === ref) : undefined;
  const supplierPay = expense
    ? d.supplierPayments.find((x) => x.expenseId === expense.id)
    : undefined;
  return { sale, due, cheque, stockpile, stockpilePay, expense, supplierPay };
}

/** Anula un pago a proveedor: saca el gasto y el movimiento, y devuelve o anula el cheque. */
function undoSupplierPayment(d: DB, pay: SupplierPayment) {
  if (pay.expenseId) {
    d.expenses = d.expenses.filter((e) => e.id !== pay.expenseId);
    d.movements = d.movements.filter((m) => m.refId !== pay.expenseId);
  }
  // El cheque propio se anula; el de un cliente vuelve a la cartera.
  const ch = pay.chequeId ? d.cheques.find((c) => c.id === pay.chequeId) : undefined;
  if (ch?.own) d.cheques = d.cheques.filter((c) => c.id !== ch.id);
  else if (ch) {
    ch.status = "cartera";
    ch.givenTo = undefined;
    ch.givenDate = undefined;
  }
  d.supplierPayments = d.supplierPayments.filter((x) => x.id !== pay.id);
}

/** Registra todo lo que genera una venta: baja de stock, movimientos de caja/banco, cheque y cuotas. */
/** Productos de una venta con el precio final por unidad (bonificaciones e IVA incluidos), para el acopio. */
export function saleStockpileItems(d: DB, sale: Sale): NonNullable<Stockpile["items"]> {
  const k = (1 - (sale.discountPct ?? 0) / 100) * (sale.withIva ? 1 + d.settings.ivaPct / 100 : 1);
  return sale.items.map((i) => ({
    productId: i.productId,
    name: i.name,
    qty: i.qty,
    unit: i.unit,
    unitPrice: Math.round((i.qty ? i.subtotal / i.qty : i.unitPrice) * k),
  }));
}

const itemsValue = (items: NonNullable<Stockpile["items"]>) =>
  items.reduce((a, i) => a + Math.round(i.unitPrice * i.qty), 0);

/** Crea, actualiza o borra el acopio que sale de una venta "queda en acopio". */
function syncSaleStockpile(d: DB, sale: Sale | null, old?: Sale) {
  d.stockpiles = d.stockpiles ?? [];
  const id = sale?.id ?? old?.id;
  const sp = d.stockpiles.find((x) => x.saleId === id);
  if (!sale?.stockpileUntil) {
    if (sp) {
      // Lo retirado vuelve al stock: la venta (si sigue) descuenta todo de una.
      for (const w of sp.withdrawals) stockpileStock(d, sp, w, 1, "Acopio de venta quitado");
      d.stockpiles = d.stockpiles.filter((x) => x !== sp);
    }
    return;
  }
  const items = saleStockpileItems(d, sale);
  const amount = itemsValue(items);
  if (!sp) {
    d.stockpiles.unshift({
      id: uid(),
      clientId: sale.clientId,
      clientName: sale.clientName,
      date: sale.date,
      note: `Venta #${sale.number}`,
      saleId: sale.id,
      pickupBy: sale.stockpileUntil,
      withIva: sale.withIva || undefined,
      items,
      payments: [
        {
          id: uid(),
          date: sale.date,
          amount,
          method: "venta",
          account: "Caja",
          detail: `Venta #${sale.number}`,
        },
      ],
      withdrawals: [],
    });
    return;
  }
  sp.pickupBy = sale.stockpileUntil;
  sp.clientId = sale.clientId;
  sp.clientName = sale.clientName;
  const pay = sp.payments.find((x) => x.method === "venta");
  if (pay) pay.amount = amount;
  // Si nadie tocó los productos del acopio, siguen a la venta.
  const prev = old ? JSON.stringify(saleStockpileItems(d, old)) : "";
  if (!sp.withdrawals.length && JSON.stringify(sp.items ?? []) === prev) sp.items = items;
}

function applySale(d: DB, sale: Sale, chequeDraft?: Draft<Cheque>, prevMoves: Movement[] = []) {
  // En acopio el stock no sale con la venta: sale con cada retiro.
  for (const it of sale.stockpileUntil ? [] : sale.items) {
    const p = d.products.find((x) => x.id === it.productId);
    if (p) {
      p.stock -= it.baseQty;
      d.stockMoves.unshift({
        id: uid(),
        date: sale.date,
        productId: p.id,
        qty: -it.baseQty,
        reason: "venta",
        note: `Venta #${sale.number}`,
      });
    }
  }
  for (const pay of sale.payments) {
    if (pay.method === "cta_cte") {
      if (!sale.clientId) continue;
      const n = Math.max(1, pay.dues ?? 1);
      const base = Math.floor(pay.amount / n);
      for (let i = 1; i <= n; i++)
        d.dues.push({
          id: uid(),
          clientId: sale.clientId,
          saleId: sale.id,
          n: i,
          of: n,
          dueDate: addDays(dayOf(sale.date), 30 * i),
          amount: i === n ? pay.amount - base * (n - 1) : base,
          paid: 0,
        });
      continue;
    }
    if (pay.method === "cheque") {
      if (chequeDraft) {
        const ch: Cheque = {
          receivedDate: dayOf(sale.date),
          ...chequeDraft,
          id: uid(),
          saleId: sale.id,
          amount: pay.amount,
        };
        d.cheques.unshift(ch);
        pay.chequeId = ch.id;
      }
      continue;
    }
    const cfg =
      d.settings.methods.find(
        (m) =>
          m.method === pay.method &&
          m.bank === pay.bank &&
          (m.gateway ?? "") === (pay.gateway ?? ""),
      ) ?? d.settings.methods.find((m) => m.method === pay.method);
    // Al editar: si ese cobro ya estaba acreditado o en un cierre, se mantiene así.
    const prev = prevMoves.find(
      (m) =>
        m.method === pay.method &&
        m.account === pay.bank &&
        (m.gateway ?? "") === (pay.gateway ?? ""),
    );
    d.movements.unshift({
      id: uid(),
      date: sale.date,
      kind: "venta",
      account: pay.bank,
      amount: pay.amount,
      concept: `Venta #${sale.number} · ${sale.clientName}`,
      method: pay.method,
      via: pay.method === "felix" ? pay.via : undefined,
      gateway: pay.gateway,
      feePct: cfg?.feePct ?? 0,
      settleDays: cfg?.settleDays ?? 0,
      settled: prev?.settled ?? !pay.gateway,
      refId: sale.id,
      closureId: prev?.closureId ?? sale.closureId,
    });
  }
}

/** Deshace lo que generó una venta. Los cobros de cuotas ya registrados y los cheques ya movidos no se tocan. */
function reverseSale(d: DB, sale: Sale) {
  for (const it of sale.stockpileUntil ? [] : sale.items) {
    const p = d.products.find((x) => x.id === it.productId);
    if (p) p.stock += it.baseQty;
    const k = d.stockMoves.findIndex(
      (m) =>
        m.productId === it.productId && m.reason === "venta" && m.note === `Venta #${sale.number}`,
    );
    if (k >= 0) d.stockMoves.splice(k, 1);
  }
  d.movements = d.movements.filter((m) => !(m.refId === sale.id && m.kind === "venta"));
  d.dues = d.dues.filter((x) => x.saleId !== sale.id);
  d.cheques = d.cheques.filter((c) => !(c.saleId === sale.id && c.status === "cartera"));
}

/** Por qué una venta no se puede editar (cuotas cobradas o cheque ya depositado/endosado). */
export function saleEditBlock(db: DB, sale: Sale): string | undefined {
  if (db.dues.some((x) => x.saleId === sale.id && x.paid > 0))
    return "Tiene cuotas de cuenta corriente ya cobradas.";
  const ch = db.cheques.find((c) => c.saleId === sale.id && c.status !== "cartera");
  if (ch) return `El cheque N° ${ch.number} ya está ${ch.status}.`;
  return undefined;
}

/** Guarda en la base solo lo que cambió entre dos estados. */
/** Qué colecciones cambiaron entre dos estados (para el registro de errores). */
function changedCollections(prev: DB, next: DB) {
  return (Object.keys(next) as (keyof DB)[]).filter((k) => prev[k] !== next[k]).join(", ");
}

async function persistDiff(prev: DB, next: DB) {
  const jobs: PromiseLike<{ error: unknown }>[] = [];
  for (const c of collections) {
    const before = new Map((prev[c.key] as { id: string }[]).map((x) => [x.id, x]));
    const after = next[c.key] as { id: string }[];
    const upserts: Record<string, unknown>[] = [];
    for (const row of after) {
      const old = before.get(row.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(row))
        upserts.push(toRow(row as Record<string, unknown>));
      before.delete(row.id);
    }
    const removed = [...before.keys()];
    if (upserts.length) jobs.push(supabase.from(c.table).upsert(upserts));
    if (removed.length) jobs.push(supabase.from(c.table).delete().in("id", removed));
  }
  if (
    JSON.stringify(prev.settings) !== JSON.stringify(next.settings) ||
    JSON.stringify(prev.counters) !== JSON.stringify(next.counters)
  )
    jobs.push(
      supabase
        .from("settings")
        .upsert({ id: "main", data: next.settings, counters: next.counters }),
    );
  const res = await Promise.all(jobs);
  const failed = res.find((r) => r.error);
  if (failed) throw failed.error;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDbState] = useState<DB>(() => emptyDB());
  const [pendingQuoteId, setPendingQuote] = useState<string | undefined>();
  const [editQuoteId, setEditQuote] = useState<string | undefined>();
  const [editSaleId, setEditSale] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<AssistantAction | undefined>();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Sesión
  useEffect(() => {
    if (DEMO) {
      setSession({ user: { email: "demo@aridospetreos.com" } } as unknown as Session);
      setDbState(demoDB());
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Carga inicial cuando hay sesión
  useEffect(() => {
    if (DEMO) return;
    if (!session) {
      setReady(false);
      return;
    }
    let alive = true;
    loadAll()
      .then((d) => {
        if (!alive) return;
        setDbState(d);
        setReady(true);
      })
      .catch((e: Error) => {
        if (alive) setSyncError(`No se pudo cargar la base: ${e.message}`);
        reportError("base", e, { op: "cargar" });
      });
    return () => {
      alive = false;
    };
  }, [session]);

  // Cada cambio: se aplica en memoria al instante y se guarda en la base en orden.
  const mutate = useCallback((fn: (d: DB) => DB) => {
    const prev = dbRef.current;
    const next = fn(structuredClone(prev));
    dbRef.current = next;
    setDbState(next);
    if (DEMO) return;
    queue.current = queue.current
      .then(() => persistDiff(prev, next))
      .then(() => setSyncError(null))
      .catch((e: Error) => {
        setSyncError(`No se pudo guardar: ${e.message}. Revisá la conexión.`);
        reportError("base", e, { op: "guardar", cambios: changedCollections(prev, next) });
      });
  }, []);

  const methodCfg = (d: DB, p: Payment) =>
    d.settings.methods.find(
      (m) => m.method === p.method && m.bank === p.bank && (m.gateway ?? "") === (p.gateway ?? ""),
    ) ?? d.settings.methods.find((m) => m.method === p.method);

  const actions: Actions = useMemo(
    () => ({
      upsertProduct: (p) =>
        mutate((d) => {
          const i = d.products.findIndex((x) => x.id === p.id);
          if (i >= 0) d.products[i] = p;
          else d.products.push(p);
          return d;
        }),
      upsertProducts: (ps) =>
        mutate((d) => {
          for (const p of ps) {
            const i = d.products.findIndex((x) => x.id === p.id);
            if (i >= 0) d.products[i] = p;
            else d.products.push(p);
          }
          return d;
        }),
      removeProduct: (id) =>
        mutate((d) => {
          const p = d.products.find((x) => x.id === id);
          if (p) p.active = false;
          return d;
        }),
      addStockMove: (m) =>
        mutate((d) => {
          const p = d.products.find((x) => x.id === m.productId);
          if (!p) return d;
          p.stock += m.qty;
          d.stockMoves.unshift({ ...m, id: uid() });
          return d;
        }),
      addSale: (draft, chequeDraft) => {
        const sale: Sale = { ...draft, id: uid(), number: 0 };
        mutate((d) => {
          d.counters.sale += 1;
          sale.number = d.counters.sale;
          applySale(d, sale, chequeDraft);
          syncSaleStockpile(d, sale);
          if (sale.fromQuoteId) {
            const q = d.quotes.find((x) => x.id === sale.fromQuoteId);
            if (q) q.status = "aceptado";
          }
          d.sales.unshift(sale);
          return d;
        });
        return sale;
      },
      updateSale: (id, draft, chequeDraft) =>
        mutate((d) => {
          const i = d.sales.findIndex((x) => x.id === id);
          const old = d.sales[i];
          if (!old) return d;
          const prevMoves = d.movements.filter((m) => m.refId === old.id);
          reverseSale(d, old);
          const sale: Sale = {
            ...draft,
            id: old.id,
            number: old.number,
            date: old.date,
            closureId: old.closureId,
            fromQuoteId: old.fromQuoteId,
          };
          applySale(d, sale, chequeDraft, prevMoves);
          syncSaleStockpile(d, sale, old);
          d.sales[i] = sale;
          return d;
        }),
      removeSale: (id) =>
        mutate((d) => {
          const sale = d.sales.find((x) => x.id === id);
          if (!sale) return d;
          reverseSale(d, sale);
          syncSaleStockpile(d, null, sale);
          if (sale.fromQuoteId) {
            const q = d.quotes.find((x) => x.id === sale.fromQuoteId);
            if (q && q.status === "aceptado") q.status = "enviado";
          }
          d.sales = d.sales.filter((x) => x.id !== id);
          return d;
        }),
      setEditSale: (id) => setEditSale(id),
      setInvoicePending: (saleId, pending) =>
        mutate((d) => {
          const s = d.sales.find((x) => x.id === saleId);
          if (s) s.invoicePending = pending || undefined;
          return d;
        }),
      setDeliveryDone: (saleId, done) =>
        mutate((d) => {
          const s = d.sales.find((x) => x.id === saleId);
          if (s?.delivery) s.delivery.done = done;
          return d;
        }),
      addQuote: (draft) => {
        const q: Quote = { ...draft, id: uid(), number: 0 };
        mutate((d) => {
          d.counters.quote += 1;
          q.number = d.counters.quote;
          d.quotes.unshift(q);
          return d;
        });
        return q;
      },
      updateQuote: (id, patch) =>
        mutate((d) => {
          const q = d.quotes.find((x) => x.id === id);
          if (q) Object.assign(q, patch);
          return d;
        }),
      removeQuote: (id) =>
        mutate((d) => {
          d.quotes = d.quotes.filter((x) => x.id !== id);
          return d;
        }),
      addDebt: (clientId, amount, dues, firstDue, concept) =>
        mutate((d) => {
          const n = Math.max(1, Math.round(dues));
          const base = Math.floor(amount / n);
          const group = "cc" + uid();
          for (let i = 1; i <= n; i++)
            d.dues.push({
              id: uid(),
              clientId,
              saleId: group,
              n: i,
              of: n,
              dueDate: addDays(firstDue, 30 * (i - 1)),
              amount: i === n ? amount - base * (n - 1) : base,
              paid: 0,
              concept: concept || undefined,
            });
          return d;
        }),
      addDebtSchedule: (clientId, rows, concept) =>
        mutate((d) => {
          const list = rows.filter((r) => r.amount > 0);
          const group = "cc" + uid();
          list.forEach((r, k) =>
            d.dues.push({
              id: uid(),
              clientId,
              saleId: group,
              n: k + 1,
              of: list.length,
              dueDate: r.date,
              amount: Math.round(r.amount),
              paid: 0,
              concept: concept || undefined,
            }),
          );
          return d;
        }),
      upsertClient: (c) =>
        mutate((d) => {
          const i = d.clients.findIndex((x) => x.id === c.id);
          if (i >= 0) d.clients[i] = c;
          else d.clients.push(c);
          return d;
        }),
      payDue: (dueId, amount, method, bank, gateway, extra) =>
        mutate((d) => {
          const due = d.dues.find((x) => x.id === dueId);
          if (!due) return d;
          due.paid = Math.min(due.amount, due.paid + amount);
          const client = d.clients.find((c) => c.id === due.clientId);
          const when = extra?.date ?? new Date().toISOString();
          // Cobro con cheque: queda en la cartera; la plata entra al banco cuando se deposita.
          if (method === "cheque" && extra?.cheque) {
            d.cheques.unshift({
              id: uid(),
              number: extra.cheque.number,
              bank: extra.cheque.bank,
              drawer: extra.cheque.drawer || client?.name || "",
              dueDate: extra.cheque.dueDate,
              amount,
              status: "cartera",
              clientId: due.clientId,
              clientName: client?.name ?? "",
              echeq: !!extra.cheque.echeq,
              receivedDate: when.slice(0, 10),
              dueId: due.id,
            });
            return d;
          }
          const cfg = methodCfg(d, { method, bank, gateway, amount });
          d.movements.unshift({
            id: uid(),
            date: when,
            kind: "cobro",
            account: bank,
            amount,
            concept: `Cobro cuota ${due.n}/${due.of} · ${client?.name ?? ""}`,
            via: method === "felix" ? extra?.via : undefined,
            method,
            gateway,
            feePct: cfg?.feePct ?? 0,
            settleDays: cfg?.settleDays ?? 0,
            settled: !gateway,
            refId: due.id,
          });
          return d;
        }),
      undoDuePayment: (ref) => {
        let err: string | null = null;
        mutate((d) => {
          if (ref.movementId) {
            const m = d.movements.find((x) => x.id === ref.movementId);
            const due = m ? d.dues.find((x) => x.id === m.refId) : undefined;
            if (!m || !due) return d;
            if (m.closureId) {
              err = "Ese cobro ya está en un cierre del día: no se puede borrar.";
              return d;
            }
            due.paid = Math.max(0, due.paid - m.amount);
            d.movements = d.movements.filter((x) => x.id !== m.id);
          }
          if (ref.chequeId) {
            const ch = d.cheques.find((x) => x.id === ref.chequeId);
            const due = ch ? d.dues.find((x) => x.id === ch.dueId) : undefined;
            if (!ch || !due) return d;
            if (ch.status !== "cartera") {
              err = "Ese cheque ya se depositó o se entregó: marcalo como rechazado desde Caja.";
              return d;
            }
            due.paid = Math.max(0, due.paid - ch.amount);
            d.cheques = d.cheques.filter((x) => x.id !== ch.id);
          }
          return d;
        });
        return err;
      },
      removeClient: (id) =>
        mutate((d) => {
          d.clients = d.clients.filter((c) => c.id !== id);
          d.dues = d.dues.filter((x) => x.clientId !== id);
          return d;
        }),
      mergeClients: (fromId, toId) =>
        mutate((d) => {
          const to = d.clients.find((c) => c.id === toId);
          const from = d.clients.find((c) => c.id === fromId);
          if (!to || !from || fromId === toId) return d;
          for (const s of d.sales)
            if (s.clientId === fromId) Object.assign(s, { clientId: toId, clientName: to.name });
          for (const q of d.quotes)
            if (q.clientId === fromId) Object.assign(q, { clientId: toId, clientName: to.name });
          for (const x of d.dues) if (x.clientId === fromId) x.clientId = toId;
          for (const c of d.cheques)
            if (c.clientId === fromId) Object.assign(c, { clientId: toId, clientName: to.name });
          for (const s of d.stockpiles ?? [])
            if (s.clientId === fromId) Object.assign(s, { clientId: toId, clientName: to.name });
          // Los datos que le falten al que queda se completan con los del duplicado.
          for (const k of [
            "phone",
            "email",
            "cuit",
            "address",
            "city",
            "dni",
            "ivaCategory",
          ] as const)
            if (!to[k] && from[k]) to[k] = from[k];
          d.clients = d.clients.filter((c) => c.id !== fromId);
          return d;
        }),
      adjustBalance: (account, real, note) =>
        mutate((d) => {
          const now = accountBalance(d, account);
          const diff = Math.round(real - now);
          if (!diff) return d;
          d.movements.unshift({
            id: uid(),
            date: new Date().toISOString(),
            kind: "ajuste",
            account,
            amount: diff,
            concept: note?.trim() || (now === 0 ? "Saldo inicial" : "Ajuste de saldo"),
            settled: true,
          });
          return d;
        }),
      addCheque: (c) => {
        const ch: Cheque = { receivedDate: todayISO(), ...c, id: uid() };
        mutate((d) => {
          d.cheques.unshift(ch);
          return d;
        });
        return ch;
      },
      updateCheque: (id, patch) => {
        let err: string | null = null;
        mutate((d) => {
          const ch = d.cheques.find((x) => x.id === id);
          if (!ch) return d;
          const p = { ...patch };
          if (p.amount !== undefined && p.amount !== ch.amount) {
            const sale = ch.saleId ? d.sales.find((x) => x.id === ch.saleId) : undefined;
            const pay = d.supplierPayments.find((x) => x.chequeId === ch.id);
            if (sale || pay) {
              err = sale
                ? `El importe es el cobro de la venta #${sale.number}: se cambia editando la venta.`
                : "El importe es el de un pago a proveedor: se cambia desde ese pago.";
              delete p.amount;
            } else {
              const diff = p.amount - ch.amount;
              const due = ch.dueId ? d.dues.find((x) => x.id === ch.dueId) : undefined;
              if (due) due.paid = Math.max(0, Math.min(due.amount, due.paid + diff));
              const m = d.movements.find((x) => x.refId === ch.id);
              if (m) m.amount = p.amount;
            }
          }
          // Poner a quién se entregó un cheque de la cartera lo pasa a "Entregado"; borrarlo lo devuelve.
          if ("givenTo" in p) {
            const to = p.givenTo?.trim();
            if (to && ch.status === "cartera" && !ch.own) {
              ch.status = "endosado";
              p.givenDate = p.givenDate || todayISO();
            } else if (
              !to &&
              ch.status === "endosado" &&
              !d.supplierPayments.some((x) => x.chequeId === ch.id)
            ) {
              ch.status = "cartera";
              p.givenDate = undefined;
            }
          }
          Object.assign(ch, p);
          return d;
        });
        return err;
      },
      updateMovement: (id, patch) => {
        let err: string | null = null;
        mutate((d) => {
          const m = d.movements.find((x) => x.id === id);
          if (!m) return d;
          const link = movementLink(d, m);
          if (link.sale) {
            err = `Es el cobro de la venta #${link.sale.number}: se cambia editando la venta.`;
            return d;
          }
          const sign = m.amount < 0 ? -1 : 1;
          const abs =
            patch.amount !== undefined ? Math.abs(Math.round(patch.amount)) : Math.abs(m.amount);
          const diff = abs - Math.abs(m.amount);
          if (link.cheque && diff) {
            err = "El monto es el del cheque: cambialo editando el cheque en Cheques.";
            return d;
          }
          if (link.due && diff)
            link.due.paid = Math.max(0, Math.min(link.due.amount, link.due.paid + diff));
          if (patch.date) m.date = patch.date;
          if (patch.concept !== undefined && patch.concept.trim()) m.concept = patch.concept.trim();
          if (patch.account) m.account = patch.account;
          m.amount = sign * abs;
          if (m.kind === "transferencia" && m.refId)
            for (const x of d.movements)
              if (x !== m && x.kind === "transferencia" && x.refId === m.refId) {
                x.amount = -sign * abs;
                if (patch.date) x.date = m.date;
                x.concept = m.concept;
              }
          if (link.cheque && patch.account) link.cheque.depositBank = patch.account;
          if (link.stockpilePay) {
            link.stockpilePay.amount = abs;
            link.stockpilePay.date = m.date;
            link.stockpilePay.account = m.account;
          }
          if (link.expense) {
            link.expense.amount = abs;
            link.expense.date = m.date;
            link.expense.account = m.account;
            link.expense.concept = m.concept;
          }
          if (link.supplierPay) {
            link.supplierPay.amount = abs;
            link.supplierPay.account = m.account;
          }
          return d;
        });
        return err;
      },
      removeMovement: (id) => {
        let err: string | null = null;
        mutate((d) => {
          const m = d.movements.find((x) => x.id === id);
          if (!m) return d;
          const link = movementLink(d, m);
          if (link.sale) {
            err = `Es el cobro de la venta #${link.sale.number}: se borra editando o borrando la venta.`;
            return d;
          }
          if (m.kind === "transferencia" && m.refId && link.cheque) {
            // Pago de Felix con cheque: se borra el cheque si sigue en la cartera.
            if (link.cheque.status !== "cartera") {
              err = `El cheque N° ${link.cheque.number} ya está ${link.cheque.status}: no se puede borrar este pago.`;
              return d;
            }
            const chId = link.cheque.id;
            d.cheques = d.cheques.filter((x) => x.id !== chId);
            d.movements = d.movements.filter((x) => x.id !== m.id);
            return d;
          }
          if (m.kind === "transferencia" && m.refId) {
            // Transferencia: se borran las dos patas.
            d.movements = d.movements.filter(
              (x) => !(x.kind === "transferencia" && x.refId === m.refId),
            );
            return d;
          }
          if (link.due) link.due.paid = Math.max(0, link.due.paid - Math.abs(m.amount));
          if (link.cheque) {
            // Depósito borrado: el cheque vuelve a la cartera.
            link.cheque.status = "cartera";
            link.cheque.depositBank = undefined;
          }
          if (link.stockpile && link.stockpilePay)
            link.stockpile.payments = link.stockpile.payments.filter(
              (x) => x !== link.stockpilePay,
            );
          if (link.supplierPay) undoSupplierPayment(d, link.supplierPay);
          else if (link.expense) d.expenses = d.expenses.filter((x) => x !== link.expense);
          d.movements = d.movements.filter((x) => x.id !== m.id);
          return d;
        });
        return err;
      },
      removeCheque: (id) => {
        let err: string | null = null;
        mutate((d) => {
          const ch = d.cheques.find((x) => x.id === id);
          if (!ch) return d;
          const sale = ch.saleId ? d.sales.find((x) => x.id === ch.saleId) : undefined;
          if (sale) {
            err = `Es el cobro de la venta #${sale.number}: se borra o cambia editando la venta.`;
            return d;
          }
          if (d.supplierPayments.some((x) => x.chequeId === ch.id)) {
            err = "Se usó para pagar a un proveedor: borrá ese pago desde Descargas.";
            return d;
          }
          const due = ch.dueId ? d.dues.find((x) => x.id === ch.dueId) : undefined;
          if (due && ch.status !== "rechazado") due.paid = Math.max(0, due.paid - ch.amount);
          d.movements = d.movements.filter((x) => x.refId !== ch.id);
          d.cheques = d.cheques.filter((x) => x.id !== ch.id);
          return d;
        });
        return err;
      },
      setChequeStatus: (id, status, depositBank, givenTo) =>
        mutate((d) => {
          const ch = d.cheques.find((x) => x.id === id);
          if (!ch) return d;
          ch.status = status;
          if (status === "endosado") {
            ch.givenTo = givenTo?.trim() || ch.givenTo;
            ch.givenDate = todayISO();
          }
          if (status === "depositado" && depositBank) {
            ch.depositBank = depositBank;
            d.movements.unshift({
              id: uid(),
              date: new Date().toISOString(),
              kind: "cobro",
              account: depositBank,
              amount: ch.amount,
              concept: `Depósito cheque ${ch.number} · ${ch.clientName}`,
              method: "cheque",
              feePct: 0,
              settleDays: 2,
              settled: false,
              refId: ch.id,
            });
          }
          if (status === "acreditado") {
            const m = d.movements.find((x) => x.refId === ch.id);
            if (m) m.settled = true;
          }
          if (status === "rechazado") {
            const m = d.movements.find((x) => x.refId === ch.id);
            if (m) d.movements = d.movements.filter((x) => x.id !== m.id);
            if (ch.clientId)
              d.dues.push({
                id: uid(),
                clientId: ch.clientId,
                saleId: ch.saleId ?? "",
                n: 1,
                of: 1,
                dueDate: todayISO(),
                amount: ch.amount,
                paid: 0,
              });
          }
          return d;
        }),
      addExpense: (e) =>
        mutate((d) => {
          const ex: Expense = { ...e, id: uid() };
          d.expenses.unshift(ex);
          d.movements.unshift({
            id: uid(),
            date: ex.date,
            kind:
              ex.type === "debito"
                ? "debito"
                : ex.type === "flete"
                  ? "flete"
                  : ex.type === "compra"
                    ? "compra"
                    : "gasto",
            account: ex.account,
            amount: -ex.amount,
            concept: ex.concept,
            method: ex.method,
            settled: true,
            refId: ex.id,
          });
          return d;
        }),
      addPurchase: (draft, updateCosts) => {
        const pur: Purchase = { ...draft, id: uid() };
        mutate((d) => {
          purchaseStock(d, pur, 1, {
            reason: "compra",
            note: `${pur.supplier}${pur.remito ? " · Rto " + pur.remito : ""}`,
            date: pur.date,
          });
          if (updateCosts) purchaseCosts(d, pur);
          d.purchases.unshift(pur);
          return d;
        });
        return pur;
      },
      updatePurchase: (id, draft, updateCosts) =>
        mutate((d) => {
          const i = d.purchases.findIndex((x) => x.id === id);
          const old = d.purchases[i];
          if (!old) return d;
          const pur: Purchase = { ...old, ...draft, id };
          // Stock: se saca lo que había sumado el asiento viejo y se suma lo nuevo;
          // en el historial de stock queda solo la diferencia.
          const before = new Map(d.products.map((p) => [p.id, p.stock]));
          purchaseStock(d, old, -1);
          purchaseStock(d, pur, 1);
          for (const p of d.products) {
            const diff = p.stock - (before.get(p.id) ?? 0);
            if (Math.abs(diff) > 1e-9)
              d.stockMoves.unshift({
                id: uid(),
                date: new Date().toISOString(),
                productId: p.id,
                qty: diff,
                reason: "ajuste",
                note: `Descarga editada · ${pur.supplier}`,
              });
          }
          if (updateCosts) purchaseCosts(d, pur);
          // Los pagos cargados en ese asiento siguen al proveedor si se le corrigió el nombre.
          for (const pay of d.supplierPayments)
            if (pay.purchaseId === id)
              pay.party =
                pay.kind === "cantera"
                  ? pur.supplier
                  : sameName(pay.party, old.carrier)
                    ? (pur.carrier ?? pay.party)
                    : sameName(pay.party, old.unloadBy)
                      ? (pur.unloadBy ?? pay.party)
                      : pay.party;
          d.purchases[i] = pur;
          d.purchases.sort((a, b) => b.date.localeCompare(a.date));
          return d;
        }),
      removePurchase: (id) =>
        mutate((d) => {
          const pur = d.purchases.find((x) => x.id === id);
          if (!pur) return d;
          purchaseStock(d, pur, -1, {
            reason: "ajuste",
            note: `Descarga eliminada · ${pur.supplier}`,
            date: new Date().toISOString(),
          });
          // Los pagos cargados en el mismo asiento se anulan con él.
          for (const pay of d.supplierPayments.filter((x) => x.purchaseId === id))
            undoSupplierPayment(d, pay);
          d.purchases = d.purchases.filter((x) => x.id !== id);
          return d;
        }),
      addSupplierPayment: (draft, cheque) =>
        mutate((d) => {
          const pay: SupplierPayment = { ...draft, id: uid() };
          // Cheque de un cliente que se entrega al proveedor: no sale plata de caja ni del banco.
          const third = pay.method === "cheque" && cheque?.kind === "tercero";
          if (pay.method === "cheque" && cheque) {
            const day = dayOf(pay.date);
            if (third) {
              let ch = cheque.id ? d.cheques.find((x) => x.id === cheque.id) : undefined;
              if (!ch) {
                ch = {
                  id: uid(),
                  number: cheque.number,
                  bank: cheque.bank,
                  drawer: cheque.drawer || cheque.from,
                  dueDate: cheque.dueDate,
                  amount: pay.amount,
                  status: "endosado",
                  clientName: cheque.from || cheque.drawer,
                  echeq: false,
                  receivedDate: day,
                };
                d.cheques.unshift(ch);
              }
              ch.status = "endosado";
              ch.givenTo = pay.party;
              ch.givenDate = day;
              pay.chequeId = ch.id;
              pay.dueDate = ch.dueDate;
              pay.account = undefined;
              pay.detail = `Cheque de terceros N° ${ch.number}${ch.clientName ? " · de " + ch.clientName : ""}`;
            } else {
              const ch: Cheque = {
                id: uid(),
                number: cheque.number,
                bank: pay.account ?? "BBVA",
                drawer: d.settings.businessName || "Propio",
                dueDate: cheque.dueDate,
                amount: pay.amount,
                status: "emitido",
                clientName: "",
                echeq: false,
                own: true,
                givenTo: pay.party,
                givenDate: day,
              };
              d.cheques.unshift(ch);
              pay.chequeId = ch.id;
            }
          }
          if (pay.method !== "gasoil" && !third) {
            // Sale de caja o banco. El cheque diferido se asienta en su fecha de cobro.
            const date =
              pay.method === "cheque" && pay.dueDate ? pay.dueDate + "T12:00:00.000Z" : pay.date;
            const ex: Expense = {
              id: uid(),
              date,
              type: pay.kind === "transporte" ? "flete" : "compra",
              concept: `Pago a ${pay.party}${pay.detail ? " · " + pay.detail : ""}`,
              amount: pay.amount,
              account: pay.account ?? "Caja",
              method: pay.method,
            };
            d.expenses.unshift(ex);
            d.movements.unshift({
              id: uid(),
              date,
              kind: ex.type === "flete" ? "flete" : "compra",
              account: ex.account,
              amount: -ex.amount,
              concept: ex.concept,
              method: ex.method,
              settled: true,
              refId: ex.id,
            });
            pay.expenseId = ex.id;
          }
          d.supplierPayments.unshift(pay);
          return d;
        }),
      setSupplierReminder: (kind, party, date) =>
        mutate((d) => {
          const k = party.trim().toLowerCase();
          const is = (n: string | undefined) => (n ?? "").trim().toLowerCase() === k;
          const mine = d.purchases.filter((p) =>
            kind === "cantera" ? is(p.supplier) : is(p.carrier) || is(p.unloadBy),
          );
          // El aviso es uno por proveedor: queda guardado en su descarga más reciente.
          const last = [...mine].sort((a, b) => b.date.localeCompare(a.date))[0];
          for (const p of mine) {
            const v = p === last ? date || undefined : undefined;
            if (kind === "cantera") p.payDue = v;
            else if (is(p.carrier)) p.freightDue = v;
            else p.unloadDue = v;
          }
          return d;
        }),
      removeSupplierPayment: (id) =>
        mutate((d) => {
          const pay = d.supplierPayments.find((x) => x.id === id);
          if (pay) undoSupplierPayment(d, pay);
          return d;
        }),
      addStockpile: (draft) => {
        const id = uid();
        mutate((d) => {
          d.stockpiles = [{ ...draft, id, payments: [], withdrawals: [] }, ...(d.stockpiles ?? [])];
          return d;
        });
        return id;
      },
      updateStockpile: (id, patch) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          if (s) Object.assign(s, patch);
          return d;
        }),
      removeStockpile: (id) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          // El acopio de una venta se quita editando o borrando la venta.
          if (!s || s.saleId) return d;
          for (const p of s.payments)
            d.movements = d.movements.filter((m) => m.id !== p.movementId);
          for (const w of s.withdrawals) stockpileStock(d, s, w, 1, "Acopio eliminado");
          d.stockpiles = d.stockpiles.filter((x) => x.id !== id);
          return d;
        }),
      addStockpilePayment: (id, pay) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          if (!s) return d;
          const mid = uid();
          d.movements.unshift({
            id: mid,
            date: pay.date,
            kind: "cobro",
            account: pay.method === "efectivo" ? "Caja" : pay.account,
            amount: pay.amount,
            concept: `Acopio · ${s.clientName}${pay.detail ? " · " + pay.detail : ""}`,
            method: pay.method === "venta" ? undefined : pay.method,
            settled: true,
            refId: s.id,
          });
          s.payments.push({ ...pay, id: uid(), movementId: mid });
          return d;
        }),
      removeStockpilePayment: (id, payId) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          const pay = s?.payments.find((x) => x.id === payId);
          if (!s || !pay) return d;
          d.movements = d.movements.filter((m) => m.id !== pay.movementId);
          s.payments = s.payments.filter((x) => x.id !== payId);
          return d;
        }),
      addStockpileWithdrawal: (id, w) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          if (!s) return d;
          const item = { ...w, id: uid() };
          s.withdrawals.push(item);
          stockpileStock(d, s, item, -1, "Retiro de acopio");
          return d;
        }),
      removeStockpileWithdrawal: (id, wId) =>
        mutate((d) => {
          const s = (d.stockpiles ?? []).find((x) => x.id === id);
          const w = s?.withdrawals.find((x) => x.id === wId);
          if (!s || !w) return d;
          stockpileStock(d, s, w, 1, "Retiro de acopio borrado");
          s.withdrawals = s.withdrawals.filter((x) => x.id !== wId);
          return d;
        }),
      settleFelix: (x) =>
        mutate((d) => {
          const a = Math.abs(Math.round(x.amount));
          const note = x.note?.trim() ? " · " + x.note.trim() : "";
          if (x.how === "cheque" && x.cheque) {
            // El cheque entra a la cartera de Áridos; el saldo con Felix baja ya.
            const ch: Cheque = {
              id: uid(),
              number: x.cheque.number,
              bank: x.cheque.bank,
              drawer: x.cheque.drawer || "Felix (El Tecla)",
              dueDate: x.cheque.dueDate,
              amount: a,
              status: "cartera",
              clientName: "Felix (El Tecla)",
              echeq: x.cheque.echeq,
              receivedDate: x.date.slice(0, 10),
            };
            d.cheques.unshift(ch);
            d.movements.unshift({
              id: uid(),
              date: x.date,
              kind: "transferencia",
              account: "Felix",
              amount: -a,
              concept: `Felix pagó con cheque N° ${ch.number} ${ch.bank}${note}`,
              method: "cheque",
              via: `Cheque · N° ${ch.number} · ${ch.bank} · vence ${ch.dueDate.split("-").reverse().join("/")}`,
              settled: true,
              refId: ch.id,
            });
            return d;
          }
          const pair = uid();
          const what =
            x.how === "efectivo"
              ? "Retiro de efectivo de Felix"
              : x.how === "transferencia"
                ? "Transferencia de Felix"
                : "Pago de Felix";
          for (const [account, amount] of [
            [x.to, a],
            ["Felix", -a],
          ] as [Bank, number][])
            d.movements.unshift({
              id: uid(),
              date: x.date,
              kind: "transferencia",
              account,
              amount,
              concept: `${what}${note}`,
              via:
                x.how === "efectivo"
                  ? "Efectivo"
                  : x.how === "transferencia"
                    ? "Transferencia"
                    : "Otro",
              settled: true,
              refId: pair,
            });
          return d;
        }),
      addTransfer: (date, from, to, amount, concept) =>
        mutate((d) => {
          const a = Math.abs(Math.round(amount));
          const pair = uid();
          d.movements.unshift(
            {
              id: uid(),
              date,
              kind: "transferencia",
              account: to,
              amount: a,
              concept,
              settled: true,
              refId: pair,
            },
            {
              id: uid(),
              date,
              kind: "transferencia",
              account: from,
              amount: -a,
              concept,
              settled: true,
              refId: pair,
            },
          );
          return d;
        }),
      addOutflow: (date, concept, amount, account) =>
        mutate((d) => {
          d.movements.unshift({
            id: uid(),
            date,
            kind: "egreso",
            account,
            amount: -Math.abs(amount),
            concept,
            settled: true,
          });
          return d;
        }),
      addIncome: (date, concept, amount, account) =>
        mutate((d) => {
          d.movements.unshift({
            id: uid(),
            date,
            kind: "ingreso",
            account,
            amount,
            concept,
            settled: true,
          });
          return d;
        }),
      settleMovement: (id, settled) =>
        mutate((d) => {
          const m = d.movements.find((x) => x.id === id);
          if (m) m.settled = settled;
          return d;
        }),
      closeDay: (cashCounted, note) => {
        const closure: Closure = {
          id: uid(),
          date: todayISO(),
          saleIds: [],
          byMethod: [],
          salesTotal: 0,
          costTotal: 0,
          feesTotal: 0,
          expensesTotal: 0,
          fixedShare: 0,
          profit: 0,
          cashExpected: 0,
          cashCounted,
          note,
        };
        mutate((d) => {
          const today = todayISO();
          const sales = d.sales.filter((s) => !s.closureId && dayOf(s.date) <= today);
          const groups = new Map<string, Closure["byMethod"][number]>();
          for (const s of sales) {
            s.closureId = closure.id;
            closure.saleIds.push(s.id);
            closure.salesTotal += s.total;
            closure.costTotal += s.cost;
            for (const p of s.payments) {
              const cfg = methodCfg(d, p);
              const label = cfg?.label ?? p.method;
              const bank =
                p.method === "cheque"
                  ? "Cartera de cheques"
                  : p.method === "cta_cte"
                    ? "Cuenta corriente"
                    : p.bank;
              const g = groups.get(label) ?? {
                label,
                bank,
                gross: 0,
                fee: 0,
                net: 0,
                settleDays: cfg?.settleDays ?? 0,
              };
              const fee = Math.round((p.amount * (cfg?.feePct ?? 0)) / 100);
              g.gross += p.amount;
              g.fee += fee;
              g.net += p.amount - fee;
              groups.set(label, g);
              closure.feesTotal += fee;
            }
          }
          closure.byMethod = [...groups.values()];
          const expenses = d.expenses.filter((e) => !e.closureId && dayOf(e.date) <= today);
          for (const e of expenses) {
            e.closureId = closure.id;
            closure.expensesTotal += e.amount;
          }
          for (const m of d.movements)
            if (!m.closureId && dayOf(m.date) <= today) m.closureId = closure.id;
          const monthly = d.settings.fixedExpenses.reduce((a, f) => a + f.amount, 0);
          closure.fixedShare = Math.round(monthly / 30);
          closure.profit =
            closure.salesTotal -
            closure.costTotal -
            closure.feesTotal -
            closure.expensesTotal -
            closure.fixedShare;
          const cashIn = sales
            .flatMap((s) => s.payments)
            .filter((p) => p.method === "efectivo")
            .reduce((a, p) => a + p.amount, 0);
          const cashOut = expenses
            .filter((e) => e.account === "Caja")
            .reduce((a, e) => a + e.amount, 0);
          const cashCobros = d.movements
            .filter((m) => m.closureId === closure.id && m.kind === "cobro" && m.account === "Caja")
            .reduce((a, m) => a + m.amount, 0);
          closure.cashExpected = cashIn + cashCobros - cashOut;
          d.closures.unshift(closure);
          return d;
        });
        return closure;
      },
      updateSettings: (patch) =>
        mutate((d) => {
          d.settings = { ...d.settings, ...patch };
          return d;
        }),
      resetDemo: () => {
        mutate(() => emptyDB());
      },
      setPendingQuote: (id) => setPendingQuote(id),
      setEditQuote: (id) => setEditQuote(id),
      setPendingAction: (a) => setPendingAction(a),
    }),
    [mutate],
  );

  const value = useMemo(
    () => ({
      db,
      pendingQuoteId,
      editQuoteId,
      editSaleId,
      pendingAction,
      session,
      ready,
      syncError,
      ...actions,
    }),
    [
      db,
      pendingQuoteId,
      editQuoteId,
      editSaleId,
      pendingAction,
      session,
      ready,
      syncError,
      actions,
    ],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore fuera de StoreProvider");
  return ctx;
}

// ---------- Selectores ----------

export function clientBalance(db: DB, clientId: string) {
  const dues = db.dues.filter((d) => d.clientId === clientId);
  const total = dues.reduce((a, d) => a + d.amount, 0);
  const paid = dues.reduce((a, d) => a + d.paid, 0);
  const today = todayISO();
  const overdue = dues
    .filter((d) => d.paid < d.amount && d.dueDate < today)
    .reduce((a, d) => a + d.amount - d.paid, 0);
  return { total, paid, balance: total - paid, overdue, dues };
}

export function accountBalance(db: DB, account: Bank) {
  return db.movements
    .filter((m) => m.account === account && m.settled !== false)
    .reduce((a, m) => a + m.amount, 0);
}

export function pendingSettlements(db: DB) {
  return db.movements.filter((m) => m.settled === false && m.amount > 0);
}

export function salesInRange(db: DB, from: string, to: string) {
  return db.sales.filter((s) => dayOf(s.date) >= from && dayOf(s.date) <= to);
}

export function expensesInRange(db: DB, from: string, to: string) {
  return db.expenses.filter((e) => dayOf(e.date) >= from && dayOf(e.date) <= to);
}

export function feeFor(db: DB, p: Payment) {
  const cfg = db.settings.methods.find(
    (m) => m.method === p.method && m.bank === p.bank && (m.gateway ?? "") === (p.gateway ?? ""),
  );
  return Math.round((p.amount * (cfg?.feePct ?? 0)) / 100);
}

export function periodProfit(db: DB, from: string, to: string) {
  const sales = salesInRange(db, from, to);
  const expenses = expensesInRange(db, from, to);
  const salesTotal = sales.reduce((a, s) => a + s.total, 0);
  const cost = sales.reduce((a, s) => a + s.cost, 0);
  const fees = sales.reduce((a, s) => a + s.payments.reduce((b, p) => b + feeFor(db, p), 0), 0);
  const exp = expenses.reduce((a, e) => a + e.amount, 0);
  const days = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1,
  );
  const fixed = Math.round(
    (db.settings.fixedExpenses.reduce((a, f) => a + f.amount, 0) / 30) * days,
  );
  return {
    sales,
    expenses,
    salesTotal,
    cost,
    fees,
    exp,
    fixed,
    profit: salesTotal - cost - fees - exp - fixed,
    days,
  };
}

const sameName = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Cuentas con canteras y transportes: lo comprado, lo pagado y el saldo de cada uno. */
export function supplierAccounts(db: DB) {
  type Entry = {
    /** Id del renglón: la descarga (o "id-d" para su descarga) o la cuota de una deuda. */
    id: string;
    purchaseId: string;
    date: string;
    due?: string | undefined;
    amount: number;
    /** Deuda cargada a mano a la que pertenece (sus cuotas comparten grupo). */
    group?: string | undefined;
    note?: string | undefined;
    /** Lo pagado de este renglón y lo que falta (después de repartir los pagos). */
    paid: number;
    rest: number;
  };
  type Acc = {
    party: string;
    kind: "cantera" | "transporte";
    debe: number;
    haber: number;
    last: string;
    entries: Entry[];
    /** Próximo vencimiento sin pagar (los pagos cubren primero lo que vence antes). */
    remind?: string | undefined;
    /** Lo que queda por pagar de ese vencimiento. */
    remindAmount?: number | undefined;
    /** Vencimientos con saldo pendiente, en orden. */
    pending: { due: string; amount: number }[];
  };
  const map = new Map<string, Acc>();
  const get = (party: string, kind: "cantera" | "transporte") => {
    const key = kind + "|" + party.trim().toLowerCase();
    let a = map.get(key);
    if (!a)
      map.set(
        key,
        (a = { party: party.trim(), kind, debe: 0, haber: 0, last: "", entries: [], pending: [] }),
      );
    return a;
  };
  const add = (a: Acc, e: Omit<Entry, "paid" | "rest">) => {
    a.debe += e.amount;
    if (e.date > a.last) a.last = e.date;
    a.entries.push({ ...e, date: e.date.slice(0, 10), paid: 0, rest: e.amount });
  };
  for (const p of db.purchases) {
    const group = p.debtOnly ? (p.debtGroup ?? p.id) : undefined;
    if (p.debtOnly !== "transporte")
      add(get(p.supplier, "cantera"), {
        id: p.id,
        purchaseId: p.id,
        date: p.date,
        amount: p.items.reduce((x, i) => x + i.total, 0),
        due: p.payDue,
        group,
        note: p.note,
      });
    if (p.carrier && p.freightTotal > 0)
      add(get(p.carrier, "transporte"), {
        id: p.id,
        purchaseId: p.id,
        date: p.date,
        amount: p.freightTotal,
        due: p.freightDue,
        group: p.debtOnly === "transporte" ? group : undefined,
        note: p.note,
      });
    // La descarga, si la cobra alguien de afuera, va a la cuenta de esa persona o transporte.
    if (p.unloadBy && p.unloadCost > 0)
      add(get(p.unloadBy, "transporte"), {
        id: p.id + "-d",
        purchaseId: p.id,
        date: p.date,
        amount: p.unloadCost,
        due: sameName(p.unloadBy, p.carrier) ? p.freightDue : p.unloadDue,
      });
  }
  const general = new Map<Acc, number>();
  for (const pay of db.supplierPayments) {
    const a = get(pay.party, pay.kind);
    a.haber += pay.amount;
    // Un pago hecho a una cuota (o al asentar una descarga) cubre primero ese renglón.
    let left = pay.amount;
    const target = pay.purchaseId
      ? (a.entries.find((e) => e.id === pay.purchaseId && e.rest > 0) ??
        a.entries.find((e) => e.purchaseId === pay.purchaseId && e.rest > 0))
      : undefined;
    if (target) {
      const c = Math.min(left, target.rest);
      target.paid += c;
      target.rest -= c;
      left -= c;
    }
    general.set(a, (general.get(a) ?? 0) + left);
  }
  for (const a of map.values()) {
    // El resto de los pagos cubre lo que vence antes.
    let left = general.get(a) ?? 0;
    const ordered = [...a.entries].sort((x, y) => (x.due ?? x.date).localeCompare(y.due ?? y.date));
    for (const e of ordered) {
      const c = Math.min(left, e.rest);
      e.paid += c;
      e.rest -= c;
      left -= c;
      if (e.rest > 0.5 && e.due) a.pending.push({ due: e.due, amount: e.rest });
    }
    a.pending.sort((x, y) => x.due.localeCompare(y.due));
    a.remind = a.pending[0]?.due;
    a.remindAmount = a.pending[0]?.amount;
  }
  return [...map.values()]
    .map((a) => ({ ...a, saldo: a.debe - a.haber }))
    .sort((a, b) => b.saldo - a.saldo);
}
