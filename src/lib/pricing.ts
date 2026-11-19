import type { Product, QtyDiscount, SaleUnit, StoneCost } from "./types";

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Costo por tonelada sumando todos los componentes (el desperdicio encarece lo que sí se vende). */
export function stoneCostPerTon(c: StoneCost) {
  const sum =
    c.purchasePerTon +
    c.freightPerTon +
    c.unloadPerTon +
    c.laborPerTon +
    c.extrasPerTon +
    (c.basePerTon ?? 0) +
    (c.palletPerTon ?? 0) +
    (c.sampiPerTon ?? 0);
  const waste = Math.min(90, Math.max(0, c.wastePct ?? 0));
  return sum / (1 - waste / 100);
}

/** Calculadora completa de una piedra: costos y precios por kg, bolsa, bolsones y tonelada. */
export function stoneCalc(c: StoneCost, bagKg: number) {
  const perTon = stoneCostPerTon(c);
  const perKg = perTon / 1000;
  const perBag = perKg * bagKg + c.packagingPerBag;
  const bigKg = c.bigBagKg ?? 1000;
  const perBig = perKg * bigKg + (c.bigBagPackaging ?? 0);
  const big2Kg = c.bigBag2Kg ?? 0;
  const perBig2 = perKg * big2Kg + (c.bigBagPackaging ?? 0);
  const factor = 1 + c.marginPct / 100;
  const priceKg = perKg * factor;
  // Por defecto la bolsa y los bolsones valen lo mismo por kilo que la tonelada.
  const same = c.bagSamePerKg !== false;
  const priceBag = same ? priceKg * bagKg : perBag * factor;
  const priceTon = perTon * factor;
  const priceBig = same ? priceKg * bigKg : perBig * factor;
  const priceBig2 = same ? priceKg * big2Kg : perBig2 * factor;
  return {
    bigKg,
    costBig: round(perBig, 0),
    priceBig: round(priceBig, 0),
    gainBig: round(priceBig - perBig, 0),
    big2Kg,
    costBig2: round(perBig2, 0),
    priceBig2: round(priceBig2, 0),
    costKg: round(perKg),
    costBag: round(perBag, 0),
    costTon: round(perTon, 0),
    priceKg: round(priceKg),
    priceBag: round(priceBag, 0),
    priceTon: round(priceTon, 0),
    gainKg: round(priceKg - perKg),
    gainBag: round(priceBag - perBag, 0),
    gainTon: round(priceTon - perTon, 0),
    /** Margen sobre el precio de venta (lo que queda de cada peso vendido). */
    marginOnPrice: factor > 0 ? round((1 - 1 / factor) * 100, 1) : 0,
  };
}

/** Precio sugerido para productos simples (laja, líquido, unitario). */
export function simplePrice(cost: number, marginPct: number) {
  return round(cost * (1 + marginPct / 100));
}

export function marginOnPrice(cost: number, price: number) {
  return price > 0 ? round(((price - cost) / price) * 100, 1) : 0;
}

export function markup(cost: number, price: number) {
  return cost > 0 ? round(((price - cost) / cost) * 100, 1) : 0;
}

/** Kilos del bolsón grande de un producto (1.000 kg si no se cargó otro valor). */
export const bigBagKg = (p: Product) => p.stoneCost?.bigBagKg ?? 1000;

/** Unidades en las que se puede vender cada producto. */
export function saleUnitsFor(p: Product): SaleUnit[] {
  if (p.category === "piedra")
    return (p.stoneCost?.bigBag2Kg ?? 0) > 0
      ? ["kg", "bolson", "bigbag", "bigbag2", "t"]
      : ["kg", "bolson", "bigbag", "t"];
  if (p.category === "laja") return ["m2"];
  return ["u"];
}

export const unitLabel: Record<SaleUnit, string> = {
  kg: "kg",
  t: "tonelada",
  bolson: "bolsa",
  bigbag: "bolsón",
  bigbag2: "bolsón grande",
  m2: "m²",
  u: "unidad",
};

const unitPlural: Record<SaleUnit, string> = {
  kg: "kg",
  t: "toneladas",
  bolson: "bolsas",
  bigbag: "bolsones",
  bigbag2: "bolsones grandes",
  m2: "m²",
  u: "unidades",
};

/** "12 bolsones", "1 tonelada", "2,5 t" según cantidad. */
export function qtyUnit(qty: number, unit: SaleUnit) {
  const n = qty.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return `${n} ${qty === 1 ? unitLabel[unit] : unitPlural[unit]}`;
}

/** Cantidad en unidad base (kg, m2, l, u) para descontar stock. */
export function toBaseQty(p: Product, qty: number, unit: SaleUnit) {
  if (unit === "t") return qty * 1000;
  if (unit === "bolson") return qty * (p.bagKg ?? 25);
  if (unit === "bigbag") return qty * bigBagKg(p);
  if (unit === "bigbag2") return qty * (p.stoneCost?.bigBag2Kg ?? 1200);
  return qty;
}

/** Precio unitario de lista según la unidad elegida. */
export function listPrice(p: Product, unit: SaleUnit) {
  if (unit === "t") return round(p.price * 1000, 0);
  if (unit === "bolson")
    return p.stoneCost
      ? stoneCalc(p.stoneCost, p.bagKg ?? 25).priceBag
      : round(p.bagPrice ?? p.price * (p.bagKg ?? 25), 0);
  if (unit === "bigbag")
    return p.stoneCost
      ? stoneCalc(p.stoneCost, p.bagKg ?? 25).priceBig
      : round(p.price * bigBagKg(p), 0);
  if (unit === "bigbag2")
    return p.stoneCost ? stoneCalc(p.stoneCost, p.bagKg ?? 25).priceBig2 : round(p.price * 1200, 0);
  return p.price;
}

/** Costo unitario según la unidad elegida. */
export function unitCost(p: Product, unit: SaleUnit) {
  if (unit === "t") return p.cost * 1000;
  if (unit === "bolson") return p.cost * (p.bagKg ?? 25) + (p.stoneCost?.packagingPerBag ?? 0);
  if (unit === "bigbag") return p.cost * bigBagKg(p) + (p.stoneCost?.bigBagPackaging ?? 0);
  if (unit === "bigbag2")
    return p.cost * (p.stoneCost?.bigBag2Kg ?? 1200) + (p.stoneCost?.bigBagPackaging ?? 0);
  return p.cost;
}

/** Mejor descuento por cantidad aplicable. */
export function qtyDiscount(discounts: QtyDiscount[], qty: number, unit: SaleUnit) {
  let best = 0;
  for (const d of discounts) if (d.unit === unit && qty >= d.minQty && d.pct > best) best = d.pct;
  return best;
}

export function lineTotals(
  p: Product,
  qty: number,
  unit: SaleUnit,
  priceOverride?: number,
  discountPct?: number,
) {
  const unitPrice = priceOverride ?? listPrice(p, unit);
  const disc = discountPct ?? qtyDiscount(p.discounts, qty, unit);
  const subtotal = round(unitPrice * qty * (1 - disc / 100), 0);
  const cost = round(unitCost(p, unit) * qty, 0);
  return { unitPrice, discountPct: disc, subtotal, cost, baseQty: toBaseQty(p, qty, unit) };
}

/** Conversión útil para el mostrador: m² × espesor (cm) → kg aprox. (densidad 1,6 t/m³). */
export function stoneKgForArea(m2: number, thicknessCm: number, density = 1600) {
  return round(m2 * (thicknessCm / 100) * density, 0);
}

/** Nombre de la unidad con sus kilos, para elegir al vender: "bolsa 25 kg", "bolsón 1.000 kg". */
export function unitLabelFor(p: Product, unit: SaleUnit) {
  const kg = (n: number) => `${n.toLocaleString("es-AR")} kg`;
  if (unit === "bolson") return `bolsa ${kg(p.bagKg ?? 25)}`;
  if (unit === "bigbag") return `bolsón ${kg(bigBagKg(p))}`;
  if (unit === "bigbag2") return `bolsón ${kg(p.stoneCost?.bigBag2Kg ?? 1200)}`;
  return unitLabel[unit];
}
