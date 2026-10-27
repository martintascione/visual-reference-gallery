import type { DB } from "./types";
import { clientBalance } from "./store";
import { addDays, ars, dayOf, daysBetween, fmtDate, num, todayISO } from "./format";

export type AlertKind =
  "stock" | "cuota" | "cheque" | "presupuesto" | "liquidacion" | "debito" | "entrega";
export type Alert = {
  id: string;
  kind: AlertKind;
  text: string;
  detail?: string | undefined;
  urgent: boolean;
  to: "/stock" | "/clientes" | "/caja" | "/presupuestos" | "/gastos" | "/ventas";
  date?: string | undefined;
};

/** Todo lo que requiere atención hoy, ordenado por urgencia. */
export function buildAlerts(db: DB): Alert[] {
  const today = todayISO();
  const out: Alert[] = [];

  for (const p of db.products.filter((p) => p.active && p.stock < p.minStock))
    out.push({
      id: "st" + p.id,
      kind: "stock",
      text:
        p.stock <= 0
          ? `${p.name}: sin stock`
          : `${p.name}: quedan ${num(p.stock)} ${p.unit === "m2" ? "m²" : p.unit}`,
      detail: `Mínimo ${num(p.minStock)}`,
      urgent: p.stock <= 0,
      to: "/stock",
    });

  for (const c of db.clients) {
    const b = clientBalance(db, c.id);
    if (b.overdue > 0)
      out.push({
        id: "cl" + c.id,
        kind: "cuota",
        text: `${c.name}: ${ars(b.overdue)} vencido`,
        detail: `Debe ${ars(b.balance)} en total`,
        urgent: true,
        to: "/clientes",
      });
  }

  for (const ch of db.cheques.filter((c) => c.status === "cartera" || c.status === "depositado")) {
    const d = daysBetween(today, ch.dueDate);
    if (d <= 3)
      out.push({
        id: "ch" + ch.id,
        kind: "cheque",
        text: `Cheque ${ch.clientName} ${ars(ch.amount)} ${d < 0 ? "venció" : d === 0 ? "cobra hoy" : `cobra en ${d} d`}`,
        detail: `${ch.bank} · N° ${ch.number}${ch.status === "depositado" ? " · depositado" : " · en cartera"}`,
        urgent: d <= 0,
        to: "/caja",
        date: ch.dueDate,
      });
  }

  for (const q of db.quotes.filter(
    (q) => q.status === "enviado" || q.status === "seguimiento" || q.status === "borrador",
  )) {
    const f = q.followUp ?? q.validUntil;
    if (f <= today)
      out.push({
        id: "q" + q.id,
        kind: "presupuesto",
        text: `Llamar a ${q.clientName} · presupuesto #${q.number}`,
        detail: `${ars(q.total)} · vence ${fmtDate(q.validUntil)}`,
        urgent: q.validUntil <= today,
        to: "/presupuestos",
        date: f,
      });
  }

  for (const m of db.movements.filter((m) => m.settled === false && m.amount > 0)) {
    const eta = addDays(dayOf(m.date), m.settleDays ?? 0);
    if (eta < today)
      out.push({
        id: "mv" + m.id,
        kind: "liquidacion",
        text: `${m.gateway ?? "Depósito"} ${ars(m.amount)} no acreditó en ${m.account}`,
        detail: `Debía acreditar el ${fmtDate(eta)} · ${m.concept}`,
        urgent: true,
        to: "/caja",
        date: eta,
      });
  }

  const dayNum = Number(today.slice(8, 10));
  for (const f of db.settings.fixedExpenses) {
    const diff = f.day - dayNum;
    if (diff >= 0 && diff <= 2) {
      const already = db.expenses.some(
        (e) =>
          e.type === "fijo" &&
          e.concept === f.concept &&
          dayOf(e.date).slice(0, 7) === today.slice(0, 7),
      );
      if (!already)
        out.push({
          id: "fx" + f.id,
          kind: "debito",
          text: `${f.concept} ${ars(f.amount)} se debita ${diff === 0 ? "hoy" : `en ${diff} d`}`,
          detail: `Cuenta ${f.account} · confirmalo en Gastos cuando salga`,
          urgent: diff === 0,
          to: "/gastos",
        });
    }
  }

  for (const s of db.sales.filter((s) => s.delivery && !s.delivery.done && s.delivery.date < today))
    out.push({
      id: "dv" + s.id,
      kind: "entrega",
      text: `Entrega atrasada: ${s.clientName}`,
      detail: `${s.delivery!.address} · era para el ${fmtDate(s.delivery!.date)}`,
      urgent: true,
      to: "/ventas",
      date: s.delivery!.date,
    });

  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

export type AgendaItem = {
  date: string;
  kind: AlertKind;
  text: string;
  amount?: number | undefined;
  to: Alert["to"];
};

/** Agenda de los próximos días: entregas, cheques, cuotas, débitos fijos y vencimientos de presupuestos. */
export function buildAgenda(db: DB, days = 30): AgendaItem[] {
  const today = todayISO();
  const end = addDays(today, days);
  const items: AgendaItem[] = [];
  for (const s of db.sales)
    if (s.delivery && !s.delivery.done && s.delivery.date <= end)
      items.push({
        date: s.delivery.date,
        kind: "entrega",
        text: `Entrega ${s.clientName} · ${s.delivery.address}`,
        to: "/ventas",
      });
  for (const c of db.cheques)
    if ((c.status === "cartera" || c.status === "depositado") && c.dueDate <= end)
      items.push({
        date: c.dueDate,
        kind: "cheque",
        text: `Cobro cheque ${c.clientName} (${c.bank})`,
        amount: c.amount,
        to: "/caja",
      });
  for (const d of db.dues)
    if (d.paid < d.amount && d.dueDate <= end) {
      const c = db.clients.find((x) => x.id === d.clientId);
      items.push({
        date: d.dueDate,
        kind: "cuota",
        text: `Cuota ${d.n}/${d.of} ${c?.name ?? ""}`,
        amount: d.amount - d.paid,
        to: "/clientes",
      });
    }
  for (const q of db.quotes)
    if ((q.status === "enviado" || q.status === "seguimiento") && q.validUntil <= end)
      items.push({
        date: q.validUntil,
        kind: "presupuesto",
        text: `Vence presupuesto #${q.number} ${q.clientName}`,
        amount: q.total,
        to: "/presupuestos",
      });
  for (const m of db.movements)
    if (m.settled === false && m.amount > 0)
      items.push({
        date: addDays(dayOf(m.date), m.settleDays ?? 0),
        kind: "liquidacion",
        text: `Acredita ${m.gateway ?? "depósito"} en ${m.account}`,
        amount: m.amount - Math.round((m.amount * (m.feePct ?? 0)) / 100),
        to: "/caja",
      });
  const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (const f of db.settings.fixedExpenses)
    for (const k of [0, 1]) {
      const d = new Date(y, mo - 1 + k, Math.min(f.day, 28));
      const iso = d.toISOString().slice(0, 10);
      if (iso >= today && iso <= end)
        items.push({
          date: iso,
          kind: "debito",
          text: `Débito ${f.concept} (${f.account})`,
          amount: f.amount,
          to: "/gastos",
        });
    }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
