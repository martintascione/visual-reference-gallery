// Importación de productos y precios leídos por el asistente desde una foto, PDF o planilla.
// La IA propone; acá se calcula todo con las mismas reglas del catálogo y se guarda solo al confirmar.
import type { Category, DB, Product, StoneCost } from "./types";
import { markup, round, stoneCalc } from "./pricing";
import { uid } from "./format";

export type ImportUnit = "t" | "bolson" | "kg" | "m2" | "u";

/** Fila tal como la devuelve el asistente (los números pueden venir como texto). */
export type ProductoPropuesto = {
  nombre: string;
  categoria?: Category | undefined;
  unidad?: ImportUnit | undefined;
  costo?: number | string | null | undefined;
  flete?: number | string | null | undefined;
  descarga?: number | string | null | undefined;
  margen?: number | string | null | undefined;
  precio?: number | string | null | undefined;
  existente?: string | null | undefined;
  nota?: string | null | undefined;
};

export type ImportRow = {
  key: string;
  nombre: string;
  status: "nuevo" | "actualiza" | "error";
  unitLabel: string;
  costo: number;
  flete: number;
  margen: number;
  precio: number;
  aviso?: string | undefined;
  product?: Product | undefined;
};

/**
 * Convierte un número escrito a la argentina: el punto separa miles y la coma los decimales.
 * "1.234,50" → 1234.5 · "$ 12.000" → 12000 · "0,8" → 0.8 · "40%" → 40 · 1234.5 (número) → 1234.5
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

const pct = (n: number) => `${round(n, 1).toLocaleString("es-AR")} %`;

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const unitText: Record<ImportUnit, string> = {
  t: "t",
  bolson: "bolsón",
  kg: "kg",
  m2: "m²",
  u: "unidad",
};

function guessCategory(name: string): Category {
  const n = norm(name);
  if (/\blaja/.test(n)) return "laja";
  if (/fijador|sellador|bidon|liquido|hidrofug/.test(n)) return "liquido";
  if (
    /piedra|arena|granza|granito|canto|rodado|grava|marmol|cuarzo|basalto|dolomita|chip|triturad|binder|tosca|piedrin|leca|corteza/.test(
      n,
    )
  )
    return "piedra";
  return "unitario";
}

/** Arma la vista previa: qué producto se crea o actualiza y con qué precio queda. */
export function buildImport(db: DB, propuestos: ProductoPropuesto[]): ImportRow[] {
  const s = db.settings;
  const active = db.products.filter((p) => p.active);
  const byName = new Map(active.map((p) => [norm(p.name), p]));
  const seen = new Set<string>();

  return propuestos.map((r, i) => {
    const nombre = (r.nombre ?? "").trim();
    const key = `${i}-${nombre}`;
    const existing = (r.existente && byName.get(norm(r.existente))) || byName.get(norm(nombre));
    const cat: Category = existing?.category ?? r.categoria ?? guessCategory(nombre);
    const unit: ImportUnit = r.unidad ?? (cat === "piedra" ? "t" : cat === "laja" ? "m2" : "u");
    const costo = parseArNumber(r.costo);
    const flete = parseArNumber(r.flete) ?? 0;
    const descarga = parseArNumber(r.descarga) ?? 0;
    let margen = parseArNumber(r.margen);
    if (margen !== undefined && margen > 0 && margen < 1) margen = margen * 100; // 0,4 = 40 %
    const precio = parseArNumber(r.precio);
    const base = {
      key,
      nombre: nombre || "(sin nombre)",
      unitLabel: unitText[unit],
      costo: costo ?? 0,
      flete,
      margen: margen ?? 0,
      precio: precio ?? 0,
    };

    if (!nombre) return { ...base, status: "error", aviso: "Fila sin nombre de producto." };
    if (seen.has(norm(nombre))) return { ...base, status: "error", aviso: "Repetido en la lista." };
    seen.add(norm(nombre));
    if (costo === undefined && precio === undefined)
      return { ...base, status: "error", aviso: "No tiene costo ni precio de venta." };

    const status: ImportRow["status"] = existing ? "actualiza" : "nuevo";
    const product: Product = existing
      ? structuredClone(existing)
      : {
          id: uid(),
          name: nombre,
          category: cat,
          unit: cat === "piedra" ? "kg" : cat === "laja" ? "m2" : "u",
          cost: 0,
          price: 0,
          stock: 0,
          minStock: 0,
          ivaPct: s.ivaPct,
          discounts: [],
          active: true,
          ...(cat === "liquido" ? { liters: 10 } : {}),
        };

    if (cat === "piedra") {
      const bagKg = product.bagKg ?? s.bagKg;
      product.bagKg = bagKg;
      // Todo se lleva por tonelada en la calculadora.
      const toTon = (v: number) =>
        unit === "kg" ? v * 1000 : unit === "bolson" ? (v / bagKg) * 1000 : v;
      const prev: StoneCost | undefined = product.stoneCost;
      // Producto nuevo: solo los costos de la lista (sin sumar valores por defecto escondidos).
      // Producto existente: se reemplazan los valores que trae la lista y se conservan los demás.
      const sc: StoneCost = {
        purchasePerTon: costo !== undefined ? toTon(costo) : (prev?.purchasePerTon ?? 0),
        freightPerTon:
          parseArNumber(r.flete) !== undefined
            ? toTon(flete)
            : existing
              ? (prev?.freightPerTon ?? 0)
              : 0,
        unloadPerTon:
          parseArNumber(r.descarga) !== undefined
            ? toTon(descarga)
            : existing
              ? (prev?.unloadPerTon ?? 0)
              : 0,
        laborPerTon: existing ? (prev?.laborPerTon ?? 0) : 0,
        extrasPerTon: existing ? (prev?.extrasPerTon ?? 0) : 0,
        packagingPerBag: existing ? (prev?.packagingPerBag ?? 0) : 0,
        marginPct: margen ?? prev?.marginPct ?? s.defaultMarginPct ?? 40,
      };
      if (precio !== undefined) {
        // El precio final de la lista manda: se recalcula el margen para que dé exacto en su unidad.
        const zero = stoneCalc({ ...sc, marginPct: 0 }, bagKg);
        const costInUnit =
          unit === "bolson" ? zero.costBag : unit === "kg" ? zero.costKg : zero.costTon;
        if (costInUnit > 0) sc.marginPct = round((precio / costInUnit - 1) * 100, 4);
      }
      const calc = stoneCalc(sc, bagKg);
      product.stoneCost = sc;
      product.cost = calc.costKg;
      product.price = calc.priceKg;
      product.bagPrice = calc.priceBag;
      const shownCost =
        unit === "bolson" ? calc.costBag : unit === "kg" ? calc.costKg : calc.costTon;
      const shownPrice =
        unit === "bolson" ? calc.priceBag : unit === "kg" ? calc.priceKg : calc.priceTon;
      const extra = sc.unloadPerTon + sc.laborPerTon + sc.extrasPerTon;
      const aviso =
        precio !== undefined && margen !== undefined && Math.abs(sc.marginPct - margen) > 0.5
          ? `La lista dice ${pct(margen)} pero con ese precio el margen real es ${pct(sc.marginPct)}${existing && extra > 0 && parseArNumber(r.descarga) === undefined ? " (el costo suma la descarga y otros gastos que el producto ya tenía cargados)" : ""}. Se respeta el precio.`
          : r.nota || undefined;
      return {
        ...base,
        status,
        costo: costo ?? shownCost,
        margen: round(sc.marginPct, 1),
        precio: shownPrice,
        aviso,
        product,
      };
    }

    // Laja, líquido y unitario: costo por unidad + margen (o precio final).
    const costoTotal = (costo ?? product.cost) + flete + descarga;
    const price = precio ?? round(costoTotal * (1 + (margen ?? s.defaultMarginPct ?? 40) / 100));
    product.cost = round(costoTotal);
    product.price = round(price);
    const realMargin = markup(product.cost, product.price);
    const aviso =
      precio !== undefined &&
      margen !== undefined &&
      costoTotal > 0 &&
      Math.abs(realMargin - margen) > 0.5
        ? `La lista dice ${pct(margen)} pero con ese precio el margen real es ${pct(realMargin)}. Se respeta el precio.`
        : r.nota || undefined;
    return {
      ...base,
      status,
      costo: costo ?? product.cost,
      margen: realMargin,
      precio: product.price,
      aviso,
      product,
    };
  });
}
