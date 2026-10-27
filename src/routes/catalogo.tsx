import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, Pencil, Percent, Plus, Search } from "lucide-react";
import type { Category, Product } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, ars2, num } from "@/lib/format";
import { marginOnPrice, round, stoneCalc, stoneKgForArea } from "@/lib/pricing";
import {
  Badge,
  Card,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";
import { CategoryTabs, ProductEditor, StockBadge } from "@/components/product-editor";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo · Corralón" },
      { name: "description", content: "Productos, costos y precios con calculadora integrada." },
    ],
  }),
  component: Catalogo,
});

const unitName: Record<Product["unit"], string> = { kg: "kg", m2: "m²", l: "L", u: "u" };

function Catalogo() {
  const { db } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "todos">("todos");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [bulk, setBulk] = useState(false);
  const [calc, setCalc] = useState(false);

  const list = useMemo(
    () =>
      db.products
        .filter((p) => p.active)
        .filter((p) => cat === "todos" || p.category === cat)
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [db.products, cat, q],
  );

  const low = db.products.filter((p) => p.active && p.stock < p.minStock).length;

  return (
    <>
      <PageHeader
        title="Catálogo y precios"
        subtitle={`${db.products.filter((p) => p.active).length} productos · ${low} con stock bajo`}
      >
        <button className={btn.soft} onClick={() => setCalc(true)}>
          <Calculator className="h-4 w-4" strokeWidth={1.6} /> Calcular cantidad
        </button>
        <button className={btn.soft} onClick={() => setBulk(true)}>
          <Percent className="h-4 w-4" strokeWidth={1.6} /> Actualizar precios
        </button>
        <button className={btn.primary} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
      </PageHeader>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CategoryTabs value={cat} onChange={setCat} />
          <label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-full bg-surface px-4">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto"
              className="min-w-0 flex-1 bg-transparent text-sm outline-hidden"
            />
          </label>
        </div>
        <Table
          head={[
            "Producto",
            { label: "Costo", right: true },
            { label: "Precio", right: true },
            { label: "Bolsón", right: true },
            { label: "Margen", right: true },
            { label: "Stock", right: true },
            "",
            "",
          ]}
          min={760}
        >
          {list.map((p) => {
            const m = marginOnPrice(p.cost, p.price);
            return (
              <tr key={p.id} className={tr}>
                <td>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.category === "piedra"
                      ? "Piedra · por kg, bolsón o tonelada"
                      : p.category === "laja"
                        ? "Laja · por m²"
                        : p.category === "liquido"
                          ? `Bidón de ${p.liters} L`
                          : "Unitario"}
                    {p.discounts.length > 0 &&
                      ` · ${p.discounts.length} descuento${p.discounts.length > 1 ? "s" : ""}`}
                  </p>
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.unit === "kg" ? ars2(p.cost) : ars(p.cost)}/{unitName[p.unit]}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {p.unit === "kg" ? ars2(p.price) : ars(p.price)}/{unitName[p.unit]}
                </td>
                <td className="text-right tabular-nums">{p.bagPrice ? ars(p.bagPrice) : "—"}</td>
                <td className="text-right tabular-nums">
                  <Badge tone={m < db.settings.minMarginPct ? "danger" : "muted"}>{m}%</Badge>
                </td>
                <td className="text-right tabular-nums">
                  {num(p.stock)} {unitName[p.unit]}
                </td>
                <td>
                  <StockBadge p={p} />
                </td>
                <td className="text-right">
                  <button className={btn.icon} onClick={() => setEditing(p)} aria-label="Editar">
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
        {list.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay productos para mostrar.
          </p>
        )}
      </Card>

      <ProductEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        product={editing === "new" ? null : editing}
      />
      <BulkUpdate open={bulk} onClose={() => setBulk(false)} />
      <QtyCalculator open={calc} onClose={() => setCalc(false)} />
    </>
  );
}

function BulkUpdate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, upsertProduct } = useStore();
  const [cat, setCat] = useState<Category | "todos">("todos");
  const [pct, setPct] = useState(10);
  const [what, setWhat] = useState<"precio" | "costo">("precio");
  const targets = db.products.filter((p) => p.active && (cat === "todos" || p.category === cat));

  const apply = () => {
    const f = 1 + pct / 100;
    for (const p of targets) {
      if (what === "costo" && p.stoneCost) {
        const sc = {
          ...p.stoneCost,
          purchasePerTon: round(p.stoneCost.purchasePerTon * f),
          freightPerTon: round(p.stoneCost.freightPerTon * f),
        };
        const r = stoneCalc(sc, p.bagKg ?? db.settings.bagKg);
        upsertProduct({
          ...p,
          stoneCost: sc,
          cost: r.costKg,
          price: r.priceKg,
          bagPrice: r.priceBag,
        });
      } else if (what === "costo") {
        const margin = p.cost ? p.price / p.cost : 1;
        const cost = round(p.cost * f);
        upsertProduct({ ...p, cost, price: round(cost * margin) });
      } else if (p.stoneCost) {
        // subir el precio = subir el margen manteniendo el costo
        const r0 = stoneCalc(p.stoneCost, p.bagKg ?? db.settings.bagKg);
        const newMargin = round(((r0.priceKg * f) / r0.costKg - 1) * 100, 2);
        const sc = { ...p.stoneCost, marginPct: newMargin };
        const r = stoneCalc(sc, p.bagKg ?? db.settings.bagKg);
        upsertProduct({ ...p, stoneCost: sc, price: r.priceKg, bagPrice: r.priceBag });
      } else upsertProduct({ ...p, price: round(p.price * f) });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Actualizar precios en bloque">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Sirve para ajustar por inflación o por un cambio del proveedor sin editar producto por
          producto.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qué ajustar">
            <Select value={what} onChange={(e) => setWhat(e.target.value as "precio" | "costo")}>
              <option value="precio">Precio de venta</option>
              <option value="costo">Costo (recalcula precio)</option>
            </Select>
          </Field>
          <Field label="Categoría">
            <Select value={cat} onChange={(e) => setCat(e.target.value as Category | "todos")}>
              <option value="todos">Todas</option>
              <option value="piedra">Piedras</option>
              <option value="laja">Lajas</option>
              <option value="liquido">Líquidos</option>
              <option value="unitario">Unitarios</option>
            </Select>
          </Field>
          <Field label="Porcentaje" hint="Negativo para bajar">
            <NumberInput value={pct} onChange={setPct} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Se van a actualizar {targets.length} producto{targets.length === 1 ? "" : "s"}.
        </p>
        <div className="flex justify-end gap-2">
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={targets.length === 0 || !pct} onClick={apply}>
            Aplicar {pct > 0 ? "+" : ""}
            {pct}%
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Calculadora de mostrador: cuánta piedra y fijador necesita el cliente. */
function QtyCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useStore();
  const stones = db.products.filter((p) => p.active && p.category === "piedra");
  const [pid, setPid] = useState(stones[0]?.id ?? "");
  const [m2, setM2] = useState(10);
  const [cm, setCm] = useState(5);
  const p = stones.find((x) => x.id === pid) ?? stones[0];
  const kg = stoneKgForArea(m2, cm);
  const bags = p ? Math.ceil(kg / (p.bagKg ?? 25)) : 0;
  const liters = round(m2 * 0.5, 1); // referencia: ~0,5 L de fijador por m²
  const fix10 = db.products.find((x) => x.active && x.category === "liquido" && x.liters === 10);
  const fix5 = db.products.find((x) => x.active && x.category === "liquido" && x.liters === 5);

  return (
    <Modal open={open} onClose={onClose} title="Calcular cantidad para el cliente">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Piedra" className="col-span-3">
            <Select value={pid} onChange={(e) => setPid(e.target.value)}>
              {stones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Superficie (m²)">
            <NumberInput value={m2} onChange={setM2} />
          </Field>
          <Field label="Espesor (cm)">
            <NumberInput value={cm} onChange={setCm} />
          </Field>
        </div>
        {p && (
          <div className="rounded-3xl bg-primary p-4 text-sm text-primary-foreground">
            <p className="flex justify-between">
              <span className="opacity-70">Piedra necesaria</span>
              <span className="font-semibold">
                {num(kg)} kg · {round(kg / 1000, 2)} t
              </span>
            </p>
            <p className="mt-1 flex justify-between">
              <span className="opacity-70">En bolsones de {p.bagKg ?? 25} kg</span>
              <span className="font-semibold">
                {bags} bolsones · {ars(bags * (p.bagPrice ?? 0))}
              </span>
            </p>
            <p className="mt-1 flex justify-between">
              <span className="opacity-70">A granel</span>
              <span className="font-semibold">{ars(kg * p.price)}</span>
            </p>
            <p className="mt-3 flex justify-between border-t border-primary-foreground/20 pt-3">
              <span className="opacity-70">Fijador aprox.</span>
              <span className="font-semibold">
                {liters} L{fix10 && ` · ${Math.ceil(liters / 10)} × 10 L`}
                {fix5 &&
                  liters % 10 > 0 &&
                  liters % 10 <= 5 &&
                  ` o ${Math.floor(liters / 10)} × 10 L + 1 × 5 L`}
              </span>
            </p>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Referencias: densidad 1,6 t/m³ y 0,5 L de fijador por m². Conviene confirmar con el
          proveedor del fijador y ajustar en Configuración si hace falta.
        </p>
        <div className="flex justify-end">
          <button className={btn.primary} onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}
