import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Pencil, Plus, Search, Users, Wallet } from "lucide-react";
import type { Client, Due } from "@/lib/types";
import { clientBalance, useStore } from "@/lib/store";
import { padronLookup } from "@/lib/arca";
import { ClientDebtForm } from "@/components/debt-forms";
import { FelixViaFields, type FelixVia, viaParse, viaText } from "@/components/felix-via";
import { ars, daysBetween, fmtDate, todayISO, uid } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Stat,
  Table,
  btn,
  tr,
  Toggle,
} from "@/components/ui-bits";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes · Corralón" },
      { name: "description", content: "Clientes, cuentas corrientes, cuotas y cobros." },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const { db, upsertClient, pendingAction, setPendingAction } = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Client | "new" | null>(null);
  useEffect(() => {
    if (pendingAction?.tipo === "nuevo_cliente") {
      setEdit({
        id: "c" + Date.now().toString(36),
        name: pendingAction.nombre ?? "",
        phone: pendingAction.telefono,
        creditLimit: 0,
      });
      setPendingAction(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);
  const today = todayISO();
  const [debt, setDebt] = useState(false);

  const rows = useMemo(
    () =>
      db.clients
        .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
        .map((c) => ({
          c,
          b: clientBalance(db, c.id),
          lastSale: db.sales.find((s) => s.clientId === c.id),
        }))
        .sort((a, b) => b.b.overdue - a.b.overdue || b.b.balance - a.b.balance),
    [db, q],
  );
  const totalDebt = rows.reduce((a, r) => a + r.b.balance, 0);
  const totalOverdue = rows.reduce((a, r) => a + r.b.overdue, 0);
  const selected = db.clients.find((c) => c.id === sel);

  return (
    <>
      <PageHeader title="Clientes y cuentas corrientes" subtitle={`${db.clients.length} clientes`}>
        <button data-tour="cargar-cc" className={btn.soft} onClick={() => setDebt(true)}>
          <Wallet className="h-4 w-4" strokeWidth={1.6} /> Cargar cuenta corriente
        </button>
        <button className={btn.primary} onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </button>
      </PageHeader>
      <ClientDebtForm open={debt} onClose={() => setDebt(false)} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Total a cobrar"
          value={ars(totalDebt)}
          sub={`${rows.filter((r) => r.b.balance > 0).length} clientes con saldo`}
        />
        <Stat
          label="Vencido"
          value={ars(totalOverdue)}
          tone={totalOverdue ? "danger" : undefined}
          sub={totalOverdue ? "cuotas pasadas de fecha" : "nada vencido"}
        />
        <Stat
          label="Cuotas que vencen esta semana"
          value={String(
            db.dues.filter(
              (d) => d.paid < d.amount && d.dueDate >= today && daysBetween(today, d.dueDate) <= 7,
            ).length,
          )}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card icon={Users} title="Clientes">
          <label className="mb-3 flex h-10 w-full max-w-xs items-center gap-2 rounded-full bg-surface px-4">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente"
              className="min-w-0 flex-1 bg-transparent text-sm outline-hidden"
            />
          </label>
          <Table
            head={[
              "Cliente",
              "Teléfono",
              { label: "Debe", right: true },
              { label: "Vencido", right: true },
              "Última compra",
              "",
            ]}
            min={640}
          >
            {rows.map(({ c, b, lastSale }) => (
              <tr
                key={c.id}
                className={`${tr} cursor-pointer hover:bg-surface ${sel === c.id ? "bg-surface" : ""}`}
                onClick={() => setSel(c.id)}
              >
                <td>
                  <p className="font-medium">{c.name}</p>
                  {c.cuit && <p className="text-[11px] text-muted-foreground">{c.cuit}</p>}
                </td>
                <td className="text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="text-right font-semibold tabular-nums">
                  {b.balance ? ars(b.balance) : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {b.overdue ? (
                    <Badge tone="danger">{ars(b.overdue)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-muted-foreground">{lastSale ? fmtDate(lastSale.date) : "—"}</td>
                <td className="text-right">
                  <button
                    className={btn.icon}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit(c);
                    }}
                    aria-label="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          {rows.length === 0 && (
            <Empty
              text={
                db.clients.length
                  ? "No hay clientes con ese nombre."
                  : "Todavía no hay clientes. Los que compran a cuenta corriente conviene cargarlos con teléfono y límite de crédito; los demás se crean solos al vender."
              }
              action={
                !db.clients.length && (
                  <button className={btn.primary} onClick={() => setEdit("new")}>
                    <Plus className="h-4 w-4" /> Nuevo cliente
                  </button>
                )
              }
            />
          )}
        </Card>

        <Card icon={Wallet} title={selected ? `Cuenta de ${selected.name}` : "Cuenta corriente"}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Elegí un cliente para ver sus cuotas y registrar cobros.
            </p>
          ) : (
            <Account client={selected} />
          )}
        </Card>
      </div>

      <ClientEditor
        client={edit}
        onClose={() => setEdit(null)}
        onSave={(c) => {
          upsertClient(c);
          setEdit(null);
        }}
      />
    </>
  );
}

function Account({ client }: { client: Client }) {
  const { db, payDue, undoDuePayment } = useStore();
  const b = clientBalance(db, client.id);
  const today = todayISO();
  const [paying, setPaying] = useState<Due | null>(null);
  const [amount, setAmount] = useState(0);
  const [payDate, setPayDate] = useState(today);
  const [chq, setChq] = useState({
    number: "",
    bank: "",
    drawer: "",
    dueDate: today,
    echeq: false,
  });
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  const [via, setVia] = useState<FelixVia>(viaParse());
  const dueIds = new Set(b.dues.map((d) => d.id));
  const dueLabel = (id?: string) => {
    const d = b.dues.find((x) => x.id === id);
    return d ? `Cuota ${d.n}/${d.of}` : "Cuota";
  };
  const cobros = [
    ...db.movements
      .filter((m) => m.kind === "cobro" && m.refId && dueIds.has(m.refId))
      .map((m) => ({
        key: m.id,
        date: m.date.slice(0, 10),
        amount: m.amount,
        label: `${dueLabel(m.refId)} · ${m.account}`,
        ref: { movementId: m.id },
      })),
    ...db.cheques
      .filter((c) => c.dueId && dueIds.has(c.dueId))
      .map((c) => ({
        key: c.id,
        date: c.receivedDate ?? c.dueDate,
        amount: c.amount,
        label: `${dueLabel(c.dueId)} · cheque ${c.bank} ${c.number}`.trim(),
        ref: { chequeId: c.id },
      })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  const [methodId, setMethodId] = useState(db.settings.methods[0]?.id ?? "");
  const methods = db.settings.methods.filter((m) => m.active && m.method !== "cta_cte");
  const pending = b.dues
    .filter((d) => d.paid < d.amount)
    .sort((x, y) => x.dueDate.localeCompare(y.dueDate));
  const paid = b.dues.filter((d) => d.paid >= d.amount);

  const open = (d: Due) => {
    setPaying(d);
    setAmount(d.amount - d.paid);
    setPayDate(today);
    setVia(viaParse());
    setChq({ number: "", bank: "", drawer: client.name, dueDate: today, echeq: false });
  };
  const cfgSel = methods.find((m) => m.id === methodId);
  const isCheque = cfgSel?.method === "cheque";
  const confirm = () => {
    const cfg = cfgSel;
    if (!paying || !cfg) return;
    const date =
      payDate === today ? new Date().toISOString() : new Date(`${payDate}T12:00:00`).toISOString();
    payDue(paying.id, amount, cfg.method, cfg.bank, cfg.gateway, {
      date,
      via: cfg.method === "felix" ? viaText(via) : undefined,
      cheque: isCheque ? chq : undefined,
    });
    setPaying(null);
  };
  const undo = (ref: { movementId?: string; chequeId?: string }, label: string) => {
    if (!window.confirm(`Borrar el cobro "${label}"? La cuota vuelve a quedar pendiente.`)) return;
    setUndoMsg(undoDuePayment(ref));
  };

  const waText = encodeURIComponent(
    `Hola ${client.name}, te recordamos que tenés ${ars(b.balance)} pendientes en ${db.settings.businessName}${b.overdue ? ` (${ars(b.overdue)} vencido)` : ""}. ¡Gracias!`,
  );
  const phone = (client.phone ?? "").replace(/\D/g, "");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-2xl bg-surface p-2">
          <p className="text-muted-foreground">Debe</p>
          <p className="font-semibold">{ars(b.balance)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2">
          <p className="text-muted-foreground">Vencido</p>
          <p className={`font-semibold ${b.overdue ? "text-danger-soft-foreground" : ""}`}>
            {ars(b.overdue)}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2">
          <p className="text-muted-foreground">Límite</p>
          <p className="font-semibold">
            {client.creditLimit ? ars(client.creditLimit) : "Sin límite"}
          </p>
        </div>
      </div>
      {b.balance > 0 && phone && (
        <a
          href={`https://wa.me/54${phone}?text=${waText}`}
          target="_blank"
          rel="noreferrer"
          className={btn.soft}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.6} /> Recordar por WhatsApp
        </a>
      )}
      <p className="px-1 text-xs font-semibold">Cuotas pendientes</p>
      {pending.length === 0 && <p className="px-1 text-xs text-muted-foreground">No debe nada.</p>}
      {pending.map((d) => {
        const sale = db.sales.find((s) => s.id === d.saleId);
        const overdue = d.dueDate < today;
        return (
          <div
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 text-xs"
          >
            <div>
              <p className="font-medium">
                Cuota {d.n}/{d.of}
                {sale ? ` · venta #${sale.number}` : d.concept ? ` · ${d.concept}` : ""}
              </p>
              <p className={overdue ? "text-danger-soft-foreground" : "text-muted-foreground"}>
                {overdue ? `Venció el ${fmtDate(d.dueDate)}` : `Vence el ${fmtDate(d.dueDate)}`}
                {d.paid > 0 && ` · pagó ${ars(d.paid)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{ars(d.amount - d.paid)}</span>
              <button className={`${btn.primary} h-8 px-3 text-xs`} onClick={() => open(d)}>
                Cobrar
              </button>
            </div>
          </div>
        );
      })}
      {paid.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer px-1 text-muted-foreground">
            {paid.length} cuotas pagadas
          </summary>
          {paid.map((d) => (
            <p key={d.id} className="flex justify-between px-1 py-1 text-muted-foreground">
              <span>
                Cuota {d.n}/{d.of} · {fmtDate(d.dueDate)}
              </span>
              <span>{ars(d.amount)}</span>
            </p>
          ))}
        </details>
      )}

      {cobros.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer px-1 text-muted-foreground">
            Cobros registrados ({cobros.length}) · borrar uno mal cargado
          </summary>
          {undoMsg && <p className="px-1 py-1 text-danger-soft-foreground">{undoMsg}</p>}
          {cobros.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 px-1 py-1">
              <span className="text-muted-foreground">
                {fmtDate(c.date)} · {c.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{ars(c.amount)}</span>
                <button
                  className="text-danger-soft-foreground underline"
                  onClick={() => undo(c.ref, c.label)}
                >
                  Borrar
                </button>
              </span>
            </div>
          ))}
        </details>
      )}

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={`Cobrar cuota ${paying?.n}/${paying?.of} · ${client.name}`}
      >
        <div className="flex flex-col gap-3">
          <Field label="Monto">
            <NumberInput value={amount} onChange={setAmount} prefix="$" />
          </Field>
          <Field label="Cómo paga">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isCheque ? "Fecha en que te dio el cheque" : "Fecha del cobro"}>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </Field>
          {cfgSel?.method === "felix" && (
            <>
              <FelixViaFields value={via} onChange={setVia} />
              <p className="text-xs text-muted-foreground">
                La cuota queda pagada y el importe pasa a la cuenta corriente con Felix (El Tecla).
              </p>
            </>
          )}
          {isCheque && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="N° de cheque *">
                <Input
                  value={chq.number}
                  onChange={(e) => setChq({ ...chq, number: e.target.value })}
                />
              </Field>
              <Field label="Banco *">
                <Input
                  value={chq.bank}
                  onChange={(e) => setChq({ ...chq, bank: e.target.value })}
                />
              </Field>
              <Field label="Librador">
                <Input
                  value={chq.drawer}
                  onChange={(e) => setChq({ ...chq, drawer: e.target.value })}
                />
              </Field>
              <Field label="Vencimiento (fecha de cobro)">
                <Input
                  type="date"
                  value={chq.dueDate}
                  onChange={(e) => setChq({ ...chq, dueDate: e.target.value })}
                />
              </Field>
              <Toggle
                checked={chq.echeq}
                onChange={(v) => setChq({ ...chq, echeq: v })}
                label="Es e-cheq"
              />
              <p className="col-span-2 text-xs text-muted-foreground">
                El cheque queda en la cartera (Cheques). La plata entra al banco cuando lo
                depositás.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setPaying(null)}>
              Cancelar
            </button>
            <button
              className={btn.primary}
              disabled={
                amount <= 0 ||
                (isCheque && (!chq.number.trim() || !chq.bank.trim() || !chq.dueDate))
              }
              onClick={confirm}
            >
              Registrar cobro
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ClientEditor({
  client,
  onClose,
  onSave,
}: {
  client: Client | "new" | null;
  onClose: () => void;
  onSave: (c: Client) => void;
}) {
  const { db, removeClient, mergeClients } = useStore();
  const [mergeTo, setMergeTo] = useState("");
  const editing = client && client !== "new" ? client : null;
  const debt = editing ? clientBalance(db, editing.id).balance : 0;
  const del = () => {
    if (!editing) return;
    if (debt > 0) {
      window.alert(
        `${editing.name} debe ${ars(debt)}. Cobrá o borrá esas cuotas primero, o unilo con otro cliente.`,
      );
      return;
    }
    if (
      !window.confirm(`Eliminar a ${editing.name}? Sus ventas y presupuestos quedan con el nombre.`)
    )
      return;
    removeClient(editing.id);
    onClose();
  };
  const merge = () => {
    const to = db.clients.find((x) => x.id === mergeTo);
    if (!editing || !to) return;
    if (
      !window.confirm(
        `Unir ${editing.name} con ${to.name}? Todas sus ventas, cuotas, cheques y acopios pasan a ${to.name} y ${editing.name} se elimina.`,
      )
    )
      return;
    mergeClients(editing.id, to.id);
    onClose();
  };
  const base: Client =
    client && client !== "new" ? client : { id: uid(), name: "", creditLimit: 0 };
  const [c, setC] = useState<Client>(base);
  const key = client === "new" ? "new" : (client?.id ?? "");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setC(base);
  }
  const [arcaBusy, setArcaBusy] = useState(false);
  const [arcaMsg, setArcaMsg] = useState<string | null>(null);
  const lookup = async () => {
    setArcaBusy(true);
    setArcaMsg(null);
    try {
      const p = await padronLookup(c.cuit ?? "");
      setC((prev) => ({
        ...prev,
        name: p.nombre || prev.name,
        cuit: p.cuit,
        address: p.direccion || prev.address,
        city: p.localidad || prev.city,
        ivaCategory: p.condicionIva,
      }));
      setArcaMsg(`ARCA: ${p.nombre} · ${p.condicionIva}${p.estado ? ` · ${p.estado}` : ""}`);
    } catch (e) {
      setArcaMsg(e instanceof Error ? e.message : "No se pudo consultar ARCA");
    } finally {
      setArcaBusy(false);
    }
  };
  return (
    <Modal
      open={!!client}
      onClose={onClose}
      title={client === "new" ? "Nuevo cliente" : "Editar cliente"}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" className="col-span-2">
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Teléfono">
          <Input
            value={c.phone ?? ""}
            onChange={(e) => setC({ ...c, phone: e.target.value })}
            placeholder="11 5555-0000"
          />
        </Field>
        <Field label="Email" hint="Para mandarle las facturas automáticamente">
          <Input
            type="email"
            value={c.email ?? ""}
            onChange={(e) => setC({ ...c, email: e.target.value })}
            placeholder="cliente@correo.com"
          />
        </Field>
        <Field
          label="CUIT (opcional)"
          hint={arcaMsg ?? "Con 11 números, buscá en ARCA para completar los datos"}
        >
          <div className="flex items-center gap-2">
            <Input
              value={c.cuit ?? ""}
              onChange={(e) => setC({ ...c, cuit: e.target.value })}
              inputMode="numeric"
            />
            <button
              type="button"
              className={btn.icon}
              aria-label="Buscar en ARCA"
              title="Buscar en ARCA"
              disabled={arcaBusy || (c.cuit ?? "").replace(/\D/g, "").length !== 11}
              onClick={() => void lookup()}
            >
              {arcaBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </div>
        </Field>
        <Field label="Dirección">
          <Input
            value={c.address ?? ""}
            onChange={(e) => setC({ ...c, address: e.target.value })}
          />
        </Field>
        <Field label="Localidad">
          <Input
            value={c.city ?? ""}
            onChange={(e) => setC({ ...c, city: e.target.value })}
            placeholder="Trenque Lauquen"
          />
        </Field>
        <Field label="DNI (si no tiene CUIT)">
          <Input value={c.dni ?? ""} onChange={(e) => setC({ ...c, dni: e.target.value })} />
        </Field>
        <Field label="Categoría de IVA">
          <Select
            value={c.ivaCategory ?? ""}
            onChange={(e) => setC({ ...c, ivaCategory: e.target.value || undefined })}
          >
            <option value="">Sin especificar</option>
            <option value="Consumidor final">Consumidor final</option>
            <option value="Responsable inscripto">Responsable inscripto</option>
            <option value="Monotributo">Monotributo</option>
            <option value="Exento">Exento</option>
          </Select>
        </Field>
        <Field label="Límite de crédito" hint="0 = sin límite">
          <NumberInput
            value={c.creditLimit}
            onChange={(v) => setC({ ...c, creditLimit: v })}
            prefix="$"
          />
        </Field>
        <Field label="Nota">
          <Input value={c.note ?? ""} onChange={(e) => setC({ ...c, note: e.target.value })} />
        </Field>
      </div>
      {editing && (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-surface p-3 text-xs">
          <p className="font-semibold">Cliente repetido o mal cargado</p>
          <div className="flex items-center gap-2">
            <Select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
              <option value="">Unir con otro cliente…</option>
              {db.clients
                .filter((x) => x.id !== editing.id)
                .sort((x, y) => x.name.localeCompare(y.name))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </Select>
            <button className={`${btn.soft} h-9 px-3`} disabled={!mergeTo} onClick={merge}>
              Unir
            </button>
          </div>
          <button className="self-start text-danger-soft-foreground underline" onClick={del}>
            Eliminar cliente
          </button>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={c.name.trim().length < 2}
          onClick={() => onSave({ ...c, name: c.name.trim() })}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}

/** Carga rápida de una cuenta corriente: los datos mínimos del cliente y cuánto debe. */
