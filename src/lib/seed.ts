import type { DB, Settings } from "./types";

// Configuración inicial. Las comisiones y plazos son valores de muestra:
// hay que cargar los reales en Configuración según lo que cobre cada banco y Payway.

export const defaultSettings: Settings = {
  businessName: "Áridos Petreos",
  phone: "2392-628647",
  instagram: "aridospetreos",
  address: "Avellaneda 2545",
  city: "Trenque Lauquen, Buenos Aires",
  quoteFooter: "Saludos cordiales, esperamos una pronta respuesta.",
  bagKg: 25,
  packagingPerBag: 350,
  unloadPerTon: 4000,
  freightPerTon: 0,
  ivaPct: 21,
  minMarginPct: 20,
  defaultMarginPct: 40,
  quoteValidDays: 7,
  followUpDays: 2,
  methods: [
    {
      id: "efectivo",
      label: "Efectivo",
      method: "efectivo",
      bank: "Caja",
      feePct: 0,
      settleDays: 0,
      active: true,
    },
    {
      id: "transf-bbva",
      label: "Transferencia BBVA",
      method: "transferencia",
      bank: "BBVA",
      feePct: 0,
      settleDays: 0,
      active: true,
    },
    {
      id: "transf-prov",
      label: "Transferencia Provincia",
      method: "transferencia",
      bank: "Provincia",
      feePct: 0,
      settleDays: 0,
      active: true,
    },
    {
      id: "deb-payway-prov",
      label: "Débito Payway → Provincia",
      method: "debito",
      bank: "Provincia",
      gateway: "Payway",
      feePct: 0.8,
      settleDays: 2,
      active: true,
    },
    {
      id: "cred-payway-bbva",
      label: "Crédito Payway → BBVA",
      method: "credito",
      bank: "BBVA",
      gateway: "Payway",
      feePct: 1.8,
      settleDays: 10,
      active: true,
    },
    {
      id: "cheque",
      label: "Cheque",
      method: "cheque",
      bank: "Provincia",
      feePct: 0,
      settleDays: 0,
      active: true,
    },
    {
      id: "cta-cte",
      label: "Cuenta corriente",
      method: "cta_cte",
      bank: "Caja",
      feePct: 0,
      settleDays: 0,
      active: true,
    },
  ],
  zones: [
    { id: "z1", name: "Zona 1 · hasta 10 km", price: 25000, cost: 14000 },
    { id: "z2", name: "Zona 2 · 10 a 25 km", price: 42000, cost: 26000 },
    { id: "z3", name: "Zona 3 · más de 25 km", price: 65000, cost: 41000 },
  ],
  fixedExpenses: [
    { id: "f1", concept: "Alquiler del local", amount: 850000, account: "BBVA", day: 5 },
    { id: "f2", concept: "Sueldos", amount: 1900000, account: "Provincia", day: 4 },
    { id: "f3", concept: "Luz y agua", amount: 120000, account: "BBVA", day: 15 },
    { id: "f4", concept: "Seguro camión", amount: 95000, account: "Provincia", day: 10 },
  ],
};

/** Base vacía con la configuración por defecto. */
export function emptyDB(): DB {
  return {
    version: 1,
    products: [],
    sales: [],
    quotes: [],
    clients: [],
    dues: [],
    cheques: [],
    movements: [],
    expenses: [],
    stockMoves: [],
    closures: [],
    settings: structuredClone(defaultSettings),
    counters: { sale: 1000, quote: 500 },
  };
}
