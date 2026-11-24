import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calculator, List, Pencil, Percent, Plus, Search } from "lucide-react";
import { PriceList } from "@/components/price-list";
import type { Category, Product } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, num, pctAr } from "@/lib/format";
import {
  type CatFilter,
  listPrice,
  marginOnPrice,
  matchCat,
  productPrices,
  round,
  simplePrice,
  stoneCalc,
  stoneGroup,
  bigBagKg,
  saleUnitsFor,
  tripKgOf,
} from "@/lib/pricing";
import {
  Badge,
  Card,
  Empty,
  Field,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";
import { CategoryTabs, ProductEditor, StockBadge, blankProduct } from "@/components/product-editor";

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
  const { db, pendingAction, setPendingAction } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatFilter>("todos");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [bulk, setBulk] = useState(false);
  const [calc, setCalc] = useState(false);
  const [priceList, setPriceList] = useState(false);
  const [prefill, setPrefill] = useState<Product | null>(null);

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction.tipo === "nuevo_producto") {
      const a = pendingAction;
      const p = blankProduct(a.categoria ?? "piedra", db.settings);
      if (a.nombre) p.name = a.nombre;
      if (p.stoneCost) {
        if (a.precio_proveedor) p.stoneCost.purchasePerTon = a.precio_proveedor;
        if (a.margen) p.stoneCost.marginPct = a.margen;
      } else if (a.precio_proveedor) {
        p.cost = a.precio_proveedor;
        p.price = simplePrice(a.precio_proveedor, a.margen ?? db.settings.defaultMarginPct ?? 40);
      }
      setPrefill(p);
      setEditing("new");
      setPendingAction(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  const list = useMemo(
    () =>
      db.products
        .filter((p) => p.active)
        .filter((p) => matchCat(p, cat))
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
        <button data-tour="lista-precios" className={btn.soft} onClick={() => setPriceList(true)}>
          <List className="h-4 w-4" strokeWidth={1.6} /> Lista de precios
        </button>
        <button className={btn.soft} onClick={() => setCalc(true)}>
          <Calculator className="h-4 w-4" strokeWidth={1.6} /> Calcular cantidad
        </button>
        <button className={btn.soft} onClick={() => setBulk(true)}>
          <Percent className="h-4 w-4" strokeWidth={1.6} /> Actualizar precios
        </button>
        <button
          data-tour="catalogo-nuevo"
          className={btn.primary}
          onClick={() => setEditing("new")}
        >
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
            "Precios de venta (sin IVA)",
            { label: "Costo", right: true },
            { label: "Margen", right: true },
            { label: "Stock", right: true },
            "",
            "",
          ]}
          min={900}
        >
          {list.map((p) => {
            const m = marginOnPrice(p.cost, p.price);
            return (
              <tr key={p.id} className={tr}>
                <td className="max-w-[240px]">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.category === "piedra"
                      ? stoneGroup(p) === "construccion"
                        ? "Construcción"
                        : stoneGroup(p) === "grava"
                          ? "Grava"
                          : stoneGroup(p) === "revestimiento"
                            ? "Revestimiento · por tonelada"
                            : "Piedra decorativa"
                      : p.category === "laja"
                        ? "Revestimiento"
                        : p.category === "liquido"
                          ? "Líquido"
                          : "Unitario"}
                    {p.discounts.length > 0 &&
                      ` · ${p.discounts.length} descuento${p.discounts.length > 1 ? "s" : ""}`}
                  </p>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {productPrices(p).map((x) => (
                      <span
                        key={x.label}
                        className="inline-flex min-w-[92px] flex-col rounded-2xl bg-surface px-3 py-1.5"
                        title={x.fixed ? "Precio fijo minorista" : "Calculado con costos y margen"}
                      >
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {x.label}
                          {x.fixed ? " · fijo" : ""}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{ars(x.value)}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.unit === "kg"
                    ? `${ars(p.cost * 1000)}/t`
                    : `${ars(p.cost)}/${unitName[p.unit]}`}
                </td>
                <td className="text-right tabular-nums">
                  <Badge tone={m < db.settings.minMarginPct ? "danger" : "muted"}>{pctAr(m)}</Badge>
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
          <Empty
            title={db.products.some((p) => p.active) ? "Nada por acá" : "Todavía no hay productos"}
            text={
              db.products.some((p) => p.active)
                ? "Probá con otra búsqueda o categoría."
                : "Cargá tu primer producto con el precio del proveedor: la calculadora arma el precio de venta por kg, bolsón y tonelada."
            }
            action={
              !db.products.some((p) => p.active) && (
                <button className={btn.primary} onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> Cargar primer producto
                </button>
              )
            }
          />
        )}
      </Card>

      <ProductEditor
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setPrefill(null);
        }}
        product={editing === "new" ? null : editing}
        prefill={editing === "new" ? prefill : null}
      />
      <BulkUpdate open={bulk} onClose={() => setBulk(false)} />
      <QtyCalculator open={calc} onClose={() => setCalc(false)} />
      <PriceList open={priceList} onClose={() => setPriceList(false)} />
    </>
  );
}

function BulkUpdate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, upsertProduct } = useStore();
  const [cat, setCat] = useState<CatFilter>("todos");
  const [pct, setPct] = useState(10);
  const [what, setWhat] = useState<"precio" | "costo">("precio");
  const targets = db.products.filter((p) => p.active && matchCat(p, cat));

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
            <Select value={cat} onChange={(e) => setCat(e.target.value as CatFilter)}>
              <option value="todos">Todas</option>
              <option value="piedra">Piedras</option>
              <option value="laja">Revestimientos</option>
              <option value="liquido">Líquidos</option>
              <option value="unitario">Unitarios</option>
            </Select>
          </Field>
          <Field label="Porcentaje" hint="Negativo para bajar">
            <NumberInput value={pct} onChange={setPct} suffix="%" />
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
            {num(pct, 1)}%
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Calculadora de mostrador: con las medidas del lugar, cuánta piedra y fijador necesita el cliente. */
function QtyCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, updateSettings } = useStore();
  const s = db.settings;
  const stones = db.products
    .filter((p) => p.active && p.category === "piedra")
    .sort((a, b) => a.name.localeCompare(b.name));
  const liquids = db.products
    .filter((p) => p.active && p.category === "liquido" && (p.liters ?? 0) > 0)
    .sort((a, b) => (b.liters ?? 0) - (a.liters ?? 0));
  const [pid, setPid] = useState(stones[0]?.id ?? "");
  const blankArea = () => ({ id: Math.random().toString(36).slice(2), l: 0, a: 0 });
  const [areas, setAreas] = useState([{ ...blankArea(), l: 2, a: 2 }]);
  const [cm, setCm] = useState(5);
  const density = s.stoneDensity ?? 1500;
  const lpm2 = s.fixerLitersPerM2 ?? 1;
  const p = stones.find((x) => x.id === pid) ?? stones[0];

  const m2 = round(
    areas.reduce((t, x) => t + x.l * x.a, 0),
    2,
  );
  const m3 = round((m2 * cm) / 100, 3);
  const kg = round(m3 * density, 0);
  const tons = kg / 1000;

  // Formas de venderlo, con la cantidad que alcanza y el precio.
  const options: { label: string; qty: string; price: number }[] = [];
  if (p && kg > 0) {
    const units = saleUnitsFor(p);
    const bag = p.bagKg ?? 25;
    const n = Math.ceil(kg / bag);
    options.push({
      label: `Bolsas de ${num(bag)} kg`,
      qty: `${n} bolsas`,
      price: n * listPrice(p, "bolson"),
    });
    if (units.includes("bigbag")) {
      const n2 = Math.ceil(kg / bigBagKg(p));
      options.push({
        label: `Bolsón de ${num(bigBagKg(p))} kg`,
        qty: `${n2} ${n2 === 1 ? "bolsón" : "bolsones"}`,
        price: n2 * listPrice(p, "bigbag"),
      });
    }
    if (units.includes("bigbag2")) {
      const k2 = p.stoneCost?.bigBag2Kg ?? 1200;
      const n3 = Math.ceil(kg / k2);
      options.push({
        label: `Bolsón de ${num(k2)} kg`,
        qty: `${n3} ${n3 === 1 ? "bolsón" : "bolsones"}`,
        price: n3 * listPrice(p, "bigbag2"),
      });
    }
    options.push({
      label: "Por tonelada",
      qty: `${num(round(tons, 2), 2)} t`,
      price: round(tons * listPrice(p, "t"), 0),
    });
    if (units.includes("viaje")) {
      const v = Math.ceil(kg / tripKgOf(p));
      options.push({
        label: `Por viaje (${num(tripKgOf(p))} kg)`,
        qty: `${v} ${v === 1 ? "viaje" : "viajes"}`,
        price: v * listPrice(p, "viaje"),
      });
    }
    if ((p.stoneCost?.kgFixedPrice ?? 0) > 0)
      options.push({
        label: "Por kg (precio fijo)",
        qty: `${num(kg)} kg`,
        price: kg * listPrice(p, "kg"),
      });
  }

  // Fijador: litros por m² y la combinación de bidones que alcanza.
  const liters = round(m2 * lpm2, 1);
  // La combinación de bidones más barata que cubre los litros (ej. 4 L: un bidón de 5 L si sale menos que cuatro de 1 L).
  const combo: { p: Product; n: number }[] = [];
  if (liters > 0 && liquids.length) {
    const T = Math.ceil(liters);
    const sizes = liquids.map((l) => Math.max(1, Math.round(l.liters ?? 1)));
    const max = T + Math.max(...sizes);
    const cost: number[] = Array.from({ length: max + 1 }, () => Infinity);
    const pick: number[] = Array.from({ length: max + 1 }, () => -1);
    cost[0] = 0;
    for (let x = 1; x <= max; x++)
      sizes.forEach((sz, k) => {
        if (sz <= x && cost[x - sz]! + liquids[k]!.price < cost[x]!) {
          cost[x] = cost[x - sz]! + liquids[k]!.price;
          pick[x] = k;
        }
      });
    let best = T;
    for (let x = T; x <= max; x++) if (cost[x]! < cost[best]!) best = x;
    for (let x = best; x > 0 && pick[x]! >= 0; x -= sizes[pick[x]!]!) {
      const l = liquids[pick[x]!]!;
      const ex = combo.find((c) => c.p.id === l.id);
      if (ex) ex.n += 1;
      else combo.push({ p: l, n: 1 });
    }
    combo.sort((a, b) => (b.p.liters ?? 0) - (a.p.liters ?? 0));
  }
  const comboPrice = combo.reduce((t, c) => t + c.n * c.p.price, 0);
  const comboLiters = combo.reduce((t, c) => t + c.n * (c.p.liters ?? 0), 0);

  const upd = (id: string, patch: Partial<{ l: number; a: number }>) =>
    setAreas((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <Modal open={open} onClose={onClose} title="Calcular cantidad para el cliente" wide>
      <div className="flex flex-col gap-4">
        <Field label="Producto">
          <Select value={pid} onChange={(e) => setPid(e.target.value)}>
            {stones.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="on-surface rounded-3xl bg-surface p-4">
          <p className="mb-3 text-xs font-semibold">Medidas del lugar (en metros)</p>
          <div className="flex flex-col gap-2">
            {areas.map((x, k) => (
              <div key={x.id} className="flex flex-wrap items-end gap-2">
                <Field label={k === 0 ? "Largo" : ""} className="w-28">
                  <NumberInput value={x.l} onChange={(v) => upd(x.id, { l: v })} suffix="m" />
                </Field>
                <span className="pb-2.5 text-muted-foreground">×</span>
                <Field label={k === 0 ? "Ancho" : ""} className="w-28">
                  <NumberInput value={x.a} onChange={(v) => upd(x.id, { a: v })} suffix="m" />
                </Field>
                <span className="pb-2.5 text-sm tabular-nums">
                  = <b>{num(round(x.l * x.a, 2), 2)} m²</b>
                </span>
                {areas.length > 1 && (
                  <button
                    type="button"
                    className={`${btn.icon} mb-1`}
                    aria-label="Quitar"
                    onClick={() => setAreas((xs) => xs.filter((y) => y.id !== x.id))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`${btn.ghost} mt-2`}
            onClick={() => setAreas((xs) => [...xs, blankArea()])}
          >
            <Plus className="h-3.5 w-3.5" /> Otra superficie
          </button>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <Field label="Espesor">
              <NumberInput value={cm} onChange={setCm} suffix="cm" />
            </Field>
            <Field
              label="Peso por m³"
              help="Cuántos kilos pesa un metro cúbico de piedra. Por defecto 1.500 kg. Se guarda para la próxima vez."
            >
              <NumberInput
                value={density}
                onChange={(v) => updateSettings({ stoneDensity: v || 1500 })}
                suffix="kg"
              />
            </Field>
            <Field
              label="Fijador por m²"
              help="Litros de fijador que lleva cada metro cuadrado. Por defecto 1 litro. Se guarda para la próxima vez."
            >
              <NumberInput
                value={lpm2}
                onChange={(v) => updateSettings({ fixerLitersPerM2: v || 1 })}
                suffix="L"
              />
            </Field>
          </div>
        </div>

        {p && kg > 0 && (
          <div className="rounded-3xl bg-primary p-4 text-sm text-primary-foreground">
            <p className="text-[11px] opacity-70">
              {num(m2, 2)} m² × {num(cm / 100, 2)} m de espesor = {num(m3, 3)} m³ × {num(density)}{" "}
              kg
            </p>
            <p className="mt-1 flex items-baseline justify-between">
              <span className="opacity-70">Piedra necesaria</span>
              <span className="text-lg font-bold">
                {num(kg)} kg · {num(round(tons, 2), 2)} t
              </span>
            </p>
            <div className="mt-3 flex flex-col gap-1 border-t border-primary-foreground/20 pt-3">
              {options.map((o) => (
                <p key={o.label} className="flex justify-between gap-3">
                  <span className="opacity-70">{o.label}</span>
                  <span className="font-semibold tabular-nums">
                    {o.qty} · {ars(o.price)}
                  </span>
                </p>
              ))}
            </div>
            {liters > 0 && (
              <div className="mt-3 border-t border-primary-foreground/20 pt-3">
                <p className="flex justify-between gap-3">
                  <span className="opacity-70">Fijador ({num(lpm2, 1)} L por m²)</span>
                  <span className="font-semibold">{num(liters, 1)} L</span>
                </p>
                {combo.length > 0 ? (
                  <p className="mt-1 flex justify-between gap-3">
                    <span className="opacity-70">
                      {combo.map((c) => `${c.n} × ${num(c.p.liters ?? 0)} L`).join(" + ")}
                      {comboLiters > liters ? ` (${num(comboLiters)} L)` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">{ars(comboPrice)}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] opacity-70">
                    No hay fijador cargado en el catálogo.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Precios de lista sin IVA. El peso por m³ y los litros por m² se cambian acá mismo.
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
