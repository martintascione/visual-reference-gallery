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
  Payment,
  PaymentMethod,
  Product,
  Quote,
  Sale,
  Settings,
  StockMove,
} from "./types";
import { emptyDB } from "./seed";
import { addDays, dayOf, todayISO, uid } from "./format";
import { fromRow, supabase, toRow } from "./supabase";
import type { Session } from "@supabase/supabase-js";

// Persistencia en Supabase. Las pantallas usan el mismo useStore(): el estado vive en memoria
// y cada cambio se sincroniza con la base (se guardan solo las filas que cambiaron).

type Draft<T> = Omit<T, "id">;

type Actions = {
  upsertProduct: (p: Product) => void;
  removeProduct: (id: string) => void;
  addStockMove: (m: Draft<StockMove>) => void;
  addSale: (s: Omit<Sale, "id" | "number">, cheque?: Draft<Cheque>) => Sale;
  setDeliveryDone: (saleId: string, done: boolean) => void;
  addQuote: (q: Omit<Quote, "id" | "number">) => Quote;
  updateQuote: (id: string, patch: Partial<Quote>) => void;
  upsertClient: (c: Client) => void;
  payDue: (
    dueId: string,
    amount: number,
    method: PaymentMethod,
    bank: Bank,
    gateway?: "Payway",
  ) => void;
  addCheque: (c: Draft<Cheque>) => Cheque;
  setChequeStatus: (id: string, status: ChequeStatus, depositBank?: Bank) => void;
  addExpense: (e: Draft<Expense>) => void;
  addIncome: (date: string, concept: string, amount: number, account: Bank) => void;
  settleMovement: (id: string, settled: boolean) => void;
  closeDay: (cashCounted: number, note?: string) => Closure;
  updateSettings: (patch: Partial<Settings>) => void;
  resetDemo: () => void;
  setPendingQuote: (id?: string) => void;
};

type Ctx = {
  db: DB;
  pendingQuoteId: string | undefined;
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
  | "closures";
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

/** Guarda en la base solo lo que cambió entre dos estados. */
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
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Sesión
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Carga inicial cuando hay sesión
  useEffect(() => {
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
    queue.current = queue.current
      .then(() => persistDiff(prev, next))
      .then(() => setSyncError(null))
      .catch((e: Error) => setSyncError(`No se pudo guardar: ${e.message}. Revisá la conexión.`));
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
          // stock
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
          // pagos → movimientos / cheques / cuotas
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
            const cfg = methodCfg(d, pay);
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
              settled: !pay.gateway,
              refId: sale.id,
            });
          }
          if (sale.fromQuoteId) {
            const q = d.quotes.find((x) => x.id === sale.fromQuoteId);
            if (q) q.status = "aceptado";
          }
          d.sales.unshift(sale);
          return d;
        });
        return sale;
      },
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
        const ch: Cheque = { ...c, id: uid() };
        mutate((d) => {
          d.cheques.unshift(ch);
          return d;
        });
        return ch;
      },
      setChequeStatus: (id, status, depositBank) =>
        mutate((d) => {
          const ch = d.cheques.find((x) => x.id === id);
          if (!ch) return d;
          ch.status = status;
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
    }),
    [mutate],
  );

  const value = useMemo(
    () => ({ db, pendingQuoteId, session, ready, syncError, ...actions }),
    [db, pendingQuoteId, session, ready, syncError, actions],
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
