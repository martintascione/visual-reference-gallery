import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, Product, QtyDiscount, SaleUnit, StoneCost } from "@/lib/types";
import {
  type CatFilter,
  catFilters,
  marginOnPrice,
  markup,
  saleUnitsFor,
  simplePrice,
  stoneCalc,
  unitLabel,
} from "@/lib/pricing";
import { ars, ars2, pctAr, uid } from "@/lib/format";
import { useStore } from "@/lib/store";
import {
  Badge,
  Field,
  FormSection,
  Toggle,
  HelpTip,
  Input,
  Modal,
  NumberInput,
  Segmented,
  Select,
  btn,
} from "./ui-bits";

const categories: { value: Category; label: string }[] = [
  { value: "piedra", label: "Piedra / árido" },
  { value: "laja", label: "Laja (m²)" },
  { value: "liquido", label: "Líquido (bidón)" },
  { value: "unitario", label: "Unitario" },
];

type Defaults = {
  bagKg: number;
  packagingPerBag: number;
  unloadPerTon: number;
  freightPerTon?: number | undefined;
  ivaPct: number;
  bigBagKg?: number | undefined;
  bigBagPackaging?: number | undefined;
  baseExpensePerTon?: number | undefined;
  bagFixedDefaults?: { decorativa?: number; grava?: number; construccion?: number } | undefined;
  defaultMarginPct?: number | undefined;
};

export function blankProduct(cat: Category, s: Defaults): Product {
  const base: Product = {
    id: uid(),
    name: "",
    category: cat,
    unit: cat === "piedra" ? "kg" : cat === "laja" ? "m2" : "u",
    cost: 0,
    price: 0,
    stock: 0,
    minStock: 0,
    ivaPct: s.ivaPct,
    discounts: [],
    active: true,
  };
  if (cat === "piedra") {
    base.bagKg = s.bagKg;
    base.stoneCost = {
      purchasePerTon: 0,
      freightPerTon: s.freightPerTon ?? 0,
      unloadPerTon: s.unloadPerTon,
      laborPerTon: 0,
      extrasPerTon: 0,
      packagingPerBag: s.packagingPerBag,
      marginPct: s.defaultMarginPct ?? 40,
      bigBagKg: s.bigBagKg ?? 1000,
      bigBagPackaging: s.bigBagPackaging ?? 0,
      basePerTon: s.baseExpensePerTon ?? 0,
      bagFixedPrice: s.bagFixedDefaults?.decorativa || undefined,
    };
  }
  if (cat === "liquido") base.liters = 10;
  return base;
}

export function ProductEditor({
  open,
  onClose,
  product,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  prefill?: Product | null | undefined;
}) {
  const { db, upsertProduct } = useStore();
  const s = db.settings;
  const [p, setP] = useState<Product>(() => product ?? blankProduct("piedra", s));
  const [margin, setMargin] = useState(s.defaultMarginPct ?? 40);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = product ?? prefill ?? blankProduct("piedra", s);
    setP(structuredClone(next));
    setMargin(
      next.stoneCost?.marginPct ??
        (next.cost ? markup(next.cost, next.price) : (s.defaultMarginPct ?? 40)),
    );
  }, [open, product, prefill, s]);

  const calc = useMemo(
    () =>
      p.category === "piedra" && p.stoneCost ? stoneCalc(p.stoneCost, p.bagKg ?? s.bagKg) : null,
    [p, s.bagKg],
  );

  // Para piedras el precio sale siempre de la calculadora.
  useEffect(() => {
    if (calc)
      setP((x) =>
        x.price === calc.priceKg && x.bagPrice === calc.priceBag && x.cost === calc.costKg
          ? x
          : { ...x, cost: calc.costKg, price: calc.priceKg, bagPrice: calc.priceBag },
      );
  }, [calc]);

  const set = (patch: Partial<Product>) => setP((x) => ({ ...x, ...patch }));
  const setSC = (patch: Partial<StoneCost>) =>
    setP((x) => ({ ...x, stoneCost: { ...(x.stoneCost as StoneCost), ...patch } }));
  const changeCategory = (cat: Category) => {
    const b = blankProduct(cat, s);
    setP((x) => ({ ...b, id: x.id, name: x.name, stock: x.stock, minStock: x.minStock }));
    setMargin(s.defaultMarginPct ?? 40);
  };

  // Factor para cargar el precio del proveedor por bolsón en las gravas (1.200 kg → 1,2).
  const gravaK = p.stoneCost?.group === "grava" ? (p.stoneCost.bigBagKg ?? 1200) / 1000 : 1;
  const lowMargin = p.price > 0 && marginOnPrice(p.cost, p.price) < s.minMarginPct;
  const canSave = p.name.trim().length > 1 && p.price > 0;
  const unitName =
    p.unit === "m2"
      ? "m²"
      : p.unit === "u"
        ? p.category === "liquido"
          ? "bidones"
          : "unidades"
        : p.unit;

  const save = () => {
    upsertProduct({ ...p, name: p.name.trim() });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      subtitle={
        p.category === "piedra"
          ? "Cargá el precio del proveedor y el margen: el precio de venta se arma solo. Todos los precios son sin IVA."
          : "Cargá el costo y el margen: el precio de venta se arma solo. Todos los precios son sin IVA."
      }
      wide
      footer={
        <>
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!canSave} onClick={save}>
            {product ? "Guardar cambios" : "Guardar producto"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Datos básicos */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field label="Nombre del producto">
            <Input
              value={p.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Ej: Piedra blanca decorativa"
              autoFocus
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={p.category}
              onChange={(e) => changeCategory(e.target.value as Category)}
              disabled={!!product}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Costo y precio */}
        {p.category === "piedra" && p.stoneCost && calc ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <FormSection
              title="Costo por tonelada"
              hint="Los valores por defecto vienen de Configuración"
            >
              <div className="mb-4">
                <Segmented
                  value={p.stoneCost.group ?? "decorativa"}
                  onChange={(g) =>
                    setSC({
                      group: g,
                      // Gravas: bolsón de 1.200 kg. Construcción: se vende por viaje de 7.000 kg.
                      bigBagKg: g === "grava" ? 1200 : 1000,
                      bigBag2Kg: undefined,
                      ...(product ? {} : { bagFixedPrice: s.bagFixedDefaults?.[g] || undefined }),
                      tripKg: g === "construccion" ? (p.stoneCost?.tripKg ?? 7000) : undefined,
                    })
                  }
                  options={[
                    { value: "decorativa", label: "Decorativa" },
                    { value: "grava", label: "Grava" },
                    { value: "construccion", label: "Construcción" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                {/* Gravas: el precio se carga por bolsón de 1.200 kg o por tonelada; el otro se completa solo. */}
                {gravaK !== 1 ? (
                  <>
                    <Field
                      label={`Proveedor · por ${(gravaK * 1000).toLocaleString("es-AR")} kg`}
                      help="Precio de lista de la cantera por bolsón. Si cargás este, el precio por tonelada se calcula solo."
                    >
                      <NumberInput
                        value={Math.round((p.stoneCost.purchasePerTon ?? 0) * gravaK * 100) / 100}
                        onChange={(v) => setSC({ purchasePerTon: v / gravaK })}
                        prefix="$"
                        className="h-11 text-base font-semibold"
                      />
                    </Field>
                    <Field
                      label="Proveedor · por tonelada"
                      help="Si ya tenés el valor por tonelada, cargalo acá y el precio por bolsón se calcula solo."
                    >
                      <NumberInput
                        value={Math.round((p.stoneCost.purchasePerTon ?? 0) * 100) / 100}
                        onChange={(v) => setSC({ purchasePerTon: v })}
                        prefix="$"
                        suffix="/ t"
                        className="h-11 text-base font-semibold"
                      />
                    </Field>
                    <p className="col-span-2 -mt-2 px-1 text-[11px] text-muted-foreground">
                      Cargá cualquiera de los dos: el otro se completa solo.
                    </p>
                  </>
                ) : (
                  <Field label="Precio del proveedor" className="col-span-2">
                    <NumberInput
                      value={p.stoneCost.purchasePerTon ?? 0}
                      onChange={(v) => setSC({ purchasePerTon: v })}
                      prefix="$"
                      suffix="/ t"
                      className="h-11 text-base font-semibold"
                    />
                  </Field>
                )}
                <Field label="Flete">
                  <NumberInput
                    value={p.stoneCost.freightPerTon ?? 0}
                    onChange={(v) => setSC({ freightPerTon: v })}
                    prefix="$"
                    suffix="/ t"
                  />
                </Field>
                <Field label="Descarga">
                  <NumberInput
                    value={p.stoneCost.unloadPerTon ?? 0}
                    onChange={(v) => setSC({ unloadPerTon: v })}
                    prefix="$"
                    suffix="/ t"
                  />
                </Field>
                <Field label="Base de gastos">
                  <NumberInput
                    value={p.stoneCost.basePerTon ?? 0}
                    onChange={(v) => setSC({ basePerTon: v })}
                    prefix="$"
                    suffix="/ t"
                  />
                </Field>
                <Field label="Margen de ganancia" hint="Para bolsón y tonelada">
                  <NumberInput
                    value={p.stoneCost.marginPct}
                    onChange={(v) => setSC({ marginPct: v })}
                    suffix="%"
                  />
                </Field>
                <Field label="Precio fijo de la bolsa" hint="Minorista. Vacío = por fórmula">
                  <NumberInput
                    value={p.stoneCost.bagFixedPrice ?? 0}
                    onChange={(v) => setSC({ bagFixedPrice: v || undefined })}
                    prefix="$"
                  />
                </Field>
                <Field label="Precio fijo por kg" hint="Suelto. Vacío = por fórmula">
                  <NumberInput
                    value={p.stoneCost.kgFixedPrice ?? 0}
                    onChange={(v) => setSC({ kgFixedPrice: v || undefined })}
                    prefix="$"
                  />
                </Field>
              </div>
              <button
                type="button"
                className="mt-4 flex w-full items-center justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setMore((v) => !v)}
              >
                <span>Más costos y medidas (palet, Sampi, desperdicio, bolsas)</span>
                <span>{more ? "Ocultar" : "Mostrar"}</span>
              </button>
              {more && (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
                  <Field label="Palet">
                    <NumberInput
                      value={p.stoneCost.palletPerTon ?? 0}
                      onChange={(v) => setSC({ palletPerTon: v })}
                      prefix="$"
                      suffix="/ t"
                    />
                  </Field>
                  <Field label="Sampi">
                    <NumberInput
                      value={p.stoneCost.sampiPerTon ?? 0}
                      onChange={(v) => setSC({ sampiPerTon: v })}
                      prefix="$"
                      suffix="/ t"
                    />
                  </Field>
                  <Field label="Mano de obra">
                    <NumberInput
                      value={p.stoneCost.laborPerTon ?? 0}
                      onChange={(v) => setSC({ laborPerTon: v })}
                      prefix="$"
                      suffix="/ t"
                    />
                  </Field>
                  <Field label="Otros gastos">
                    <NumberInput
                      value={p.stoneCost.extrasPerTon ?? 0}
                      onChange={(v) => setSC({ extrasPerTon: v })}
                      prefix="$"
                      suffix="/ t"
                    />
                  </Field>
                  <Field label="Desperdicio">
                    <NumberInput
                      value={p.stoneCost.wastePct ?? 0}
                      onChange={(v) => setSC({ wastePct: Math.min(90, Math.max(0, v)) })}
                      suffix="%"
                    />
                  </Field>
                  <Field label="Kg por bolsa">
                    <NumberInput
                      value={p.bagKg ?? s.bagKg}
                      onChange={(v) => set({ bagKg: v || s.bagKg })}
                      suffix="kg"
                    />
                  </Field>
                  <Field label="Embalaje por bolsa">
                    <NumberInput
                      value={p.stoneCost.packagingPerBag}
                      onChange={(v) => setSC({ packagingPerBag: v })}
                      prefix="$"
                    />
                  </Field>
                  <Field label="Kg por bolsón">
                    <NumberInput
                      value={p.stoneCost.bigBagKg ?? s.bigBagKg ?? 1000}
                      onChange={(v) => setSC({ bigBagKg: v || (s.bigBagKg ?? 1000) })}
                      suffix="kg"
                    />
                  </Field>
                  <Field label="Embalaje por bolsón">
                    <NumberInput
                      value={p.stoneCost.bigBagPackaging ?? 0}
                      onChange={(v) => setSC({ bigBagPackaging: v })}
                      prefix="$"
                    />
                  </Field>
                  {p.stoneCost.group === "construccion" && (
                    <Field label="Kg por viaje" hint="Chasis completo">
                      <NumberInput
                        value={p.stoneCost.tripKg ?? 7000}
                        onChange={(v) => setSC({ tripKg: v || 7000 })}
                        suffix="kg"
                      />
                    </Field>
                  )}
                  <Field label="Segundo bolsón" hint="Otro tamaño. Vacío = no se vende">
                    <NumberInput
                      value={p.stoneCost.bigBag2Kg ?? 0}
                      onChange={(v) => setSC({ bigBag2Kg: v || undefined })}
                      suffix="kg"
                    />
                  </Field>
                  <div className="col-span-full">
                    <Toggle
                      checked={p.stoneCost.bagSamePerKg !== false}
                      onChange={(v) => setSC({ bagSamePerKg: v })}
                      label="Bolsa y bolsón al mismo precio por kilo que la tonelada"
                    />
                  </div>
                </div>
              )}
            </FormSection>

            <div className="flex flex-col rounded-3xl bg-primary p-4 text-primary-foreground">
              <p className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
                Precio de venta
                <span className="text-[10px] font-normal opacity-70">sin IVA</span>
                <HelpTip
                  className="border-primary-foreground/40 text-primary-foreground hover:border-primary-foreground hover:text-primary-foreground"
                  title="Precio de venta"
                  text="Precios de lista sin IVA: el IVA se agrega solo cuando se emite Factura A. 'Ganás' es la diferencia con el costo. 'Margen sobre el precio' es qué parte del precio es ganancia."
                />
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  {
                    l: p.stoneCost?.kgFixedPrice ? "Por kg · precio fijo" : "Por kg",
                    c: ars2(calc.costKg),
                    v: p.stoneCost?.kgFixedPrice ? ars(calc.retailKg) : ars2(calc.priceKg),
                  },
                  {
                    l: `Bolsa de ${(p.bagKg ?? s.bagKg).toLocaleString("es-AR")} kg${calc.bagFixed ? " · precio fijo" : ""}`,
                    c: ars(calc.costBag),
                    v: ars(calc.priceBag),
                    big: p.stoneCost?.group !== "construccion",
                  },
                  ...(calc.bigKg !== 1000
                    ? [
                        {
                          l: `Bolsón de ${calc.bigKg.toLocaleString("es-AR")} kg`,
                          c: ars(calc.costBig),
                          v: ars(calc.priceBig),
                        },
                      ]
                    : []),
                  ...(calc.big2Kg > 0
                    ? [
                        {
                          l: `Bolsón de ${calc.big2Kg.toLocaleString("es-AR")} kg`,
                          c: ars(calc.costBig2),
                          v: ars(calc.priceBig2),
                        },
                      ]
                    : []),
                  {
                    l: calc.bigKg === 1000 ? "Por tonelada o bolsón de 1.000 kg" : "Por tonelada",
                    c: ars(calc.costTon),
                    v: ars(calc.priceTon),
                  },
                  ...(p.stoneCost?.group === "construccion"
                    ? [
                        {
                          l: `Por viaje · chasis de ${calc.tripKg.toLocaleString("es-AR")} kg`,
                          c: ars(calc.costTrip),
                          v: ars(calc.priceTrip),
                          big: true,
                        },
                      ]
                    : []),
                ].map((r) => (
                  <div
                    key={r.l}
                    className={`rounded-2xl bg-primary-foreground/10 px-3 py-2 ${"big" in r && r.big ? "ring-1 ring-primary-foreground/30" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs opacity-80">{r.l}</span>
                      <span
                        className={`font-bold tabular-nums ${"big" in r && r.big ? "text-xl" : "text-base"}`}
                      >
                        {r.v}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-60">costo {r.c}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto space-y-1 pt-4 text-xs">
                <p className="flex justify-between">
                  <span className="opacity-70">Ganás por bolsa</span>
                  <span className="font-semibold tabular-nums">{ars(calc.gainBag)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="opacity-70">Ganás por tonelada</span>
                  <span className="font-semibold tabular-nums">{ars(calc.gainTon)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="opacity-70">Margen sobre el precio</span>
                  <span className="font-semibold tabular-nums">{pctAr(calc.marginOnPrice)}</span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <FormSection
            title={`Costo y precio · por ${p.category === "laja" ? "m²" : p.category === "liquido" ? "bidón" : "unidad"}`}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-5">
              {p.category === "liquido" && (
                <Field label="Litros por bidón">
                  <NumberInput
                    value={p.liters ?? 0}
                    onChange={(v) => set({ liters: v })}
                    suffix="L"
                  />
                </Field>
              )}
              <Field label="Costo">
                <NumberInput
                  value={p.cost - (p.freight ?? 0)}
                  onChange={(v) => {
                    const cost = v + (p.freight ?? 0);
                    set({ cost, price: simplePrice(cost, margin) });
                  }}
                  prefix="$"
                />
              </Field>
              <Field label="Flete por unidad" hint="Se suma al costo">
                <NumberInput
                  value={p.freight ?? 0}
                  onChange={(v) => {
                    const cost = p.cost - (p.freight ?? 0) + v;
                    set({ freight: v || undefined, cost, price: simplePrice(cost, margin) });
                  }}
                  prefix="$"
                />
              </Field>
              <Field label="Margen" hint="Sobre el costo">
                <NumberInput
                  value={margin}
                  onChange={(v) => {
                    setMargin(v);
                    set({ price: simplePrice(p.cost, v) });
                  }}
                  suffix="%"
                />
              </Field>
              <Field label="Precio de venta" hint="Se puede ajustar a mano">
                <NumberInput
                  value={p.price}
                  onChange={(v) => {
                    set({ price: v });
                    setMargin(markup(p.cost, v));
                  }}
                  prefix="$"
                  className="font-semibold"
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>
                Ganás <b className="text-foreground">{ars(p.price - p.cost)}</b> por{" "}
                {p.category === "laja" ? "m²" : p.category === "liquido" ? "bidón" : "unidad"}
              </span>
              <span>
                Margen sobre el precio{" "}
                <b className="text-foreground">{pctAr(marginOnPrice(p.cost, p.price))}</b>
              </span>
              {p.category === "liquido" && !!p.liters && (
                <span>
                  Equivale a <b className="text-foreground">{ars(p.price / p.liters)}</b> por litro
                </span>
              )}
            </div>
          </FormSection>
        )}

        {lowMargin && (
          <p className="rounded-2xl bg-danger-soft px-4 py-2.5 text-xs text-danger-soft-foreground">
            El margen sobre el precio queda por debajo del mínimo configurado (
            {pctAr(s.minMarginPct)}). Se puede guardar igual.
          </p>
        )}

        {/* Stock */}
        <FormSection title="Stock y avisos">
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
            <Field label="Stock actual">
              <NumberInput value={p.stock} onChange={(v) => set({ stock: v })} suffix={unitName} />
            </Field>
            <Field label="Avisar cuando quede menos de">
              <NumberInput
                value={p.minStock}
                onChange={(v) => set({ minStock: v })}
                suffix={unitName}
              />
            </Field>
          </div>
        </FormSection>

        <Discounts product={p} onChange={(discounts) => set({ discounts })} />
      </div>
    </Modal>
  );
}

function Discounts({
  product,
  onChange,
}: {
  product: Product;
  onChange: (d: QtyDiscount[]) => void;
}) {
  const units = saleUnitsFor(product);
  const add = () =>
    onChange([
      ...product.discounts,
      { minQty: 10, unit: (units[units.length - 1] ?? "u") as SaleUnit, pct: 5 },
    ]);
  const upd = (i: number, patch: Partial<QtyDiscount>) =>
    onChange(product.discounts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const del = (i: number) => onChange(product.discounts.filter((_, j) => j !== i));
  return (
    <FormSection title="Descuento por cantidad" hint="Opcional. Ej: desde 10 bolsones, 5% menos">
      <div className="flex flex-col gap-2">
        {product.discounts.map((d, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">Desde</span>
            <NumberInput value={d.minQty} onChange={(v) => upd(i, { minQty: v })} />
            <Select value={d.unit} onChange={(e) => upd(i, { unit: e.target.value as SaleUnit })}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel[u]}
                </option>
              ))}
            </Select>
            <NumberInput value={d.pct} onChange={(v) => upd(i, { pct: v })} suffix="%" />
            <button type="button" className={btn.icon} onClick={() => del(i)} aria-label="Quitar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" className={`${btn.ghost} self-start`} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Agregar escala
        </button>
      </div>
    </FormSection>
  );
}

export function CategoryTabs({
  value,
  onChange,
}: {
  value: CatFilter;
  onChange: (v: CatFilter) => void;
}) {
  return <Segmented value={value} onChange={onChange} options={catFilters} />;
}

export function StockBadge({ p }: { p: Product }) {
  if (p.stock <= 0) return <Badge tone="danger">Sin stock</Badge>;
  if (p.stock < p.minStock) return <Badge tone="danger">Stock bajo</Badge>;
  return <Badge tone="ok">OK</Badge>;
}
