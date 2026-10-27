import type { Product, QtyDiscount, SaleUnit, StoneCost } from "./types";

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Costo por tonelada sumando todos los componentes. */
export function stoneCostPerTon(c: StoneCost) {
  return c.purchasePerTon + c.freightPerTon + c.unloadPerTon + c.laborPerTon + c.extrasPerTon;
}

/** Calculadora completa de una piedra: costos y precios por kg, bolsón y tonelada. */
export function stoneCalc(c: StoneCost, bagKg: number) {
  const perTon = stoneCostPerTon(c);
  const perKg = perTon / 1000;
  const perBag = perKg * bagKg + c.packagingPerBag;
  const factor = 1 + c.marginPct / 100;
  const priceKg = perKg * factor;
  const priceBag = perBag * factor;
  const priceTon = perTon * factor;
  return {
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

/** Unidades en las que se puede vender cada producto. */
export function saleUnitsFor(p: Product): SaleUnit[] {
  if (p.category === "piedra") return ["kg", "bolson", "t"];
  if (p.category === "laja") return ["m2"];
  return ["u"];
}

export const unitLabel: Record<SaleUnit, string> = {
  kg: "kg",
  t: "tonelada",
  bolson: "bolsón",
  m2: "m²",
  u: "unidad",
};

const unitPlural: Record<SaleUnit, string> = {
  kg: "kg",
  t: "toneladas",
  bolson: "bolsones",
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
  return qty;
}

/** Precio unitario de lista según la unidad elegida. */
export function listPrice(p: Product, unit: SaleUnit) {
  if (unit === "t") return round(p.price * 1000, 0);
  if (unit === "bolson") return round(p.bagPrice ?? p.price * (p.bagKg ?? 25), 0);
  return p.price;
}

/** Costo unitario según la unidad elegida. */
export function unitCost(p: Product, unit: SaleUnit) {
  if (unit === "t") return p.cost * 1000;
  if (unit === "bolson") return p.cost * (p.bagKg ?? 25) + (p.stoneCost?.packagingPerBag ?? 0);
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
