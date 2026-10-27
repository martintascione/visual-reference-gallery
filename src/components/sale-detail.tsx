import type { Sale } from "@/lib/types";
import { feeFor, useStore } from "@/lib/store";
import { ars, fmtDate, fmtTime, num } from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import { Badge, Modal, btn } from "./ui-bits";
import { FileDown } from "lucide-react";
import { openDocumentPdf } from "@/lib/quote-pdf";

const methodLabel: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transf.",
  debito: "Débito",
  credito: "Crédito",
  cheque: "Cheque",
  cta_cte: "Cta. cte.",
};

export function PayChips({ sale }: { sale: Sale }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sale.payments.map((p, i) => (
        <Badge
          key={i}
          tone={p.method === "cta_cte" ? "dark" : p.method === "cheque" ? "danger" : "muted"}
        >
          {methodLabel[p.method]}
          {p.gateway ? ` ${p.gateway}` : ""}
          {p.method !== "efectivo" && p.method !== "cta_cte" && p.method !== "cheque"
            ? ` → ${p.bank}`
            : ""}
          {sale.payments.length > 1 ? ` ${ars(p.amount)}` : ""}
        </Badge>
      ))}
    </span>
  );
}

export function SaleDetail({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { db, setInvoicePending } = useStore();
  if (!sale) return null;
  const fees = sale.payments.reduce((a, p) => a + feeFor(db, p), 0);
  return (
    <Modal open={!!sale} onClose={onClose} title={`Venta #${sale.number} · ${sale.clientName}`}>
      <p className="mb-3 text-xs text-muted-foreground">
        {fmtDate(sale.date)} {fmtTime(sale.date)} · {sale.withIva ? "Con IVA" : "Sin IVA"}
        {sale.note && ` · ${sale.note}`}
      </p>
      <div className="flex flex-col gap-2 text-sm">
        {sale.items.map((i, k) => (
          <p key={k} className="flex justify-between gap-3">
            <span>
              {qtyUnit(i.qty, i.unit)} {i.name}
              {i.discountPct > 0 && (
                <span className="text-muted-foreground"> · −{i.discountPct}%</span>
              )}
            </span>
            <span className="tabular-nums">{ars(i.subtotal)}</span>
          </p>
        ))}
        {sale.delivery && (
          <p className="flex justify-between gap-3">
            <span>
              Flete · {sale.delivery.zone} · {sale.delivery.address}
            </span>
            <span className="tabular-nums">{ars(sale.delivery.price)}</span>
          </p>
        )}
        {!!sale.discountPct && (
          <p className="flex justify-between text-muted-foreground">
            <span>Bonificación {sale.discountPct}%</span>
            <span className="tabular-nums">incluida</span>
          </p>
        )}
        {sale.withIva && (
          <p className="flex justify-between text-muted-foreground">
            <span>IVA</span>
            <span className="tabular-nums">{ars(sale.iva)}</span>
          </p>
        )}
        <p className="flex justify-between border-t border-border pt-2 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{ars(sale.total)}</span>
        </p>
      </div>
      <div className="mt-4 rounded-2xl bg-surface p-3 text-sm">
        <p className="mb-2 text-xs font-semibold">Cómo se cobró</p>
        {sale.payments.map((p, i) => {
          const cfg = db.settings.methods.find(
            (m) =>
              m.method === p.method && m.bank === p.bank && (m.gateway ?? "") === (p.gateway ?? ""),
          );
          return (
            <p key={i} className="flex justify-between gap-3">
              <span>
                {cfg?.label ?? methodLabel[p.method]}
                {p.installments && p.installments > 1 ? ` · ${p.installments} cuotas` : ""}
                {p.dues ? ` · ${p.dues} cuotas` : ""}
              </span>
              <span className="tabular-nums">
                {ars(p.amount)}
                {feeFor(db, p) > 0 && (
                  <span className="text-muted-foreground"> (−{ars(feeFor(db, p))})</span>
                )}
              </span>
            </p>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-2xl bg-surface p-2">
          <p className="text-muted-foreground">Costo</p>
          <p className="font-semibold">{ars(sale.cost)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2">
          <p className="text-muted-foreground">Comisiones</p>
          <p className="font-semibold">{ars(fees)}</p>
        </div>
        <div className="rounded-2xl bg-primary p-2 text-primary-foreground">
          <p className="opacity-70">Ganancia</p>
          <p className="font-semibold">{ars(sale.subtotal - sale.cost - fees)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button className={btn.soft} onClick={() => openDocumentPdf(db, sale, "venta")}>
          <FileDown className="h-4 w-4" strokeWidth={1.6} /> Comprobante PDF
        </button>
        <button
          className={sale.invoicePending ? btn.danger : btn.ghost}
          onClick={() => setInvoicePending(sale.id, !sale.invoicePending)}
        >
          {sale.invoicePending ? "Falta facturar · marcar hecha" : "Marcar: falta facturar"}
        </button>
      </div>
    </Modal>
  );
}
