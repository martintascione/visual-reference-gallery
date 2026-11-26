// Acciones que el asistente ejecuta en el sistema (borrar un cheque, editar un cliente, cobrar, etc.).
// El modelo manda "operaciones" con nombres y números como los dice el usuario; acá se buscan los
// registros y se usan las mismas acciones del sistema, así todo queda corregido en todos lados.
import type { Bank, Client, DB, ExpenseType, PaymentMethod } from "@/lib/types";
import { clientBalance, useStore } from "@/lib/store";
import { FELIX_BANK } from "@/lib/banks";
import { ars, todayISO } from "@/lib/format";

export type Operacion = {
  tipo: string;
  cliente?: string;
  nombre?: string;
  telefono?: string;
  email?: string;
  cuit?: string;
  dni?: string;
  direccion?: string;
  localidad?: string;
  iva?: string;
  limite?: number;
  nota?: string;
  hacia?: string;
  numero?: string;
  banco?: string;
  librador?: string;
  vencimiento?: string;
  monto?: number;
  cuenta?: string;
  fecha?: string;
  acreditado?: boolean;
  entregado_a?: string;
  concepto?: string;
  producto?: string;
  precio?: number;
  costo?: number;
  stock?: number;
  minimo?: number;
  medio?: string;
  tipo_gasto?: string;
  saldo?: number;
};

type Store = ReturnType<typeof useStore>;
type Res = { ok: boolean; texto: string };

const norm = (t?: string) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const digits = (t?: string) => (t ?? "").replace(/\D/g, "");

const BANKS: Record<string, Bank> = {
  "caja de ahorro": "BBVA CA",
  ahorro: "BBVA CA",
  caja: "Caja",
  efectivo: "Caja",
  bbva: "BBVA",
  frances: "BBVA",
  provincia: "Provincia",
  bapro: "Provincia",
  felix: FELIX_BANK,
  "el tecla": FELIX_BANK,
  tecla: FELIX_BANK,
};
function bankOf(t?: string, def: Bank = "Caja"): Bank {
  const n = norm(t);
  if (!n) return def;
  for (const [k, v] of Object.entries(BANKS)) if (n.includes(k)) return v;
  return def;
}

const isoOf = (d?: string) => {
  if (!d) return new Date().toISOString();
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const day = m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : d.slice(0, 10);
  return day === todayISO() ? new Date().toISOString() : `${day}T12:00:00.000Z`;
};
const dayOf = (d?: string) => isoOf(d).slice(0, 10);

function findClient(db: DB, name?: string): Client | string {
  const n = norm(name);
  if (!n) return "Falta el nombre del cliente.";
  const exact = db.clients.filter((c) => norm(c.name) === n);
  if (exact.length === 1) return exact[0]!;
  const byCuit =
    digits(name).length >= 7 ? db.clients.filter((c) => digits(c.cuit) === digits(name)) : [];
  if (byCuit.length === 1) return byCuit[0]!;
  const part = db.clients.filter((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  if (part.length === 1) return part[0]!;
  if (exact.length > 1 || part.length > 1)
    return `Hay varios clientes que coinciden con "${name}": ${[...exact, ...part]
      .slice(0, 5)
      .map((c) => c.name)
      .join(", ")}.`;
  return `No encontré el cliente "${name}".`;
}

function findCheque(db: DB, numero?: string, monto?: number) {
  const n = digits(numero);
  if (!n) return "Falta el número de cheque.";
  let list = db.cheques.filter((c) => digits(c.number) === n || digits(c.number).endsWith(n));
  if (list.length > 1 && monto)
    list = list.filter((c) => Math.round(c.amount) === Math.round(monto));
  if (list.length === 1) return list[0]!;
  if (list.length > 1)
    return `Hay ${list.length} cheques con el N° ${numero}: decime el monto o el banco.`;
  return `No encontré el cheque N° ${numero}.`;
}

function clientPatch(o: Operacion): Partial<Client> {
  const p: Partial<Client> = {};
  if (o.nombre !== undefined) p.name = o.nombre.trim();
  if (o.telefono !== undefined) p.phone = o.telefono.trim() || undefined;
  if (o.email !== undefined) p.email = o.email.trim() || undefined;
  if (o.cuit !== undefined) p.cuit = o.cuit.trim() || undefined;
  if (o.dni !== undefined) p.dni = o.dni.trim() || undefined;
  if (o.direccion !== undefined) p.address = o.direccion.trim() || undefined;
  if (o.localidad !== undefined) p.city = o.localidad.trim() || undefined;
  if (o.iva !== undefined) p.ivaCategory = o.iva.trim() || undefined;
  if (o.limite !== undefined) p.creditLimit = Math.max(0, o.limite);
  if (o.nota !== undefined) p.note = o.nota.trim() || undefined;
  return p;
}

function runOne(st: Store, o: Operacion): Res {
  const db = st.getDb();
  const fail = (texto: string): Res => ({ ok: false, texto });
  const done = (texto: string): Res => ({ ok: true, texto });
  switch (o.tipo) {
    case "crear_cliente": {
      const name = (o.nombre ?? o.cliente ?? "").trim();
      if (name.length < 2) return fail("Falta el nombre del cliente nuevo.");
      if (db.clients.some((c) => norm(c.name) === norm(name)))
        return fail(`Ya existe un cliente "${name}".`);
      st.upsertClient({
        id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        creditLimit: 0,
        ...clientPatch(o),
        name,
      });
      return done(`Cliente "${name}" creado.`);
    }
    case "editar_cliente": {
      const c = findClient(db, o.cliente);
      if (typeof c === "string") return fail(c);
      const patch = clientPatch(o);
      if (!Object.keys(patch).length) return fail("No me dijiste qué cambiar del cliente.");
      st.upsertClient({ ...c, ...patch });
      return done(`Cliente "${patch.name ?? c.name}" actualizado.`);
    }
    case "eliminar_cliente": {
      const c = findClient(db, o.cliente);
      if (typeof c === "string") return fail(c);
      const debt = clientBalance(db, c.id).balance;
      if (debt > 0)
        return fail(
          `${c.name} todavía debe ${ars(debt)}: primero hay que cobrar o borrar esas cuotas.`,
        );
      st.removeClient(c.id);
      return done(`Cliente "${c.name}" eliminado.`);
    }
    case "unir_clientes": {
      const a = findClient(db, o.cliente);
      const b = findClient(db, o.hacia);
      if (typeof a === "string") return fail(a);
      if (typeof b === "string") return fail(b);
      if (a.id === b.id) return fail("Es el mismo cliente.");
      st.mergeClients(a.id, b.id);
      return done(`"${a.name}" quedó unido a "${b.name}".`);
    }
    case "cargar_cheque": {
      if (!o.monto || o.monto <= 0) return fail("Falta el monto del cheque.");
      const c = o.cliente ? findClient(db, o.cliente) : null;
      const client = c && typeof c !== "string" ? c : undefined;
      st.addCheque({
        number: o.numero ?? "",
        bank: o.banco ?? "",
        drawer: o.librador ?? client?.name ?? o.cliente ?? "",
        dueDate: dayOf(o.vencimiento),
        amount: o.monto,
        status: "cartera",
        clientId: client?.id,
        clientName: client?.name ?? o.cliente ?? "",
        echeq: false,
        receivedDate: dayOf(o.fecha),
        ownerAccount: o.cuenta && bankOf(o.cuenta) === FELIX_BANK ? FELIX_BANK : undefined,
      });
      return done(`Cheque N° ${o.numero ?? "s/n"} de ${ars(o.monto)} cargado en la cartera.`);
    }
    case "editar_cheque": {
      const ch = findCheque(db, o.numero, undefined);
      if (typeof ch === "string") return fail(ch);
      const err = st.updateCheque(ch.id, {
        ...(o.banco !== undefined ? { bank: o.banco } : {}),
        ...(o.librador !== undefined ? { drawer: o.librador } : {}),
        ...(o.vencimiento ? { dueDate: dayOf(o.vencimiento) } : {}),
        ...(o.monto ? { amount: o.monto } : {}),
        ...(o.entregado_a !== undefined
          ? { givenTo: o.entregado_a, givenDate: o.fecha ? dayOf(o.fecha) : undefined }
          : {}),
      });
      return err ? fail(err) : done(`Cheque N° ${ch.number} actualizado.`);
    }
    case "eliminar_cheque": {
      const ch = findCheque(db, o.numero, o.monto);
      if (typeof ch === "string") return fail(ch);
      const err = st.removeCheque(ch.id);
      return err ? fail(err) : done(`Cheque N° ${ch.number} de ${ars(ch.amount)} eliminado.`);
    }
    case "cobrar_cheque": {
      const ch = findCheque(db, o.numero, o.monto);
      if (typeof ch === "string") return fail(ch);
      if (ch.status !== "cartera" && ch.status !== "depositado")
        return fail(`El cheque N° ${ch.number} está ${ch.status}.`);
      const bank = bankOf(o.cuenta, "Provincia");
      st.depositCheque(ch.id, bank, isoOf(o.fecha), o.acreditado !== false);
      return done(
        `Cheque N° ${ch.number} ${o.acreditado === false ? "depositado" : "cobrado"} en ${bank}.`,
      );
    }
    case "endosar_cheque": {
      const ch = findCheque(db, o.numero, o.monto);
      if (typeof ch === "string") return fail(ch);
      const to = (o.entregado_a ?? o.hacia ?? "").trim();
      if (!to) return fail("Falta a quién se le dio el cheque.");
      const err = st.updateCheque(ch.id, { givenTo: to, givenDate: dayOf(o.fecha) });
      return err ? fail(err) : done(`Cheque N° ${ch.number} endosado a ${to}.`);
    }
    case "cobrar_cuota": {
      const c = findClient(db, o.cliente);
      if (typeof c === "string") return fail(c);
      let left = Math.round(o.monto ?? 0);
      if (left <= 0) return fail("Falta el monto que pagó.");
      const m =
        db.settings.methods.find((x) => x.active && norm(x.label) === norm(o.medio)) ??
        db.settings.methods.find(
          (x) =>
            x.active &&
            x.method !== "cta_cte" &&
            norm(o.medio) &&
            norm(x.label).includes(norm(o.medio)),
        ) ??
        db.settings.methods.find((x) => x.active && x.method === "efectivo");
      if (!m) return fail("No encontré el medio de pago.");
      const dues = db.dues
        .filter((d) => d.clientId === c.id && d.paid < d.amount)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (!dues.length) return fail(`${c.name} no tiene cuotas pendientes.`);
      const total = left;
      for (const d of dues) {
        if (left <= 0) break;
        const pay = Math.min(left, d.amount - d.paid);
        st.payDue(d.id, pay, m.method, m.bank, m.gateway, { date: isoOf(o.fecha) });
        left -= pay;
      }
      return done(
        `Cobro de ${ars(total - left)} a ${c.name} con ${m.label}.${left > 0 ? ` Sobraron ${ars(left)}: no tenía más deuda.` : ""}`,
      );
    }
    case "registrar_gasto": {
      if (!o.monto || o.monto <= 0) return fail("Falta el monto del gasto.");
      const account = bankOf(o.cuenta, "Caja");
      const tipos: ExpenseType[] = ["fijo", "imprevisto", "debito", "flete", "compra"];
      const type = (tipos.find((t) => norm(o.tipo_gasto) === t) ?? "imprevisto") as ExpenseType;
      const method: PaymentMethod = account === "Caja" ? "efectivo" : "transferencia";
      st.addExpense({
        date: isoOf(o.fecha),
        type,
        concept: o.concepto?.trim() || "Gasto",
        amount: o.monto,
        account,
        method,
      });
      return done(`Gasto "${o.concepto ?? "Gasto"}" de ${ars(o.monto)} desde ${account}.`);
    }
    case "registrar_ingreso":
    case "registrar_egreso": {
      if (!o.monto || o.monto <= 0) return fail("Falta el monto.");
      const account = bankOf(o.cuenta, "Caja");
      const concept = o.concepto?.trim() || (o.tipo === "registrar_ingreso" ? "Ingreso" : "Egreso");
      if (o.tipo === "registrar_ingreso") st.addIncome(isoOf(o.fecha), concept, o.monto, account);
      else st.addOutflow(isoOf(o.fecha), concept, o.monto, account);
      return done(
        `${o.tipo === "registrar_ingreso" ? "Ingreso" : "Egreso"} de ${ars(o.monto)} en ${account}.`,
      );
    }
    case "ajustar_saldo": {
      if (o.saldo === undefined) return fail("Falta el saldo real.");
      const account = bankOf(o.cuenta, "Caja");
      st.adjustBalance(account, o.saldo, o.concepto);
      return done(`Saldo de ${account} ajustado a ${ars(o.saldo)}.`);
    }
    case "pago_felix": {
      if (!o.monto || o.monto <= 0) return fail("Falta el monto.");
      const how = norm(o.medio).includes("transf") ? "transferencia" : "efectivo";
      const to = how === "efectivo" ? "Caja" : bankOf(o.cuenta, "BBVA");
      st.settleFelix({ date: isoOf(o.fecha), amount: o.monto, how, to, note: o.concepto });
      return done(`Pago de Felix de ${ars(o.monto)} registrado (${how}, entra en ${to}).`);
    }
    case "editar_producto": {
      const n = norm(o.producto);
      if (!n) return fail("Falta el producto.");
      const list = db.products.filter((p) => norm(p.name) === n);
      const cands = list.length ? list : db.products.filter((p) => norm(p.name).includes(n));
      if (cands.length !== 1)
        return fail(
          cands.length
            ? `Hay varios productos parecidos: ${cands
                .slice(0, 5)
                .map((p) => p.name)
                .join(", ")}.`
            : `No encontré el producto "${o.producto}".`,
        );
      const p = cands[0]!;
      const next = { ...p };
      if (o.nombre) next.name = o.nombre.trim();
      if (o.precio !== undefined) next.price = o.precio;
      if (o.costo !== undefined) next.cost = o.costo;
      if (o.minimo !== undefined) next.minStock = o.minimo;
      st.upsertProduct(next);
      if (o.stock !== undefined && o.stock !== p.stock)
        st.addStockMove({
          date: new Date().toISOString(),
          productId: p.id,
          qty: o.stock - p.stock,
          reason: "ajuste",
          note: "Ajuste desde el asistente",
        });
      return done(`Producto "${next.name}" actualizado.`);
    }
    case "eliminar_venta": {
      const n = Number(digits(o.numero));
      const s = db.sales.find((x) => x.number === n);
      if (!s) return fail(`No encontré la venta #${o.numero}.`);
      st.removeSale(s.id);
      return done(`Venta #${n} eliminada (se devolvió el stock y se sacaron sus cobros).`);
    }
    case "eliminar_presupuesto": {
      const n = Number(digits(o.numero));
      const q = db.quotes.find((x) => x.number === n);
      if (!q) return fail(`No encontré el presupuesto #${o.numero}.`);
      st.removeQuote(q.id);
      return done(`Presupuesto #${n} eliminado.`);
    }
    default:
      return fail(`No sé hacer "${o.tipo}" todavía.`);
  }
}

/** Ejecuta las operaciones en orden y devuelve qué se hizo y qué no. */
export function runOperations(st: Store, ops: Operacion[]): Res[] {
  return ops.map((o) => {
    try {
      return runOne(st, o);
    } catch (e) {
      return { ok: false, texto: `Error: ${(e as Error).message}` };
    }
  });
}
