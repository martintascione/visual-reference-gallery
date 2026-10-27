import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Truck } from "lucide-react";
import type { Sale } from "@/lib/types";
import { feeFor, useStore } from "@/lib/store";
import { addDays, ars, dayOf, fmtDate, fmtTime, num, todayISO } from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import { Card, PageHeader, Segmented, Stat, Table, Toggle, btn, tr } from "@/components/ui-bits";
import { PayChips, SaleDetail } from "@/components/sale-detail";

export const Route = createFileRoute("/ventas")({
  head: () => ({
    meta: [
      { title: "Ventas · Corralón" },
      {
        name: "description",
        content: "Ventas del corralón: cómo se cobró, con qué banco y pasarela.",
      },
    ],
  }),
  component: Ventas,
});

function Ventas() {
  const { db, setDeliveryDone } = useStore();
  const [range, setRange] = useState<"hoy" | "semana" | "mes" | "todo">("hoy");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Sale | null>(null);
  const today = todayISO();
  const from =
    range === "hoy"
      ? today
      : range === "semana"
        ? addDays(today, -6)
        : range === "mes"
          ? today.slice(0, 8) + "01"
          : "0000";

  const list = useMemo(
    () =>
      db.sales
        .filter((s) => dayOf(s.date) >= from)
        .filter(
          (s) =>
            !q ||
            s.clientName.toLowerCase().includes(q.toLowerCase()) ||
            String(s.number).includes(q) ||
            s.items.some((i) => i.name.toLowerCase().includes(q.toLowerCase())),
        ),
    [db.sales, from, q],
  );
  const total = list.reduce((a, s) => a + s.total, 0);
  const profit = list.reduce(
    (a, s) => a + (s.subtotal - s.cost) - s.payments.reduce((b, p) => b + feeFor(db, p), 0),
    0,
  );
  const pending = list
    .flatMap((s) => s.payments)
    .filter((p) => p.method === "cta_cte" || p.method === "cheque")
    .reduce((a, p) => a + p.amount, 0);
  const deliveries = db.sales.filter((s) => s.delivery && !s.delivery.done);

  return (
    <>
      <PageHeader title="Ventas" subtitle={`${list.length} operaciones`}>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "semana", label: "7 días" },
            { value: "mes", label: "Este mes" },
            { value: "todo", label: "Todas" },
          ]}
        />
        <Link to="/nueva-venta" className={btn.primary}>
          <Plus className="h-4 w-4" /> Nueva venta
        </Link>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Vendido" value={ars(total)} sub={`${list.length} ventas`} />
        <Stat
          label="Ganancia"
          value={ars(profit)}
          sub={total ? `${Math.round((profit / total) * 100)}% del total` : ""}
          tone="ok"
        />
        <Stat
          label="A cobrar (cta. cte. y cheques)"
          value={ars(pending)}
          tone={pending ? "danger" : undefined}
        />
        <Stat
          label="Entregas pendientes"
          value={String(deliveries.length)}
          sub={deliveries.length ? "ver abajo" : "todo entregado"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <label className="mb-3 flex h-10 w-full max-w-xs items-center gap-2 rounded-full bg-surface px-4">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, producto o N°"
              className="min-w-0 flex-1 bg-transparent text-sm outline-hidden"
            />
          </label>
          <Table
            head={["N°", "Fecha", "Cliente", "Productos", "Cobro", { label: "Total", right: true }]}
            min={720}
          >
            {list.map((s) => (
              <tr
                key={s.id}
                className={`${tr} cursor-pointer hover:bg-surface`}
                onClick={() => setOpen(s)}
              >
                <td className="text-muted-foreground">#{s.number}</td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {fmtDate(s.date)} {fmtTime(s.date)}
                </td>
                <td className="font-medium">{s.clientName}</td>
                <td className="max-w-[260px] truncate text-muted-foreground">
                  {s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(" · ")}
                </td>
                <td>
                  <PayChips sale={s} />
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {ars(s.total)}
                  {s.withIva && (
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      c/IVA
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {list.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay ventas en este período.
            </p>
          )}
        </Card>

        <Card title="Entregas pendientes" icon={Truck}>
          {deliveries.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay entregas pendientes.</p>
          )}
          <div className="flex flex-col gap-3">
            {deliveries.map((s) => (
              <div key={s.id} className="flex items-start gap-3">
                <Toggle checked={false} onChange={() => setDeliveryDone(s.id, true)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.delivery!.address || "Sin dirección"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(s.delivery!.date)} · {s.clientName} ·{" "}
                    {s.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SaleDetail sale={open} onClose={() => setOpen(null)} />
    </>
  );
}
