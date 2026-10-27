// Datos de ejemplo para el modo demo (VITE_DEMO=1): sirve para probar la interfaz sin Supabase.
import type { DB, Movement, Product, Sale, StoneCost } from "./types";
import { defaultSettings, emptyDB } from "./seed";
import { lineTotals, stoneCalc } from "./pricing";
import { addDays, todayISO, uid } from "./format";

const settings = structuredClone(defaultSettings);

function stone(
  name: string,
  c: Omit<StoneCost, "packagingPerBag" | "unloadPerTon"> & Partial<StoneCost>,
  stock: number,
  minStock: number,
): Product {
  const sc: StoneCost = {
    packagingPerBag: settings.packagingPerBag,
    unloadPerTon: settings.unloadPerTon,
    ...c,
  };
  const r = stoneCalc(sc, settings.bagKg);
  return {
    id: uid(),
    name,
    category: "piedra",
    unit: "kg",
    cost: r.costKg,
    price: r.priceKg,
    bagKg: settings.bagKg,
    bagPrice: r.priceBag,
    stock,
    minStock,
    ivaPct: 21,
    discounts: [
      { minQty: 10, unit: "bolson", pct: 5 },
      { minQty: 1, unit: "t", pct: 8 },
    ],
    stoneCost: sc,
    active: true,
  };
}

export function demoDB(): DB {
  const db = emptyDB();
  const today = todayISO();
  const products: Product[] = [
    stone(
      "Piedra partida 6-20",
      {
        purchasePerTon: 78000,
        freightPerTon: 24000,
        laborPerTon: 0,
        extrasPerTon: 0,
        marginPct: 40,
      },
      800,
      3000,
    ),
    stone(
      "Canto rodado",
      {
        purchasePerTon: 95000,
        freightPerTon: 24000,
        laborPerTon: 0,
        extrasPerTon: 0,
        marginPct: 45,
      },
      6200,
      2000,
    ),
    stone(
      "Piedra blanca decorativa",
      {
        purchasePerTon: 140000,
        freightPerTon: 28000,
        laborPerTon: 5000,
        extrasPerTon: 0,
        marginPct: 55,
      },
      9400,
      2000,
    ),
    stone(
      "Granza fina",
      {
        purchasePerTon: 70000,
        freightPerTon: 24000,
        laborPerTon: 0,
        extrasPerTon: 0,
        marginPct: 40,
      },
      4500,
      2000,
    ),
    {
      id: uid(),
      name: "Laja San Luis",
      category: "laja",
      unit: "m2",
      cost: 21000,
      price: 32500,
      stock: 140,
      minStock: 40,
      ivaPct: 21,
      discounts: [{ minQty: 30, unit: "m2", pct: 5 }],
      active: true,
    },
    {
      id: uid(),
      name: "Fijador para piedras 5 L",
      category: "liquido",
      unit: "u",
      liters: 5,
      cost: 21000,
      price: 32000,
      stock: 4,
      minStock: 8,
      ivaPct: 21,
      discounts: [],
      active: true,
    },
    {
      id: uid(),
      name: "Fijador para piedras 10 L",
      category: "liquido",
      unit: "u",
      liters: 10,
      cost: 38000,
      price: 57000,
      stock: 15,
      minStock: 6,
      ivaPct: 21,
      discounts: [],
      active: true,
    },
    {
      id: uid(),
      name: "Malla contenedora 1 × 1 m",
      category: "unitario",
      unit: "u",
      cost: 6500,
      price: 11000,
      stock: 48,
      minStock: 10,
      ivaPct: 21,
      discounts: [],
      active: true,
    },
  ];
  const P = (name: string) => products.find((p) => p.name === name) as Product;
  const clients = [
    {
      id: "c1",
      name: "Constructora Ríos",
      phone: "11 5555-0101",
      cuit: "30-71234567-8",
      address: "Av. San Martín 1450, Lomas",
      creditLimit: 3000000,
    },
    {
      id: "c2",
      name: "Marcelo Giménez",
      phone: "11 5555-0202",
      address: "Calle 12 N° 830, Adrogué",
      creditLimit: 800000,
    },
    { id: "c3", name: "Laura Benítez", phone: "11 5555-0303", creditLimit: 500000 },
    { id: "c4", name: "Jardines del Sur", phone: "11 5555-0404", creditLimit: 1500000 },
  ];
  const mk = (
    n: number,
    daysAgo: number,
    time: string,
    clientId: string | undefined,
    clientName: string,
    lines: [string, number, "kg" | "t" | "bolson" | "m2" | "u"][],
    pay: Sale["payments"][number],
    withIva: boolean,
    delivery?: Sale["delivery"],
  ): Sale => {
    const items = lines.map(([name, qty, unit]) => {
      const p = P(name);
      return { productId: p.id, name: p.name, qty, unit, ...lineTotals(p, qty, unit) };
    });
    const subtotal = items.reduce((a, i) => a + i.subtotal, 0) + (delivery?.price ?? 0);
    const iva = withIva ? Math.round(subtotal * 0.21) : 0;
    const total = subtotal + iva;
    return {
      id: "s" + n,
      number: n,
      date: `${addDays(today, -daysAgo)}T${time}:00`,
      clientId,
      clientName,
      items,
      delivery,
      payments: [{ ...pay, amount: total }],
      withIva,
      subtotal,
      iva,
      total,
      cost: items.reduce((a, i) => a + i.cost, 0) + (delivery?.cost ?? 0),
    };
  };
  const sales: Sale[] = [
    mk(
      1001,
      6,
      "10:15",
      "c1",
      "Constructora Ríos",
      [["Piedra partida 6-20", 5, "t"]],
      { method: "transferencia", amount: 0, bank: "BBVA" },
      true,
    ),
    mk(
      1002,
      5,
      "11:40",
      undefined,
      "Consumidor final",
      [
        ["Canto rodado", 6, "bolson"],
        ["Fijador para piedras 5 L", 1, "u"],
      ],
      { method: "efectivo", amount: 0, bank: "Caja" },
      false,
    ),
    mk(
      1003,
      4,
      "16:20",
      "c4",
      "Jardines del Sur",
      [
        ["Piedra blanca decorativa", 2, "t"],
        ["Malla contenedora 1 × 1 m", 20, "u"],
      ],
      { method: "credito", amount: 0, bank: "BBVA", gateway: "Payway", installments: 3 },
      true,
      {
        address: "Ruta 210 km 32",
        zone: "Zona 2 · 10 a 25 km",
        price: 42000,
        cost: 26000,
        date: addDays(today, -3),
        done: true,
      },
    ),
    mk(
      1004,
      3,
      "09:05",
      undefined,
      "Consumidor final",
      [["Laja San Luis", 12, "m2"]],
      { method: "debito", amount: 0, bank: "Provincia", gateway: "Payway" },
      false,
    ),
    mk(
      1005,
      2,
      "12:30",
      "c3",
      "Laura Benítez",
      [
        ["Laja San Luis", 25, "m2"],
        ["Fijador para piedras 10 L", 2, "u"],
      ],
      { method: "cta_cte", amount: 0, bank: "Caja", dues: 3 },
      false,
    ),
    mk(
      1006,
      1,
      "15:10",
      "c2",
      "Marcelo Giménez",
      [["Piedra blanca decorativa", 12, "bolson"]],
      { method: "cheque", amount: 0, bank: "Provincia", chequeId: "ch1" },
      false,
    ),
    mk(
      1007,
      0,
      "08:20",
      "c1",
      "Constructora Ríos",
      [["Piedra partida 6-20", 8, "t"]],
      { method: "transferencia", amount: 0, bank: "BBVA" },
      true,
      {
        address: "Av. San Martín 1450, Lomas",
        zone: "Zona 1 · hasta 10 km",
        price: 25000,
        cost: 14000,
        date: today,
        done: false,
      },
    ),
    mk(
      1008,
      0,
      "09:50",
      undefined,
      "Consumidor final",
      [
        ["Canto rodado", 4, "bolson"],
        ["Fijador para piedras 5 L", 1, "u"],
      ],
      { method: "efectivo", amount: 0, bank: "Caja" },
      false,
    ),
    mk(
      1009,
      0,
      "11:30",
      "c4",
      "Jardines del Sur",
      [["Fijador para piedras 10 L", 6, "u"]],
      { method: "debito", amount: 0, bank: "Provincia", gateway: "Payway" },
      true,
    ),
  ];
  const s1005 = sales.find((s) => s.number === 1005) as Sale;
  const dueAmt = Math.round(s1005.total / 3);
  const s1006 = sales.find((s) => s.number === 1006) as Sale;
  const movements: Movement[] = sales.flatMap((s) =>
    s.payments
      .filter((p) => p.method !== "cta_cte" && p.method !== "cheque")
      .map((p) => {
        const m = settings.methods.find((x) => x.method === p.method && x.bank === p.bank);
        return {
          id: uid(),
          date: s.date,
          kind: "venta" as const,
          account: p.bank,
          amount: p.amount,
          concept: `Venta #${s.number} · ${s.clientName}`,
          method: p.method,
          gateway: p.gateway,
          feePct: m?.feePct ?? 0,
          settleDays: m?.settleDays ?? 0,
          settled: !p.gateway,
          refId: s.id,
        };
      }),
  );
  movements.push({
    id: uid(),
    date: `${addDays(today, -2)}T10:00:00`,
    kind: "cobro",
    account: "Caja",
    amount: dueAmt,
    concept: "Cobro cuota 1/3 · Laura Benítez",
    method: "efectivo",
    feePct: 0,
    settleDays: 0,
    settled: true,
    refId: "d1",
  });
  const expenses = [
    {
      id: uid(),
      date: `${addDays(today, -4)}T09:00:00`,
      type: "debito" as const,
      concept: "Débito automático · seguro camión",
      amount: 95000,
      account: "Provincia" as const,
      method: "transferencia" as const,
    },
    {
      id: uid(),
      date: `${addDays(today, -3)}T14:00:00`,
      type: "flete" as const,
      concept: "Gasoil camión",
      amount: 86000,
      account: "Caja" as const,
      method: "efectivo" as const,
    },
    {
      id: uid(),
      date: `${today}T10:40:00`,
      type: "imprevisto" as const,
      concept: "Arreglo cubierta camión",
      amount: 140000,
      account: "Caja" as const,
      method: "efectivo" as const,
    },
  ];
  for (const e of expenses)
    movements.push({
      id: uid(),
      date: e.date,
      kind: e.type === "debito" ? "debito" : "gasto",
      account: e.account,
      amount: -e.amount,
      concept: e.concept,
      method: e.method,
      settled: true,
      refId: e.id,
    });
  const q = (
    id: string,
    number: number,
    daysAgo: number,
    clientId: string,
    name: string,
    phone: string,
    prod: string,
    qty: number,
    unit: "bolson" | "m2",
    status: "enviado" | "seguimiento",
    note: string,
    valid: number,
    follow: number,
  ) => {
    const p = P(prod);
    const t = lineTotals(p, qty, unit);
    const subtotal = t.subtotal;
    return {
      id,
      number,
      date: `${addDays(today, -daysAgo)}T09:45:00`,
      validUntil: addDays(today, valid),
      followUp: addDays(today, follow),
      clientId,
      clientName: name,
      phone,
      items: [{ productId: p.id, name: p.name, qty, unit, ...t }],
      withIva: false,
      subtotal,
      iva: 0,
      total: subtotal,
      status,
      note,
    };
  };
  Object.assign(db, {
    products,
    clients,
    sales: sales.slice().reverse(),
    quotes: [
      q(
        "q1",
        501,
        0,
        "c2",
        "Marcelo Giménez",
        "11 5555-0202",
        "Piedra blanca decorativa",
        12,
        "bolson",
        "enviado",
        "Pidió entrega para el sábado.",
        7,
        2,
      ),
      q(
        "q2",
        500,
        1,
        "c3",
        "Laura Benítez",
        "11 5555-0303",
        "Laja San Luis",
        20,
        "m2",
        "seguimiento",
        "Vence hoy, llamar a la tarde.",
        0,
        0,
      ),
    ],
    dues: [1, 2, 3].map((n) => ({
      id: "d" + n,
      clientId: "c3",
      saleId: s1005.id,
      n,
      of: 3,
      dueDate: addDays(today, n === 1 ? -2 : n === 2 ? -1 : 28),
      amount: n === 3 ? s1005.total - dueAmt * 2 : dueAmt,
      paid: n === 1 ? dueAmt : 0,
    })),
    cheques: [
      {
        id: "ch1",
        number: "00451238",
        bank: "Banco Nación",
        drawer: "Marcelo Giménez",
        dueDate: addDays(today, 2),
        amount: s1006.total,
        status: "cartera" as const,
        clientId: "c2",
        clientName: "Marcelo Giménez",
        saleId: s1006.id,
        echeq: false,
      },
      {
        id: "ch2",
        number: "77812004",
        bank: "Galicia",
        drawer: "Constructora Ríos",
        dueDate: addDays(today, 6),
        amount: 450000,
        status: "cartera" as const,
        clientId: "c1",
        clientName: "Constructora Ríos",
        echeq: true,
      },
    ],
    movements: movements.sort((a, b) => b.date.localeCompare(a.date)),
    expenses: expenses.slice().reverse(),
    stockMoves: [
      {
        id: uid(),
        date: `${addDays(today, -7)}T08:00:00`,
        productId: P("Piedra partida 6-20").id,
        qty: 20000,
        reason: "compra" as const,
        note: "Camión 20 t · Cantera Olavarría",
      },
    ],
    counters: { sale: 1009, quote: 501 },
  });
  return db;
}
