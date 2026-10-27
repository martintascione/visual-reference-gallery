import type { Bank, Category, DB, ExpenseType, SaleUnit } from "./types";
import { supabase } from "./supabase";
import { accountBalance, clientBalance, periodProfit } from "./store";
import { addDays, ars, todayISO } from "./format";

/** Acciones que el asistente puede disparar en la web (se ejecutan en el navegador). */
export type AssistantAction =
  | { tipo: "ir"; ruta: string }
  | {
      tipo: "nueva_venta";
      cliente?: string;
      items?: { producto: string; cantidad: number; unidad?: SaleUnit }[];
    }
  | {
      tipo: "nuevo_producto";
      nombre?: string;
      categoria?: Category;
      precio_proveedor?: number;
      margen?: number;
    }
  | {
      tipo: "nuevo_gasto";
      concepto?: string;
      monto?: number;
      cuenta?: Bank;
      tipo_gasto?: ExpenseType;
    }
  | { tipo: "nuevo_cliente"; nombre?: string; telefono?: string }
  | { tipo: "cargar_stock"; producto?: string };

export type AssistantButton = { etiqueta: string; accion: AssistantAction };

export type AssistantReply = {
  texto: string;
  botones?: AssistantButton[] | undefined;
  mejora?:
    | { titulo: string; descripcion: string; flujo?: string; datos?: string; prioridad?: string }
    | undefined;
  error?: string | undefined;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  botones?: AssistantButton[] | undefined;
  nota?: string | undefined;
};

export const routeFor: Record<AssistantAction["tipo"], string> = {
  ir: "/",
  nueva_venta: "/nueva-venta",
  nuevo_producto: "/catalogo",
  nuevo_gasto: "/gastos",
  nuevo_cliente: "/clientes",
  cargar_stock: "/stock",
};

/** Resumen compacto del negocio para que el asistente responda con datos reales. */
export function businessContext(db: DB) {
  const today = todayISO();
  const week = periodProfit(db, addDays(today, -6), today);
  const day = periodProfit(db, today, today);
  const low = db.products
    .filter((p) => p.active && p.stock < p.minStock)
    .map((p) => `${p.name} (${Math.round(p.stock)} ${p.unit})`);
  const debtors = db.clients
    .map((c) => ({ c, b: clientBalance(db, c.id) }))
    .filter((x) => x.b.balance > 0);
  const products = db.products
    .filter((p) => p.active)
    .map(
      (p) =>
        `${p.name} [${p.category}] ${p.bagPrice ? ars(p.bagPrice) + "/bolsón, " : ""}${ars(p.price)}/${p.unit}`,
    );
  return [
    `Fecha: ${today}. Negocio: ${db.settings.businessName}.`,
    `Productos (${products.length}): ${products.slice(0, 40).join("; ") || "ninguno cargado todavía"}.`,
    `Clientes cargados: ${db.clients.length}. Con deuda: ${debtors.map((x) => `${x.c.name} ${ars(x.b.balance)}${x.b.overdue ? " (vencido " + ars(x.b.overdue) + ")" : ""}`).join("; ") || "ninguno"}.`,
    `Hoy: ventas ${ars(day.salesTotal)} (${day.sales.length} operaciones), ganancia estimada ${ars(day.profit)}. Última semana: ventas ${ars(week.salesTotal)}, ganancia ${ars(week.profit)}.`,
    `Saldos: Caja ${ars(accountBalance(db, "Caja"))}, BBVA ${ars(accountBalance(db, "BBVA"))}, Provincia ${ars(accountBalance(db, "Provincia"))}.`,
    `Stock bajo: ${low.join(", ") || "ninguno"}.`,
    `Cheques en cartera: ${db.cheques.filter((c) => c.status === "cartera").length}. Presupuestos abiertos: ${db.quotes.filter((q) => q.status === "enviado" || q.status === "seguimiento").length}. Ventas sin cerrar: ${db.sales.filter((s) => !s.closureId).length}.`,
    `Medios de cobro configurados: ${db.settings.methods
      .filter((m) => m.active)
      .map((m) => `${m.label}${m.feePct ? " " + m.feePct + "%" : ""}`)
      .join(", ")}.`,
    `Zonas de flete: ${db.settings.zones.map((z) => `${z.name} ${ars(z.price)}`).join(", ") || "ninguna"}.`,
  ].join("\n");
}

export async function askAssistant(
  messages: ChatMessage[],
  contexto: string,
): Promise<AssistantReply> {
  const { data, error } = await supabase.functions.invoke<AssistantReply>("asistente", {
    body: { messages: messages.map((m) => ({ role: m.role, content: m.content })), contexto },
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = (await ctx.json()) as { error?: string };
        if (body.error) detail = body.error;
      }
    } catch {
      /* sin detalle */
    }
    return { texto: "", error: detail };
  }
  if (!data) return { texto: "", error: "Sin respuesta" };
  return data;
}

export async function saveFeatureRequest(
  m: NonNullable<AssistantReply["mejora"]>,
  conversacion: ChatMessage[],
  user?: string,
) {
  const { error } = await supabase.from("feature_requests").insert({
    titulo: m.titulo,
    descripcion: m.descripcion,
    flujo: m.flujo ?? null,
    datos: m.datos ?? null,
    prioridad: m.prioridad ?? "media",
    conversacion: conversacion.slice(-10).map((x) => ({ role: x.role, content: x.content })),
    pedido_por: user ?? null,
  });
  return !error;
}
