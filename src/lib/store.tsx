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
  ) => void;
  addCheque: (c: Draft<Cheque>) => Cheque;
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
  | "supplierPayments";
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
  const st = await supabase.from("settings").select("*").eq("id", "main").maybeSingle();
  if (st.error) throw st.error;
  if (st.data) {
    db.settings = { ...db.settings, ...(st.data.data as Settings) };
    db.counters = { ...db.counters, ...(st.data.counters as DB["counters"]) };
  } else {
    const ins = await supabase
      .from("settings")
      .insert({ id: "main", data: db.settings, counters: db.counters });
    if (ins.error) throw ins.error;
  }
  return db;
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
function applySale(d: DB, sale: Sale, chequeDraft?: Draft<Cheque>, prevMoves: Movement[] = []) {
  for (const it of sale.items) {
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
  for (const it of sale.items) {
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
          d.sales[i] = sale;
          return d;
        }),
      removeSale: (id) =>
        mutate((d) => {
          const sale = d.sales.find((x) => x.id === id);
          if (!sale) return d;
          reverseSale(d, sale);
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
      upsertClient: (c) =>
        mutate((d) => {
          const i = d.clients.findIndex((x) => x.id === c.id);
          if (i >= 0) d.clients[i] = c;
          else d.clients.push(c);
          return d;
        }),
      payDue: (dueId, amount, method, bank, gateway) =>
        mutate((d) => {
          const due = d.dues.find((x) => x.id === dueId);
          if (!due) return d;
          due.paid = Math.min(due.amount, due.paid + amount);
          const client = d.clients.find((c) => c.id === due.clientId);
          const cfg = methodCfg(d, { method, bank, gateway, amount });
          d.movements.unshift({
            id: uid(),
            date: new Date().toISOString(),
            kind: "cobro",
            account: bank,
            amount,
            concept: `Cobro cuota ${due.n}/${due.of} · ${client?.name ?? ""}`,
            method,
            gateway,
            feePct: cfg?.feePct ?? 0,
            settleDays: cfg?.settleDays ?? 0,
            settled: !gateway,
            refId: due.id,
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
  const map = new Map<
    string,
    {
      party: string;
      kind: "cantera" | "transporte";
      debe: number;
      haber: number;
      last: string;
      /** Día del aviso para pagar el saldo (el más próximo, si hay varios). */
      remind?: string | undefined;
    }
  >();
  const sooner = (a: string | undefined, b: string | undefined) =>
    a && b ? (a < b ? a : b) : a || b;
  const get = (party: string, kind: "cantera" | "transporte") => {
    const key = kind + "|" + party.trim().toLowerCase();
    let a = map.get(key);
    if (!a) map.set(key, (a = { party: party.trim(), kind, debe: 0, haber: 0, last: "" }));
    return a;
  };
  for (const p of db.purchases) {
    const a = get(p.supplier, "cantera");
    a.debe += p.items.reduce((x, i) => x + i.total, 0);
    if (p.date > a.last) a.last = p.date;
    a.remind = sooner(a.remind, p.payDue);
    if (p.carrier && p.freightTotal > 0) {
      const c = get(p.carrier, "transporte");
      c.debe += p.freightTotal;
      if (p.date > c.last) c.last = p.date;
      c.remind = sooner(c.remind, p.freightDue);
    }
    // La descarga, si la cobra alguien de afuera, va a la cuenta de esa persona o transporte.
    if (p.unloadBy && p.unloadCost > 0) {
      const u = get(p.unloadBy, "transporte");
      u.debe += p.unloadCost;
      if (p.date > u.last) u.last = p.date;
      u.remind = sooner(u.remind, sameName(p.unloadBy, p.carrier) ? p.freightDue : p.unloadDue);
    }
  }
  for (const pay of db.supplierPayments) get(pay.party, pay.kind).haber += pay.amount;
  return [...map.values()]
    .map((a) => ({ ...a, saldo: a.debe - a.haber }))
    .sort((a, b) => b.saldo - a.saldo);
}
