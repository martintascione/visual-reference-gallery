import { Lock } from "lucide-react";
import type { Product } from "@/lib/types";
import { stockpileReserved, useStore } from "@/lib/store";
import { ars, fmtDateNum, num } from "@/lib/format";
import { qtyUnit } from "@/lib/pricing";
import { Card, Table, tr } from "@/components/ui-bits";

/** Cantidad en unidad base, en palabras: toneladas para piedras, m², litros o unidades. */
export function baseText(p: Product, base: number) {
  if (p.unit === "kg") return base >= 1000 ? `${num(base / 1000, 2)} t` : `${num(base)} kg`;
  if (p.unit === "m2") return `${num(base, 1)} m²`;
  if (p.category === "liquido") return `${num(base, 1)} bidones`;
  return `${num(base, 1)} u`;
}

/** Stock acopiado: mercadería que ya es de un cliente y todavía no retiró. No se puede vender. */
export function StockpileStockCard({ onOpen }: { onOpen?: (stockpileId: string) => void }) {
  const { db } = useStore();
  const reserved = stockpileReserved(db);
  const rows = [...reserved.entries()]
    .map(([id, r]) => ({ p: db.products.find((x) => x.id === id)!, r }))
    .filter((x) => x.p)
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  const valued = rows.reduce((a, x) => a + x.r.base * x.p.cost, 0);
  return (
    <Card
      icon={Lock}
      title="Stock en acopio (no se vende)"
      action={
        <span className="text-[11px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "producto" : "productos"} · {ars(valued)} al costo
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay mercadería acopiada pendiente de retiro.
        </p>
      ) : (
        <Table
          head={[
            "Producto",
            { label: "En acopio", right: true },
            "De quién",
            { label: "Disponible para vender", right: true },
          ]}
          min={620}
        >
          {rows.map(({ p, r }) => (
            <tr key={p.id} className={tr}>
              <td className="font-medium">{p.name}</td>
              <td className="text-right font-semibold tabular-nums">{baseText(p, r.base)}</td>
              <td className="text-xs">
                {r.rows.map((x, k) => (
                  <button
                    key={k}
                    type="button"
                    className="block text-left hover:underline"
                    onClick={() => onOpen?.(x.stockpileId)}
                  >
                    {x.client} · {qtyUnit(x.qty, x.unit)}
                    {x.pickupBy ? ` · retira hasta ${fmtDateNum(x.pickupBy)}` : ""}
                  </button>
                ))}
              </td>
              <td
                className={`text-right tabular-nums ${p.stock - r.base < 0 ? "text-danger-soft-foreground" : "text-muted-foreground"}`}
              >
                {baseText(p, p.stock - r.base)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
