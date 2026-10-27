import type { DB } from "./types";
import { accountBalance, clientBalance, feeFor, periodProfit } from "./store";
import { addDays, ars, dayOf, num, todayISO } from "./format";
import { qtyUnit } from "./pricing";

/**
 * Foto completa del negocio para el asistente, en texto compacto.
 * Incluye todo lo que hay en la base (con topes razonables en los listados largos)
 * para que pueda leer, interpretar y responder con datos reales.
 */
export function fullContext(db: DB) {
  const today = todayISO();
  const s = db.settings;
  const L: string[] = [];
  const push = (t: string) => L.push(t);

  push(`FECHA DE HOY: ${today}. NEGOCIO: ${s.businessName}.`);

  // Configuración
  push(
    `\nCONFIGURACIÓN: bolsón ${s.bagKg} kg · embalaje ${ars(s.packagingPerBag)}/bolsón · descarga ${ars(s.unloadPerTon)}/t · flete de compra ${ars(s.freightPerTon ?? 0)}/t · margen habitual ${s.defaultMarginPct ?? 40}% · margen mínimo ${s.minMarginPct}% · IVA ${s.ivaPct}% · presupuestos válidos ${s.quoteValidDays} días, seguimiento a los ${s.followUpDays}.`,
  );
  push(
    `Medios de cobro: ${s.methods.map((m) => `${m.label} [${m.method}${m.gateway ? " vía " + m.gateway : ""} → ${m.bank}, comisión ${m.feePct}%, acredita en ${m.settleDays} d${m.active ? "" : ", INACTIVO"}]`).join("; ")}.`,
  );
  push(
    `Zonas de flete: ${s.zones.map((z) => `${z.name}: cobra ${ars(z.price)}, cuesta ${ars(z.cost)}`).join("; ") || "ninguna"}.`,
  );
  push(
    `Gastos fijos mensuales: ${s.fixedExpenses.map((f) => `${f.concept} ${ars(f.amount)} (${f.account}, día ${f.day})`).join("; ") || "ninguno"} · total ${ars(s.fixedExpenses.reduce((a, f) => a + f.amount, 0))}/mes.`,
  );

  // Productos
  const prods = db.products.filter((p) => p.active);
  push(`\nPRODUCTOS (${prods.length}):`);
  for (const p of prods.slice(0, 80)) {
    const sc = p.stoneCost;
    push(
      `- ${p.name} [${p.category}] costo ${ars(p.cost)}/${p.unit} · precio ${ars(p.price)}/${p.unit}${p.bagPrice ? ` · bolsón ${p.bagKg} kg ${ars(p.bagPrice)}` : ""}${p.liters ? ` · bidón ${p.liters} L` : ""} · stock ${num(p.stock, 1)} ${p.unit} (mínimo ${num(p.minStock)})${p.stock < p.minStock ? " STOCK BAJO" : ""}${sc ? ` · calculadora: proveedor ${ars(sc.purchasePerTon)}/t, flete ${ars(sc.freightPerTon)}/t, descarga ${ars(sc.unloadPerTon)}/t, mano de obra ${ars(sc.laborPerTon)}/t, extras ${ars(sc.extrasPerTon)}/t, embalaje ${ars(sc.packagingPerBag)}/bolsón, margen ${sc.marginPct}%` : ""}${p.discounts.length ? ` · descuentos: ${p.discounts.map((d) => `desde ${d.minQty} ${d.unit} −${d.pct}%`).join(", ")}` : ""}`,
    );
  }

  // Clientes
  push(`\nCLIENTES (${db.clients.length}):`);
  for (const c of db.clients.slice(0, 80)) {
    const b = clientBalance(db, c.id);
    const last = db.sales.find((x) => x.clientId === c.id);
    push(
      `- ${c.name}${c.phone ? " · tel " + c.phone : ""}${c.cuit ? " · CUIT " + c.cuit : ""}${c.address ? " · " + c.address : ""} · límite ${c.creditLimit ? ars(c.creditLimit) : "sin límite"} · debe ${ars(b.balance)}${b.overdue ? ` (VENCIDO ${ars(b.overdue)})` : ""}${last ? ` · última compra ${dayOf(last.date)}` : ""}`,
    );
  }
  const dues = db.dues
    .filter((d) => d.paid < d.amount)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (dues.length)
    push(
      `Cuotas pendientes: ${dues
        .slice(0, 40)
        .map(
          (d) =>
            `${db.clients.find((c) => c.id === d.clientId)?.name ?? "?"} cuota ${d.n}/${d.of} vence ${d.dueDate} ${ars(d.amount - d.paid)}`,
        )
        .join("; ")}.`,
    );

  // Ventas
  const sales = db.sales.slice(0, 40);
  push(
    `\nVENTAS (últimas ${sales.length} de ${db.sales.length}; "sin cerrar" = todavía no entró en un cierre del día):`,
  );
  for (const v of sales) {
    const fees = v.payments.reduce((a, p) => a + feeFor(db, p), 0);
    push(
      `- #${v.number} ${v.date.slice(0, 16).replace("T", " ")} ${v.clientName}: ${v.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")}${v.delivery ? ` + flete ${v.delivery.zone} ${ars(v.delivery.price)}${v.delivery.done ? " (entregado)" : " (PENDIENTE de entrega " + v.delivery.date + ")"}` : ""} · total ${ars(v.total)}${v.withIva ? " c/IVA" : ""} · cobro: ${v.payments.map((p) => `${p.method}${p.gateway ? " " + p.gateway : ""} ${p.bank} ${ars(p.amount)}${p.dues ? " en " + p.dues + " cuotas" : ""}${p.installments && p.installments > 1 ? " " + p.installments + " cuotas tarjeta" : ""}`).join(" + ")} · costo ${ars(v.cost)} · ganancia ${ars(v.subtotal - v.cost - fees)}${v.closureId ? "" : " · sin cerrar"}${v.note ? " · nota: " + v.note : ""}`,
    );
  }

  // Presupuestos
  const quotes = db.quotes
    .filter((q) => q.status !== "aceptado" && q.status !== "perdido")
    .slice(0, 30);
  push(`\nPRESUPUESTOS abiertos o vencidos (${quotes.length}):`);
  for (const q of quotes)
    push(
      `- #${q.number} ${q.clientName}${q.phone ? " tel " + q.phone : ""}: ${q.items.map((i) => `${qtyUnit(i.qty, i.unit)} ${i.name}`).join(", ")} · ${ars(q.total)} · estado ${q.status} · vence ${q.validUntil}${q.followUp ? " · seguimiento " + q.followUp : ""}${q.note ? " · " + q.note : ""}`,
    );

  // Caja, bancos, cheques, liquidaciones
  push(
    `\nCAJA Y BANCOS: Caja ${ars(accountBalance(db, "Caja"))} · BBVA ${ars(accountBalance(db, "BBVA"))} · Provincia ${ars(accountBalance(db, "Provincia"))}.`,
  );
  const pend = db.movements.filter((m) => m.settled === false && m.amount > 0);
  if (pend.length)
    push(
      `Por acreditar: ${pend.map((m) => `${m.gateway ?? "depósito"} ${ars(m.amount)} en ${m.account} (${m.concept}, estimado ${addDays(dayOf(m.date), m.settleDays ?? 0)})`).join("; ")}.`,
    );
  const ch = db.cheques.filter((c) => c.status === "cartera" || c.status === "depositado");
  push(
    `Cheques en cartera/depositados (${ch.length}): ${ch.map((c) => `N° ${c.number} ${c.bank} de ${c.clientName} ${ars(c.amount)} cobra ${c.dueDate} (${c.status}${c.echeq ? ", e-cheq" : ""})`).join("; ") || "ninguno"}.`,
  );
  const moves = db.movements.slice(0, 30);
  push(
    `Últimos movimientos: ${moves.map((m) => `${dayOf(m.date)} ${m.kind} ${m.account} ${m.amount >= 0 ? "+" : "−"}${ars(Math.abs(m.amount))} ${m.concept}`).join("; ")}.`,
  );

  // Gastos
  const exps = db.expenses.slice(0, 30);
  push(
    `\nGASTOS recientes (${exps.length}): ${exps.map((e) => `${dayOf(e.date)} ${e.type} ${e.concept} ${ars(e.amount)} salió de ${e.account}`).join("; ") || "ninguno"}.`,
  );

  // Stock
  const sm = db.stockMoves.slice(0, 20);
  push(
    `\nMOVIMIENTOS DE STOCK recientes: ${sm.map((m) => `${dayOf(m.date)} ${db.products.find((p) => p.id === m.productId)?.name ?? "?"} ${m.qty > 0 ? "+" : ""}${num(m.qty, 1)} (${m.reason}${m.note ? ": " + m.note : ""})`).join("; ") || "ninguno"}.`,
  );

  // Resultados
  const d = periodProfit(db, today, today);
  const w = periodProfit(db, addDays(today, -6), today);
  const m = periodProfit(db, today.slice(0, 8) + "01", today);
  push(
    `\nRESULTADOS: hoy ventas ${ars(d.salesTotal)} (${d.sales.length} op.), ganancia neta ${ars(d.profit)}. Semana: ventas ${ars(w.salesTotal)}, ganancia ${ars(w.profit)}. Mes: ventas ${ars(m.salesTotal)}, costo ${ars(m.cost)}, comisiones ${ars(m.fees)}, gastos ${ars(m.exp)}, fijos prorrateados ${ars(m.fixed)}, ganancia neta ${ars(m.profit)}.`,
  );
  push(
    `Cierres hechos: ${
      db.closures
        .slice(0, 7)
        .map(
          (c) =>
            `${c.date} ventas ${ars(c.salesTotal)} ganancia ${ars(c.profit)} caja ${c.cashCounted === c.cashExpected ? "justa" : (c.cashCounted - c.cashExpected > 0 ? "sobró " : "faltó ") + ars(Math.abs(c.cashCounted - c.cashExpected))}`,
        )
        .join("; ") || "ninguno todavía"
    }.`,
  );

  return L.join("\n");
}
