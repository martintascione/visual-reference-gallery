// Modelo de datos del corralón. Todo corre en el navegador (sin servidor).

export type Bank = "Caja" | "BBVA" | "Provincia";
export type Category = "piedra" | "laja" | "liquido" | "unitario";
export type BaseUnit = "kg" | "m2" | "l" | "u";
export type SaleUnit = "kg" | "t" | "bolson" | "m2" | "u";

export type QtyDiscount = { minQty: number; unit: SaleUnit; pct: number };

/** Desglose de costo por tonelada para piedras (calculadora). */
export type StoneCost = {
  purchasePerTon: number;
  freightPerTon: number;
  unloadPerTon: number;
  laborPerTon: number;
  extrasPerTon: number;
  packagingPerBag: number;
  marginPct: number; // sobre el costo
};

export type Product = {
  id: string;
  name: string;
  category: Category;
  unit: BaseUnit;
  /** Costo por unidad base (kg, m2, l, u). */
  cost: number;
  /** Precio de venta por unidad base. */
  price: number;
  /** Solo piedras: kg por bolsón y precio del bolsón. */
  bagKg?: number | undefined;
  bagPrice?: number | undefined;
  /** Solo líquidos: litros por envase (el stock se lleva en envases). */
  liters?: number | undefined;
  stock: number;
  minStock: number;
  ivaPct: number;
  discounts: QtyDiscount[];
  stoneCost?: StoneCost | undefined;
  active: boolean;
};

export type SaleItem = {
  productId: string;
  name: string;
  qty: number;
  unit: SaleUnit;
  unitPrice: number;
  discountPct: number;
  subtotal: number;
  /** Costo total del renglón (para ganancia). */
  cost: number;
  /** Cantidad descontada del stock, en unidad base. */
  baseQty: number;
};

export type PaymentMethod =
  "efectivo" | "transferencia" | "debito" | "credito" | "cheque" | "cta_cte";

export type Payment = {
  method: PaymentMethod;
  amount: number;
  bank: Bank;
  gateway?: "Payway" | undefined;
  installments?: number | undefined;
  chequeId?: string | undefined;
  /** Para cta cte: cantidad de cuotas acordadas. */
  dues?: number | undefined;
};

export type Delivery = {
  address: string;
  zone: string;
  price: number; // lo que paga el cliente
  cost: number; // lo que cuesta el viaje
  date: string;
  done: boolean;
};

export type Sale = {
  id: string;
  number: number;
  date: string; // ISO
  clientId?: string | undefined;
  clientName: string;
  items: SaleItem[];
  delivery?: Delivery | undefined;
  payments: Payment[];
  withIva: boolean;
  subtotal: number;
  iva: number;
  total: number;
  cost: number;
  note?: string | undefined;
  closureId?: string | undefined;
  fromQuoteId?: string | undefined;
};

export type QuoteStatus =
  "borrador" | "enviado" | "seguimiento" | "aceptado" | "vencido" | "perdido";

export type Quote = {
  id: string;
  number: number;
  date: string;
  validUntil: string;
  followUp?: string | undefined;
  clientId?: string | undefined;
  clientName: string;
  phone?: string | undefined;
  items: SaleItem[];
  delivery?: Delivery | undefined;
  withIva: boolean;
  subtotal: number;
  iva: number;
  total: number;
  status: QuoteStatus;
  note?: string | undefined;
  lostReason?: string | undefined;
};

export type Client = {
  id: string;
  name: string;
  phone?: string | undefined;
  cuit?: string | undefined;
  address?: string | undefined;
  creditLimit: number;
  note?: string | undefined;
};

/** Cuota de una venta a cuenta corriente. */
export type Due = {
  id: string;
  clientId: string;
  saleId: string;
  n: number;
  of: number;
  dueDate: string;
  amount: number;
  paid: number;
};

export type ChequeStatus = "cartera" | "depositado" | "acreditado" | "endosado" | "rechazado";

export type Cheque = {
  id: string;
  number: string;
  bank: string; // banco emisor
  drawer: string; // librador
  dueDate: string;
  amount: number;
  status: ChequeStatus;
  clientId?: string | undefined;
  clientName: string;
  saleId?: string | undefined;
  depositBank?: Bank | undefined;
  echeq: boolean;
};

export type MovementKind = "venta" | "cobro" | "gasto" | "debito" | "ingreso" | "compra" | "flete";

/** Movimiento de caja/banco. */
export type Movement = {
  id: string;
  date: string;
  kind: MovementKind;
  account: Bank;
  amount: number; // + entra, - sale
  concept: string;
  method?: PaymentMethod | undefined;
  gateway?: "Payway" | undefined;
  feePct?: number | undefined;
  settleDays?: number | undefined;
  settled?: boolean | undefined;
  refId?: string | undefined;
  closureId?: string | undefined;
};

export type ExpenseType = "fijo" | "imprevisto" | "debito" | "flete" | "compra";

export type Expense = {
  id: string;
  date: string;
  type: ExpenseType;
  concept: string;
  amount: number;
  account: Bank;
  method: PaymentMethod;
  closureId?: string | undefined;
};

export type FixedExpense = {
  id: string;
  concept: string;
  amount: number;
  account: Bank;
  day: number; // día del mes que se debita
};

export type StockMove = {
  id: string;
  date: string;
  productId: string;
  qty: number; // + entra, - sale (unidad base)
  reason: "venta" | "compra" | "ajuste" | "merma" | "fraccionado";
  note?: string | undefined;
};

export type Closure = {
  id: string;
  date: string;
  saleIds: string[];
  byMethod: {
    label: string;
    bank: string;
    gross: number;
    fee: number;
    net: number;
    settleDays: number;
  }[];
  salesTotal: number;
  costTotal: number;
  feesTotal: number;
  expensesTotal: number;
  fixedShare: number;
  profit: number;
  cashExpected: number;
  cashCounted: number;
  note?: string | undefined;
};

export type MethodConfig = {
  id: string;
  label: string;
  method: PaymentMethod;
  bank: Bank;
  gateway?: "Payway" | undefined;
  feePct: number;
  settleDays: number;
  active: boolean;
};

export type Zone = { id: string; name: string; price: number; cost: number };

export type Settings = {
  businessName: string;
  bagKg: number;
  packagingPerBag: number;
  unloadPerTon: number;
  freightPerTon: number;
  ivaPct: number;
  minMarginPct: number;
  defaultMarginPct: number;
  methods: MethodConfig[];
  zones: Zone[];
  fixedExpenses: FixedExpense[];
  quoteValidDays: number;
  followUpDays: number;
};

export type DB = {
  version: number;
  products: Product[];
  sales: Sale[];
  quotes: Quote[];
  clients: Client[];
  dues: Due[];
  cheques: Cheque[];
  movements: Movement[];
  expenses: Expense[];
  stockMoves: StockMove[];
  closures: Closure[];
  settings: Settings;
  counters: { sale: number; quote: number };
};
