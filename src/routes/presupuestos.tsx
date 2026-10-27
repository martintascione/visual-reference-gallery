import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, FileDown, MessageCircle, Plus, X } from "lucide-react";
import { openDocumentPdf } from "@/lib/quote-pdf";
import type { Quote, QuoteStatus } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, daysBetween, fmtDate, num, todayISO } from "@/lib/format";
import { qtyUnit, unitLabel } from "@/lib/pricing";
import { Badge, Empty, Modal, PageHeader, Segmented, Stat, btn, Input } from "@/components/ui-bits";

export const Route = createFileRoute("/presupuestos")({
  head: () => ({
    meta: [
      { title: "Presupuestos · Corralón" },
      { name: "description", content: "Presupuestos, seguimiento y conversión a venta." },
    ],
  }),
  component: Presupuestos,
});

const statusLabel: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  seguimiento: "En seguimiento",
  aceptado: "Aceptado",
  vencido: "Vencido",
  perdido: "Perdido",
};

function Presupuestos() {
  const { db, updateQuote, setPendingQuote } = useStore();
  const nav = useNavigate();
  const today = todayISO();
  const [tab, setTab] = useState<"abiertos" | "aceptados" | "cerrados">("abiertos");
  const [lost, setLost] = useState<Quote | null>(null);
  const [reason, setReason] = useState("");

  const list = useMemo(() => {
    const open = (q: Quote) =>
      q.status === "borrador" || q.status === "enviado" || q.status === "seguimiento";
    return db.quotes
      .filter((q) =>
        tab === "abiertos"
          ? open(q)
          : tab === "aceptados"
            ? q.status === "aceptado"
            : q.status === "vencido" || q.status === "perdido",
      )
      .sort((a, b) => (a.followUp ?? a.validUntil).localeCompare(b.followUp ?? b.validUntil));
  }, [db.quotes, tab]);

  const openQuotes = db.quotes.filter(
    (q) => q.status === "borrador" || q.status === "enviado" || q.status === "seguimiento",
  );
  const toFollow = openQuotes.filter((q) => (q.followUp ?? q.validUntil) <= today);
  const expiring = openQuotes.filter((q) => q.validUntil <= today);
  const openTotal = openQuotes.reduce((a, q) => a + q.total, 0);
  const accepted = db.quotes.filter((q) => q.status === "aceptado").length;
  const closedCount = db.quotes.filter(
    (q) => q.status !== "borrador" && q.status !== "enviado" && q.status !== "seguimiento",
  ).length;

  const convert = (q: Quote) => {
    setPendingQuote(q.id);
    nav({ to: "/nueva-venta" });
  };

  const waText = (q: Quote) =>
    encodeURIComponent(
      [
        `Hola ${q.clientName}, te paso el presupuesto #${q.number} de ${db.settings.businessName}:`,
        ...q.items.map((i) => `• ${qtyUnit(i.qty, i.unit)} ${i.name}: ${ars(i.subtotal)}`),
        q.delivery ? `• Flete ${q.delivery.zone}: ${ars(q.delivery.price)}` : "",
        q.withIva ? `IVA: ${ars(q.iva)}` : "",
        `*Total: ${ars(q.total)}*`,
        `Válido hasta el ${fmtDate(q.validUntil)}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return (
    <>
      <PageHeader
        title="Presupuestos"
        subtitle={`${openQuotes.length} abiertos por ${ars(openTotal)}`}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "abiertos", label: `Abiertos (${openQuotes.length})` },
            { value: "aceptados", label: `Aceptados (${accepted})` },
            { value: "cerrados", label: `Vencidos/perdidos (${closedCount})` },
          ]}
        />
        <Link to="/nueva-venta" className={btn.primary}>
          <Plus className="h-4 w-4" /> Nuevo
        </Link>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Para llamar hoy"
          value={String(toFollow.length)}
          tone={toFollow.length ? "danger" : undefined}
          sub="seguimiento pendiente"
        />
        <Stat label="Vencen hoy o ya vencieron" value={String(expiring.length)} />
        <Stat
          label="Tasa de aceptación"
          value={
            db.quotes.length
              ? `${Math.round((accepted / Math.max(1, accepted + closedCount)) * 100)}%`
              : "—"
          }
          sub="aceptados sobre cerrados"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((q) => {
          const follow = q.followUp ?? q.validUntil;
          const due = daysBetween(today, q.validUntil);
          const needsCall = tab === "abiertos" && follow <= today;
          return (
            <article key={q.id} className="card-soft flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    #{q.number} · {fmtDate(q.date)}
                  </p>
                  <h3 className="truncate text-[15px] font-bold">{q.clientName}</h3>
                </div>
                <Badge
                  tone={
                    q.status === "aceptado"
                      ? "ok"
                      : q.status === "vencido" || q.status === "perdido"
                        ? "danger"
                        : needsCall
                          ? "danger"
                          : "dark"
                  }
                >
                  {needsCall ? "Llamar hoy" : statusLabel[q.status]}
                </Badge>
              </div>
              <ul className="text-xs text-muted-foreground">
                {q.items.map((i, k) => (
                  <li key={k} className="flex justify-between">
                    <span>
                      {qtyUnit(i.qty, i.unit)} {i.name}
                    </span>
                    <span className="tabular-nums">{ars(i.subtotal)}</span>
                  </li>
                ))}
                {q.delivery && (
                  <li className="flex justify-between">
                    <span>Flete · {q.delivery.zone}</span>
                    <span className="tabular-nums">{ars(q.delivery.price)}</span>
                  </li>
                )}
              </ul>
              {q.note && <p className="text-xs text-muted-foreground">{q.note}</p>}
              <div className="flex items-end justify-between">
                <div className="text-xs text-muted-foreground">
                  {q.status === "aceptado"
                    ? "Convertido en venta"
                    : q.status === "perdido"
                      ? `Perdido${q.lostReason ? ": " + q.lostReason : ""}`
                      : due < 0
                        ? `Venció hace ${-due} d`
                        : due === 0
                          ? "Vence hoy"
                          : `Vence en ${due} d`}
                  {q.withIva && " · c/IVA"}
                </div>
                <p className="text-lg font-bold tabular-nums">{ars(q.total)}</p>
              </div>
              {tab === "abiertos" && (
                <div className="flex flex-wrap gap-1.5">
                  <button className={`${btn.primary} h-9 px-4 text-xs`} onClick={() => convert(q)}>
                    <Check className="h-3.5 w-3.5" /> Aceptado → venta
                  </button>
                  <button
                    className={btn.ghost}
                    onClick={() => openDocumentPdf(db, q, "presupuesto")}
                  >
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </button>
                  <a
                    href={`https://wa.me/${q.phone ? "54" + q.phone.replace(/\D/g, "") : ""}?text=${waText(q)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={btn.ghost}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                  {needsCall && (
                    <button
                      className={btn.ghost}
                      onClick={() =>
                        updateQuote(q.id, {
                          status: "seguimiento",
                          followUp: addDaysSafe(today, db.settings.followUpDays),
                        })
                      }
                    >
                      Hablé, seguir en {db.settings.followUpDays} d
                    </button>
                  )}
                  <button className={btn.ghost} onClick={() => setLost(q)}>
                    <X className="h-3.5 w-3.5" /> Perdido
                  </button>
                </div>
              )}
              {tab !== "abiertos" && (
                <button
                  className={`${btn.ghost} self-start`}
                  onClick={() => openDocumentPdf(db, q, "presupuesto")}
                >
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </button>
              )}
              {tab === "cerrados" && q.status !== "aceptado" && (
                <button
                  className={btn.ghost}
                  onClick={() =>
                    updateQuote(q.id, {
                      status: "enviado",
                      validUntil: addDaysSafe(today, db.settings.quoteValidDays),
                      followUp: addDaysSafe(today, db.settings.followUpDays),
                    })
                  }
                >
                  Reactivar con la fecha de hoy
                </button>
              )}
            </article>
          );
        })}
      </div>
      {list.length === 0 && (
        <Empty
          text={
            db.quotes.length
              ? "No hay presupuestos en esta pestaña."
              : 'Todavía no hay presupuestos. Se arman desde Nueva venta eligiendo "Presupuesto" arriba a la derecha, y después se mandan por WhatsApp.'
          }
          action={
            <Link to="/nueva-venta" className={btn.primary}>
              <Plus className="h-4 w-4" /> Nuevo presupuesto
            </Link>
          }
        />
      )}

      <Modal
        open={!!lost}
        onClose={() => setLost(null)}
        title={`Marcar perdido · #${lost?.number}`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Saber por qué se pierde ayuda a ajustar precios y tiempos.
          </p>
          <Segmented
            value={reason}
            onChange={setReason}
            options={[
              { value: "Precio", label: "Precio" },
              { value: "Demora", label: "Demora" },
              { value: "Compró en otro lado", label: "Compró en otro lado" },
              { value: "No respondió", label: "No respondió" },
            ]}
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Otro motivo"
          />
          <div className="flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setLost(null)}>
              Cancelar
            </button>
            <button
              className={btn.primary}
              onClick={() => {
                if (lost)
                  updateQuote(lost.id, { status: "perdido", lostReason: reason || undefined });
                setLost(null);
                setReason("");
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function addDaysSafe(iso: string, d: number) {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}
