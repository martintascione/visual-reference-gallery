import { createClient } from "@supabase/supabase-js";

// Claves públicas (van en el navegador). Se pueden cambiar por variables de entorno en .env
const url = import.meta.env["VITE_SUPABASE_URL"] ?? "https://iledqhvyuvgwpgedmjtj.supabase.co";
const key =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  "sb_publishable_LAK_V8uI2X7AUPGFO1ut7A_Xs5pblHp";

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ---- conversión camelCase (app) ↔ snake_case (base) en el primer nivel ----
const toSnakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toCamelKey = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toRow(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[toSnakeKey(k)] = v === undefined ? null : v;
  return out;
}

export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "updated_at") continue;
    out[toCamelKey(k)] =
      v === null
        ? undefined
        : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && numericKeys.has(k)
          ? Number(v)
          : v;
  }
  return out as T;
}

// Postgres devuelve numeric como string: estas columnas se convierten a número.
const numericKeys = new Set([
  "cost",
  "price",
  "bag_kg",
  "bag_price",
  "liters",
  "stock",
  "min_stock",
  "iva_pct",
  "credit_limit",
  "subtotal",
  "iva",
  "total",
  "amount",
  "paid",
  "qty",
  "fee_pct",
  "sales_total",
  "cost_total",
  "fees_total",
  "expenses_total",
  "fixed_share",
  "profit",
  "cash_expected",
  "cash_counted",
]);
