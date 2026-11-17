import type { Sale } from "@/lib/types";
import { DEMO, feeFor, saleEditBlock, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { ars, fmtDate, fmtTime, num } from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import { Badge, Modal, btn } from "./ui-bits";
import { FileCheck, FileDown, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
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
  const { db, setInvoicePending, setPendingAction, setEditSale, removeSale } = useStore();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const [invoices, setInvoices] = useState<string[]>([]);
  const saleId = sale?.id;
  useEffect(() => {
    setConfirmDel(false);
    setInvoices([]);
    if (!saleId || DEMO) return;
    // Facturas emitidas en ARCA para esta venta (no se anulan solas).
    void supabase
      .from("invoices")
      .select("pto_vta, cbte_tipo, cbte_nro")
      .eq("sale_id", saleId)
      .then(({ data }) =>
        setInvoices(
          ((data ?? []) as { pto_vta: number; cbte_tipo: number; cbte_nro: number }[]).map(
            (x) =>
              `${x.cbte_tipo === 1 ? "A" : x.cbte_tipo === 6 ? "B" : "C"} ${String(x.pto_vta).padStart(5, "0")}-${String(x.cbte_nro).padStart(8, "0")}`,
          ),
        ),
      );
  }, [saleId]);
  if (!sale) return null;
  const block = saleEditBlock(db, sale);
  const paidDues = db.dues.filter((x) => x.saleId === sale.id && x.paid > 0);
  const movedCheque = db.cheques.find((c) => c.saleId === sale.id && c.status !== "cartera");
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
                <span className="text-muted-foreground"> · −{num(i.discountPct, 1)} %</span>
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
        {!!sale.delivery?.unloadPrice && (
          <p className="flex justify-between gap-3">
            <span>Descarga</span>
            <span className="tabular-nums">{ars(sale.delivery.unloadPrice)}</span>
          </p>
        )}
        {!!sale.discountPct && (
          <p className="flex justify-between text-muted-foreground">
            <span>Bonificación {num(sale.discountPct ?? 0, 1)} %</span>
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
        <div className="flex flex-wrap gap-2">
          <button className={btn.soft} onClick={() => openDocumentPdf(db, sale, "venta")}>
            <FileDown className="h-4 w-4" strokeWidth={1.6} /> Comprobante PDF
          </button>
          <button
            className={btn.soft}
            onClick={() => {
              setPendingAction({ tipo: "facturar", ventaId: sale.id });
              void navigate({ to: "/facturalo" });
            }}
          >
            <FileCheck className="h-4 w-4" strokeWidth={1.6} /> Facturar (ARCA)
          </button>
        </div>
        <button
          className={sale.invoicePending ? btn.danger : btn.ghost}
          onClick={() => setInvoicePending(sale.id, !sale.invoicePending)}
        >
          {sale.invoicePending ? "Falta facturar · marcar hecha" : "Marcar: falta facturar"}
        </button>
      </div>

      {/* Corregir o eliminar */}
      {!confirmDel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            className={`${btn.ghost} disabled:opacity-40`}
            disabled={!!block}
            title={
              block ? `No se puede editar: ${block}` : "Corregir productos, cliente, flete o cobro"
            }
            onClick={() => {
              setEditSale(sale.id);
              onClose();
              void navigate({ to: "/nueva-venta" });
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar venta
          </button>
          <button
            className={`${btn.ghost} hover:text-danger-soft-foreground`}
            onClick={() => setConfirmDel(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar venta
          </button>
          {block && (
            <span className="text-[11px] text-muted-foreground">
              No se puede editar: {block} Si hace falta, eliminala y cargala de nuevo.
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-danger-soft p-3 text-xs text-danger-soft-foreground">
          <p className="text-sm font-semibold">¿Eliminar la venta #{sale.number}?</p>
          <p>
            Vuelve el stock de los productos y se borran sus cobros en caja y bancos
            {db.dues.some((x) => x.saleId === sale.id) ? ", las cuotas de cuenta corriente" : ""}
            {db.cheques.some((c) => c.saleId === sale.id && c.status === "cartera")
              ? " y el cheque en cartera"
              : ""}
            . No se puede deshacer.
          </p>
          {paidDues.length > 0 && (
            <p>
              Ya se cobraron {paidDues.length} cuota{paidDues.length > 1 ? "s" : ""}: esos cobros
              quedan registrados en caja.
            </p>
          )}
          {movedCheque && (
            <p>
              El cheque N° {movedCheque.number} ya está {movedCheque.status}: no se borra.
            </p>
          )}
          {sale.closureId && (
            <p>
              Esta venta ya entró en un cierre del día: el resumen de ese cierre no se recalcula.
            </p>
          )}
          {invoices.length > 0 && (
            <p className="font-semibold">
              Tiene factura emitida en ARCA ({invoices.join(", ")}). Eliminar la venta no anula la
              factura: para eso hay que hacer una nota de crédito.
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setConfirmDel(false)}>
              Cancelar
            </button>
            <button
              className={`${btn.primary} !bg-danger-soft-foreground`}
              onClick={() => {
                removeSale(sale.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
