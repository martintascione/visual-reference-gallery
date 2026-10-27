import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, Product, QtyDiscount, SaleUnit, StoneCost } from "@/lib/types";
import {
  marginOnPrice,
  markup,
  saleUnitsFor,
  simplePrice,
  stoneCalc,
  unitLabel,
} from "@/lib/pricing";
import { ars, ars2, uid } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Badge, Field, Input, Modal, NumberInput, Segmented, Select, btn } from "./ui-bits";

const categories: { value: Category; label: string }[] = [
  { value: "piedra", label: "Piedra / árido" },
  { value: "laja", label: "Laja (m²)" },
  { value: "liquido", label: "Líquido (bidón)" },
  { value: "unitario", label: "Unitario" },
];

export function blankProduct(
  cat: Category,
  s: { bagKg: number; packagingPerBag: number; unloadPerTon: number; ivaPct: number },
): Product {
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
      freightPerTon: 0,
      unloadPerTon: s.unloadPerTon,
      laborPerTon: 0,
      extrasPerTon: 0,
      packagingPerBag: s.packagingPerBag,
      marginPct: 40,
    };
  }
  if (cat === "liquido") base.liters = 10;
  return base;
}

export function ProductEditor({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const { db, upsertProduct } = useStore();
  const s = db.settings;
  const [p, setP] = useState<Product>(() => product ?? blankProduct("piedra", s));
  const [margin, setMargin] = useState(40);

  useEffect(() => {
    if (!open) return;
    const next = product ?? blankProduct("piedra", s);
    setP(structuredClone(next));
    setMargin(next.stoneCost?.marginPct ?? (next.cost ? markup(next.cost, next.price) : 40));
  }, [open, product, s]);

  const calc = useMemo(
    () =>
      p.category === "piedra" && p.stoneCost ? stoneCalc(p.stoneCost, p.bagKg ?? s.bagKg) : null,
    [p, s.bagKg],
  );

  // Para piedras, el precio siempre sale de la calculadora.
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
  };

  const lowMargin = marginOnPrice(p.cost, p.price) < s.minMarginPct;
  const canSave = p.name.trim().length > 1 && p.price > 0;

  const save = () => {
    upsertProduct({ ...p, name: p.name.trim() });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      wide
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label="Nombre">
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

        {p.category === "piedra" && p.stoneCost && calc && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-3xl bg-surface p-4">
              <p className="mb-3 text-xs font-semibold">Calculadora de costo · por tonelada</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Compra de la piedra">
                  <NumberInput
                    value={p.stoneCost.purchasePerTon}
                    onChange={(v) => setSC({ purchasePerTon: v })}
                  />
                </Field>
                <Field label="Flete que paga">
                  <NumberInput
                    value={p.stoneCost.freightPerTon}
                    onChange={(v) => setSC({ freightPerTon: v })}
                  />
                </Field>
                <Field label="Descarga" hint="Valor por defecto de Configuración">
                  <NumberInput
                    value={p.stoneCost.unloadPerTon}
                    onChange={(v) => setSC({ unloadPerTon: v })}
                  />
                </Field>
                <Field label="Embalaje por bolsón" hint="Solo suma al bolsón">
                  <NumberInput
                    value={p.stoneCost.packagingPerBag}
                    onChange={(v) => setSC({ packagingPerBag: v })}
                  />
                </Field>
                <Field label="Mano de obra (opcional)">
                  <NumberInput
                    value={p.stoneCost.laborPerTon}
                    onChange={(v) => setSC({ laborPerTon: v })}
                  />
                </Field>
                <Field label="Gastos extras (opcional)">
                  <NumberInput
                    value={p.stoneCost.extrasPerTon}
                    onChange={(v) => setSC({ extrasPerTon: v })}
                  />
                </Field>
                <Field label="Margen de ganancia %" hint="Sobre el costo">
                  <NumberInput
                    value={p.stoneCost.marginPct}
                    onChange={(v) => setSC({ marginPct: v })}
                  />
                </Field>
                <Field label="Kg por bolsón">
                  <NumberInput
                    value={p.bagKg ?? s.bagKg}
                    onChange={(v) => set({ bagKg: v || s.bagKg })}
                  />
                </Field>
              </div>
            </div>
            <div className="rounded-3xl bg-primary p-4 text-primary-foreground">
              <p className="mb-3 text-xs font-semibold opacity-80">Resultado</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] opacity-70">
                    <th className="pb-1 font-normal"></th>
                    <th className="pb-1 text-right font-normal">Costo</th>
                    <th className="pb-1 text-right font-normal">Precio</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <tr>
                    <td className="py-1">1 kg</td>
                    <td className="text-right opacity-80">{ars2(calc.costKg)}</td>
                    <td className="text-right font-semibold">{ars2(calc.priceKg)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Bolsón {p.bagKg ?? s.bagKg} kg</td>
                    <td className="text-right opacity-80">{ars(calc.costBag)}</td>
                    <td className="text-right font-semibold">{ars(calc.priceBag)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Tonelada</td>
                    <td className="text-right opacity-80">{ars(calc.costTon)}</td>
                    <td className="text-right font-semibold">{ars(calc.priceTon)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 border-t border-primary-foreground/20 pt-3 text-xs">
                <p className="flex justify-between">
                  <span className="opacity-70">Ganancia por bolsón</span>
                  <span className="font-semibold">{ars(calc.gainBag)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="opacity-70">Ganancia por tonelada</span>
                  <span className="font-semibold">{ars(calc.gainTon)}</span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span className="opacity-70">Margen sobre precio</span>
                  <span className="font-semibold">{calc.marginOnPrice}%</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {p.category !== "piedra" && (
          <div className="rounded-3xl bg-surface p-4">
            <p className="mb-3 text-xs font-semibold">
              Costo y precio · por{" "}
              {p.category === "laja" ? "m²" : p.category === "liquido" ? "bidón" : "unidad"}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.category === "liquido" && (
                <Field label="Litros por bidón">
                  <NumberInput value={p.liters ?? 0} onChange={(v) => set({ liters: v })} />
                </Field>
              )}
              <Field label="Costo">
                <NumberInput
                  value={p.cost}
                  onChange={(v) => set({ cost: v, price: simplePrice(v, margin) })}
                />
              </Field>
              <Field label="Margen %" hint="Sobre el costo">
                <NumberInput
                  value={margin}
                  onChange={(v) => {
                    setMargin(v);
                    set({ price: simplePrice(p.cost, v) });
                  }}
                />
              </Field>
              <Field label="Precio de venta" hint="Editable">
                <NumberInput
                  value={p.price}
                  onChange={(v) => {
                    set({ price: v });
                    setMargin(markup(p.cost, v));
                  }}
                />
              </Field>
              {p.category === "liquido" && p.liters ? (
                <div className="flex flex-col justify-end px-1 pb-2 text-xs text-muted-foreground">
                  <span>{ars(p.price / p.liters)} por litro</span>
                  <span>Ganancia {ars(p.price - p.cost)} por bidón</span>
                </div>
              ) : (
                <div className="flex flex-col justify-end px-1 pb-2 text-xs text-muted-foreground">
                  <span>Ganancia {ars(p.price - p.cost)}</span>
                  <span>Margen s/precio {marginOnPrice(p.cost, p.price)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {lowMargin && p.price > 0 && (
          <p className="rounded-2xl bg-danger-soft px-4 py-2 text-xs text-danger-soft-foreground">
            El margen sobre el precio queda por debajo del mínimo configurado ({s.minMarginPct}%).
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={`Stock actual (${p.unit === "m2" ? "m²" : p.unit})`}>
            <NumberInput value={p.stock} onChange={(v) => set({ stock: v })} />
          </Field>
          <Field label="Avisar cuando quede menos de">
            <NumberInput value={p.minStock} onChange={(v) => set({ minStock: v })} />
          </Field>
          <Field label="IVA %">
            <NumberInput value={p.ivaPct} onChange={(v) => set({ ivaPct: v })} />
          </Field>
        </div>

        <Discounts product={p} onChange={(discounts) => set({ discounts })} />

        <div className="flex justify-end gap-2">
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={!canSave} onClick={save}>
            Guardar producto
          </button>
        </div>
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
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold">Descuento por cantidad</p>
        <button type="button" className={btn.ghost} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Agregar escala
        </button>
      </div>
      {product.discounts.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Sin descuentos. Ej: desde 10 bolsones, 5% menos.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {product.discounts.map((d, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-xs"
          >
            <span className="text-muted-foreground">Desde</span>
            <NumberInput value={d.minQty} onChange={(v) => upd(i, { minQty: v })} className="h-8" />
            <Select
              value={d.unit}
              onChange={(e) => upd(i, { unit: e.target.value as SaleUnit })}
              className="h-8"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel[u]}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1">
              <NumberInput value={d.pct} onChange={(v) => upd(i, { pct: v })} className="h-8" />
              <span>%</span>
            </div>
            <button type="button" className={btn.icon} onClick={() => del(i)} aria-label="Quitar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryTabs({
  value,
  onChange,
}: {
  value: Category | "todos";
  onChange: (v: Category | "todos") => void;
}) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[{ value: "todos", label: "Todos" }, ...categories]}
    />
  );
}

export function StockBadge({ p }: { p: Product }) {
  if (p.stock <= 0) return <Badge tone="danger">Sin stock</Badge>;
  if (p.stock < p.minStock) return <Badge tone="danger">Stock bajo</Badge>;
  return <Badge tone="ok">OK</Badge>;
}
