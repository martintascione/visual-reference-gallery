import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, History, Package, SlidersHorizontal } from "lucide-react";
import type { Bank, Category, PaymentMethod, Product, StockMove } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, fmtDate, fmtTime, num } from "@/lib/format";
import { round, stoneCalc } from "@/lib/pricing";
import {
  Badge,
  Card,
  Field,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Stat,
  Table,
  Toggle,
  btn,
  tr,
} from "@/components/ui-bits";
import { CategoryTabs, StockBadge } from "@/components/product-editor";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock · Corralón" },
      { name: "description", content: "Stock dinámico: compras, ventas, ajustes y alertas." },
    ],
  }),
  component: Stock,
});

const unitName: Record<Product["unit"], string> = { kg: "kg", m2: "m²", l: "L", u: "u" };
const reasonLabel: Record<StockMove["reason"], string> = {
  venta: "Venta",
  compra: "Compra",
  ajuste: "Ajuste",
  merma: "Merma",
  fraccionado: "Fraccionado",
};

function Stock() {
  const { db, pendingAction, setPendingAction } = useStore();
  const [cat, setCat] = useState<Category | "todos">("todos");
  const [purchase, setPurchase] = useState<Product | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);
  useEffect(() => {
    if (pendingAction?.tipo === "cargar_stock") {
      const name = (pendingAction.producto ?? "").toLowerCase();
      const p =
        db.products.find((x) => x.active && x.name.toLowerCase().includes(name)) ??
        db.products.find((x) => x.active);
      if (p) setPurchase(p);
      setPendingAction(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);
  const products = db.products.filter((p) => p.active && (cat === "todos" || p.category === cat));
  const low = db.products.filter((p) => p.active && p.stock < p.minStock);
  const valued = db.products
    .filter((p) => p.active)
    .reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0);
  const moves = useMemo(() => db.stockMoves.slice(0, 40), [db.stockMoves]);

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Se descuenta solo con cada venta y se suma con cada compra"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Productos con stock bajo"
          value={String(low.length)}
          sub={low
            .map((p) => p.name)
            .slice(0, 2)
            .join(", ")}
          tone={low.length ? "danger" : undefined}
        />
        <Stat label="Stock valorizado al costo" value={ars(valued)} />
        <Stat label="Movimientos registrados" value={String(db.stockMoves.length)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          icon={Package}
          title="Existencias"
          action={<CategoryTabs value={cat} onChange={setCat} />}
        >
          <Table
            head={[
              "Producto",
              { label: "Stock", right: true },
              { label: "Mínimo", right: true },
              { label: "Equivale a", right: true },
              "Estado",
              "",
            ]}
            min={680}
          >
            {products.map((p) => (
              <tr key={p.id} className={tr}>
                <td className="font-medium">{p.name}</td>
                <td
                  className={`text-right font-semibold tabular-nums ${p.stock < 0 ? "text-danger-soft-foreground" : ""}`}
                >
                  {num(p.stock, 1)} {unitName[p.unit]}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {num(p.minStock)} {unitName[p.unit]}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.category === "piedra"
                    ? `${round(p.stock / 1000, 2)} t · ${Math.floor(Math.max(0, p.stock) / (p.bagKg ?? 25))} bolsones`
                    : p.category === "liquido"
                      ? `${num(p.stock * (p.liters ?? 0))} L`
                      : "—"}
                </td>
                <td>
                  <StockBadge p={p} />
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <button className={btn.ghost} onClick={() => setPurchase(p)}>
                      <ArrowDownToLine className="h-3.5 w-3.5" /> Compra
                    </button>
                    <button className={btn.ghost} onClick={() => setAdjust(p)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Ajuste
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card icon={History} title="Últimos movimientos">
          <div className="flex flex-col gap-2">
            {moves.map((m) => {
              const p = db.products.find((x) => x.id === m.productId);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p?.name ?? "Producto"}</p>
                    <p className="text-muted-foreground">
                      {fmtDate(m.date)} {fmtTime(m.date)}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={m.qty > 0 ? "ok" : "muted"}>{reasonLabel[m.reason]}</Badge>
                    <span
                      className={`font-semibold tabular-nums ${m.qty > 0 ? "text-success-foreground" : ""}`}
                    >
                      {m.qty > 0 ? "+" : ""}
                      {num(m.qty, 1)} {p ? unitName[p.unit] : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {moves.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
            )}
          </div>
        </Card>
      </div>

      <PurchaseModal product={purchase} onClose={() => setPurchase(null)} />
      <AdjustModal product={adjust} onClose={() => setAdjust(null)} />
    </>
  );
}

/** Ingreso de mercadería: suma stock, registra el gasto y actualiza el costo de la calculadora. */
function PurchaseModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { db, addStockMove, addExpense, upsertProduct } = useStore();
  const s = db.settings;
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState<"t" | "base">("t");
  const [price, setPrice] = useState(0);
  const [freight, setFreight] = useState(0);
  const [unload, setUnload] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [pay, setPay] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [account, setAccount] = useState<Bank>("BBVA");
  const [updateCost, setUpdateCost] = useState(true);

  if (!product) return null;
  const isStone = product.category === "piedra";
  const baseQty = isStone && unit === "t" ? qty * 1000 : qty;
  const total = price + freight + unload;
  const tons = baseQty / 1000;

  const save = () => {
    addStockMove({
      date: new Date().toISOString(),
      productId: product.id,
      qty: baseQty,
      reason: "compra",
      note: supplier ? `${supplier}` : "Compra",
    });
    if (pay && total > 0)
      addExpense({
        date: new Date().toISOString(),
        type: "compra",
        concept: `Compra ${product.name}${supplier ? " · " + supplier : ""}`,
        amount: total,
        account,
        method,
      });
    if (updateCost && baseQty > 0) {
      if (isStone && product.stoneCost && tons > 0) {
        const sc = {
          ...product.stoneCost,
          purchasePerTon: round(price / tons),
          freightPerTon: round(freight / tons),
          unloadPerTon: unload ? round(unload / tons) : product.stoneCost.unloadPerTon,
        };
        const r = stoneCalc(sc, product.bagKg ?? s.bagKg);
        upsertProduct({
          ...product,
          stoneCost: sc,
          cost: r.costKg,
          price: r.priceKg,
          bagPrice: r.priceBag,
        });
      } else if (!isStone) {
        const margin = product.cost ? product.price / product.cost : 1;
        const cost = round(total / baseQty);
        upsertProduct({ ...product, cost, price: round(cost * margin) });
      }
    }
    onClose();
    setQty(0);
    setPrice(0);
    setFreight(0);
    setUnload(0);
    setSupplier("");
  };

  return (
    <Modal open={!!product} onClose={onClose} title={`Ingreso de mercadería · ${product.name}`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <NumberInput value={qty} onChange={setQty} />
          </Field>
          <Field label="Unidad">
            {isStone ? (
              <Select value={unit} onChange={(e) => setUnit(e.target.value as "t" | "base")}>
                <option value="t">toneladas</option>
                <option value="base">kg</option>
              </Select>
            ) : (
              <Input value={unitName[product.unit]} readOnly />
            )}
          </Field>
          <Field label="Proveedor" className="col-span-2">
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Cantera, corralón mayorista…"
            />
          </Field>
          <Field label="Precio de la mercadería ($)">
            <NumberInput value={price} onChange={setPrice} prefix="$" />
          </Field>
          <Field label="Flete pagado ($)">
            <NumberInput value={freight} onChange={setFreight} prefix="$" />
          </Field>
          {isStone && (
            <Field label="Descarga ($)">
              <NumberInput value={unload} onChange={setUnload} prefix="$" />
            </Field>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-3 text-xs">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Total de la compra</span>
            <span className="font-semibold">{ars(total)}</span>
          </p>
          {baseQty > 0 && total > 0 && (
            <p className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Costo resultante</span>
              <span className="font-semibold">
                {isStone
                  ? `${ars(round(total / tons))} por tonelada`
                  : `${ars(round(total / baseQty))} por ${unitName[product.unit]}`}
              </span>
            </p>
          )}
        </div>
        <Toggle
          checked={updateCost}
          onChange={setUpdateCost}
          label="Actualizar el costo del producto con esta compra (recalcula precios)"
        />
        <Toggle checked={pay} onChange={setPay} label="Registrar el pago como gasto" />
        {pay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cómo se pagó">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="cta_cte">Cuenta corriente proveedor</option>
              </Select>
            </Field>
            <Field label="Sale de">
              <Select value={account} onChange={(e) => setAccount(e.target.value as Bank)}>
                <option value="Caja">Caja</option>
                <option value="BBVA">BBVA</option>
                <option value="Provincia">Provincia</option>
              </Select>
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={baseQty <= 0} onClick={save}>
            Cargar ingreso
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { addStockMove } = useStore();
  const [mode, setMode] = useState<"conteo" | "merma">("conteo");
  const [value, setValue] = useState(0);
  const [note, setNote] = useState("");
  if (!product) return null;
  const delta = mode === "conteo" ? value - product.stock : -value;
  const save = () => {
    addStockMove({
      date: new Date().toISOString(),
      productId: product.id,
      qty: delta,
      reason: mode === "conteo" ? "ajuste" : "merma",
      note: note || (mode === "conteo" ? "Conteo físico" : "Merma"),
    });
    onClose();
    setValue(0);
    setNote("");
  };
  return (
    <Modal open={!!product} onClose={onClose} title={`Ajuste de stock · ${product.name}`}>
      <div className="flex flex-col gap-4">
        <Select value={mode} onChange={(e) => setMode(e.target.value as "conteo" | "merma")}>
          <option value="conteo">Conteo físico (cargo lo que hay)</option>
          <option value="merma">Merma / rotura / humedad (descuento)</option>
        </Select>
        <Field
          label={
            mode === "conteo"
              ? `Stock real contado (${unitName[product.unit]})`
              : `Cantidad perdida (${unitName[product.unit]})`
          }
        >
          <NumberInput value={value} onChange={setValue} />
        </Field>
        <Field label="Motivo">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        <p className="text-xs text-muted-foreground">
          Stock actual {num(product.stock, 1)} → {num(product.stock + delta, 1)}{" "}
          {unitName[product.unit]} ({delta >= 0 ? "+" : ""}
          {num(delta, 1)})
        </p>
        <div className="flex justify-end gap-2">
          <button className={btn.soft} onClick={onClose}>
            Cancelar
          </button>
          <button className={btn.primary} disabled={delta === 0} onClick={save}>
            Guardar ajuste
          </button>
        </div>
      </div>
    </Modal>
  );
}
