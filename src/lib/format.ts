export const ars = (n: number) =>
  (n ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

export const ars2 = (n: number) =>
  (n ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const num = (n: number, d = 0) =>
  (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: d });

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

export const fmtDateLong = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  const s = d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export const dayOf = (iso: string) => iso.slice(0, 10);

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000,
  );

/**
 * Lee un número escrito a la argentina: punto para los miles y coma para los decimales.
 * "1.234,50" → 1234.5 · "$ 12.000" → 12000 · "0,8" → 0.8 · "40%" → 40
 */
export function parseArNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  let s = v.replace(/[$\s%]|ARS/gi, "").trim();
  if (!s || s === "-") return undefined;
  const neg = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[()-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : undefined;
}

/** Porcentaje con coma decimal: 28.6 → "28,6 %". */
export const pctAr = (n: number, d = 1) => `${num(n, d)} %`;
