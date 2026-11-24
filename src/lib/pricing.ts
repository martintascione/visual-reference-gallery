import type { Product, QtyDiscount, SaleUnit, StoneCost, StoneGroup } from "./types";

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
  // La bolsa chica puede tener un precio fijo minorista, sin importar los costos.
  const bagFixed = (c.bagFixedPrice ?? 0) > 0;
  const priceBag = bagFixed ? (c.bagFixedPrice ?? 0) : same ? priceKg * bagKg : perBag * factor;
  const priceTon = perTon * factor;
  const priceBig = same ? priceKg * bigKg : perBig * factor;
  const priceBig2 = same ? priceKg * big2Kg : perBig2 * factor;
  const tripKg = c.tripKg ?? 7000;
  return {
    bagFixed,
    /** Precio de venta por kg suelto (fijo si se cargó; si no, el de la fórmula). */
    retailKg: (c.kgFixedPrice ?? 0) > 0 ? (c.kgFixedPrice ?? 0) : round(priceKg),
    tripKg,
    costTrip: round(perKg * tripKg, 0),
    priceTrip: round(priceKg * tripKg, 0),
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

export const tripKgOf = (p: Product) => p.stoneCost?.tripKg ?? 7000;
export const stoneGroup = (p: Product): StoneGroup => p.stoneCost?.group ?? "decorativa";

/** Filtros del catálogo: las piedras se separan en decorativas, gravas y construcción. */
export type CatFilter =
  "todos" | "piedra" | "grava" | "construccion" | "laja" | "liquido" | "unitario";
export const catFilters: { value: CatFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "piedra", label: "Decorativas" },
  { value: "grava", label: "Gravas" },
  { value: "construccion", label: "Construcción" },
  { value: "laja", label: "Revestimiento" },
  { value: "liquido", label: "Líquido" },
  { value: "unitario", label: "Unitario" },
];
export function matchCat(p: Product, f: CatFilter) {
  if (f === "todos") return true;
  if (p.category !== "piedra") return p.category === f;
  // Piedras que se venden por tonelada pero van con los revestimientos (ex lajas), ej. voladura.
  if (stoneGroup(p) === "revestimiento") return f === "laja";
  return f === (stoneGroup(p) === "decorativa" ? "piedra" : stoneGroup(p));
}

/** Unidades en las que se puede vender cada producto. */
/** Todas las formas en que se puede vender una piedra, en el orden de su grupo (viaje primero). */
export function stoneUnitOptions(p: Product): SaleUnit[] {
  // El bolsón de 1.000 kg es lo mismo que la tonelada: solo se ofrece si pesa distinto (ej. 1.200 kg).
  const units: SaleUnit[] =
    stoneGroup(p) === "construccion" || stoneGroup(p) === "revestimiento"
      ? ["t", "bolson", "kg"]
      : ["kg", "bolson"];
  if (bigBagKg(p) !== 1000) units.push("bigbag");
  if ((p.stoneCost?.bigBag2Kg ?? 0) > 0) units.push("bigbag2");
  if (!units.includes("t")) units.push("t");
  return ["viaje", ...units];
}

export function saleUnitsFor(p: Product): SaleUnit[] {
  if (p.category === "piedra") {
    const all = stoneUnitOptions(p);
    const chosen = p.stoneCost?.units?.filter((u) => all.includes(u)) ?? [];
    // Sin elegir: todas menos el viaje (el viaje de chasis se marca solo en los que corresponde, ej. tierra).
    return chosen.length ? all.filter((u) => chosen.includes(u)) : all.filter((u) => u !== "viaje");
  }
  if (p.category === "laja") return ["m2"];
  if (p.category === "liquido" && (p.liters ?? 0) > 1) return ["u", "l"];
  return ["u"];
}

export const unitLabel: Record<SaleUnit, string> = {
  kg: "kg",
  t: "tonelada",
  bolson: "bolsa",
  bigbag: "bolsón",
  bigbag2: "bolsón grande",
  viaje: "viaje",
  m2: "m²",
  u: "unidad",
  l: "litro",
};

const unitPlural: Record<SaleUnit, string> = {
  kg: "kg",
  t: "toneladas",
  bolson: "bolsas",
  bigbag: "bolsones",
  bigbag2: "bolsones grandes",
  viaje: "viajes",
  m2: "m²",
  u: "unidades",
  l: "litros",
};

/** "12 bolsones", "1 tonelada", "2,5 t" según cantidad. */
export function qtyUnit(qty: number, unit: SaleUnit) {
  const n = qty.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return `${n} ${qty === 1 ? unitLabel[unit] : unitPlural[unit]}`;
}

/** Cantidad en unidad base (kg, m2, l, u) para descontar stock. */
/** Litro suelto: precio del bidón ÷ sus litros (regla de 3) + envase, redondeado al peso. */
export const literPrice = (p: Product) =>
  round(p.price / Math.max(1, p.liters ?? 1) + (p.bottleCost ?? 0), 0);

export function toBaseQty(p: Product, qty: number, unit: SaleUnit) {
  // El stock de líquidos es en bidones: un litro suelto descuenta la parte de un bidón.
  if (unit === "l") return qty / Math.max(1, p.liters ?? 1);
  if (unit === "t") return qty * 1000;
  if (unit === "bolson") return qty * (p.bagKg ?? 25);
  if (unit === "viaje") return qty * tripKgOf(p);
  if (unit === "bigbag") return qty * bigBagKg(p);
  if (unit === "bigbag2") return qty * (p.stoneCost?.bigBag2Kg ?? 1200);
  return qty;
}

/** Precio unitario de lista según la unidad elegida. */
export function listPrice(p: Product, unit: SaleUnit) {
  if (unit === "l") return literPrice(p);
  if (unit === "kg" && (p.stoneCost?.kgFixedPrice ?? 0) > 0) return p.stoneCost?.kgFixedPrice ?? 0;
  if (unit === "t") return round(p.price * 1000, 0);
  if (unit === "bolson")
    return p.stoneCost
      ? stoneCalc(p.stoneCost, p.bagKg ?? 25).priceBag
      : round(p.bagPrice ?? p.price * (p.bagKg ?? 25), 0);
  if (unit === "viaje")
    return p.stoneCost
      ? stoneCalc(p.stoneCost, p.bagKg ?? 25).priceTrip
      : round(p.price * tripKgOf(p), 0);
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
  if (unit === "l") return p.cost / Math.max(1, p.liters ?? 1) + (p.bottleCost ?? 0);
  if (unit === "t") return p.cost * 1000;
  if (unit === "bolson") return p.cost * (p.bagKg ?? 25) + (p.stoneCost?.packagingPerBag ?? 0);
  if (unit === "viaje") return p.cost * tripKgOf(p);
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
  if (unit === "viaje") return `viaje ${kg(tripKgOf(p))}`;
  if (unit === "l") return "litro suelto";
  if (unit === "u" && p.category === "liquido" && p.liters) return `bidón ${p.liters} L`;
  if (unit === "bolson") return `bolsa ${kg(p.bagKg ?? 25)}`;
  if (unit === "bigbag") return `bolsón ${kg(bigBagKg(p))}`;
  if (unit === "bigbag2") return `bolsón ${kg(p.stoneCost?.bigBag2Kg ?? 1200)}`;
  return unitLabel[unit];
}

/** Precios de venta de un producto, uno por cada forma en que se vende (para catálogo y lista de precios). */
export function productPrices(p: Product): { label: string; value: number; fixed?: boolean }[] {
  const kg = (n: number) => `${n.toLocaleString("es-AR")} kg`;
  if (p.category !== "piedra") {
    const label =
      p.category === "laja"
        ? "Por m²"
        : p.category === "liquido"
          ? `Bidón ${p.liters ?? ""} L`
          : "Unidad";
    if (p.category === "liquido" && (p.liters ?? 0) > 1)
      return [
        { label, value: p.price },
        { label: "Litro suelto", value: literPrice(p) },
      ];
    return [{ label, value: p.price }];
  }
  const out: { label: string; value: number; fixed?: boolean; unit: SaleUnit }[] = [];
  if ((p.stoneCost?.kgFixedPrice ?? 0) > 0)
    out.push({ label: "Por kg", value: listPrice(p, "kg"), fixed: true, unit: "kg" });
  out.push({
    label: `Bolsa ${kg(p.bagKg ?? 25)}`,
    value: listPrice(p, "bolson"),
    fixed: (p.stoneCost?.bagFixedPrice ?? 0) > 0,
    unit: "bolson",
  });
  if (bigBagKg(p) !== 1000)
    out.push({ label: `Bolsón ${kg(bigBagKg(p))}`, value: listPrice(p, "bigbag"), unit: "bigbag" });
  if ((p.stoneCost?.bigBag2Kg ?? 0) > 0)
    out.push({
      label: `Bolsón ${kg(p.stoneCost?.bigBag2Kg ?? 0)}`,
      value: listPrice(p, "bigbag2"),
      unit: "bigbag2",
    });
  out.push({ label: "Tonelada", value: listPrice(p, "t"), unit: "t" });
  out.push({ label: `Viaje ${kg(tripKgOf(p))}`, value: listPrice(p, "viaje"), unit: "viaje" });
  // Solo las formas en que se vende ese producto.
  const ok = saleUnitsFor(p);
  return out.filter((x) => ok.includes(x.unit)).map(({ unit: _u, ...x }) => x);
}
