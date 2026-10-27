import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MessageCircle, Pencil, Plus, Search, Users, Wallet } from "lucide-react";
import type { Client, Due } from "@/lib/types";
import { clientBalance, useStore } from "@/lib/store";
import { ars, daysBetween, fmtDate, todayISO, uid } from "@/lib/format";
import {
  Badge,
  Card,
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
  const { db, upsertClient } = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Client | "new" | null>(null);
  const today = todayISO();

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
        <button className={btn.primary} onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </button>
      </PageHeader>
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
  const { db, payDue } = useStore();
  const b = clientBalance(db, client.id);
  const today = todayISO();
  const [paying, setPaying] = useState<Due | null>(null);
  const [amount, setAmount] = useState(0);
  const [methodId, setMethodId] = useState(db.settings.methods[0]?.id ?? "");
  const methods = db.settings.methods.filter((m) => m.active && m.method !== "cta_cte");
  const pending = b.dues
    .filter((d) => d.paid < d.amount)
    .sort((x, y) => x.dueDate.localeCompare(y.dueDate));
  const paid = b.dues.filter((d) => d.paid >= d.amount);

  const open = (d: Due) => {
    setPaying(d);
    setAmount(d.amount - d.paid);
  };
  const confirm = () => {
    const cfg = methods.find((m) => m.id === methodId);
    if (!paying || !cfg) return;
    payDue(paying.id, amount, cfg.method, cfg.bank, cfg.gateway);
    setPaying(null);
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
                {sale ? ` · venta #${sale.number}` : ""}
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

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={`Cobrar cuota ${paying?.n}/${paying?.of} · ${client.name}`}
      >
        <div className="flex flex-col gap-3">
          <Field label="Monto">
            <NumberInput value={amount} onChange={setAmount} />
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
          <div className="flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setPaying(null)}>
              Cancelar
            </button>
            <button className={btn.primary} disabled={amount <= 0} onClick={confirm}>
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
  const base: Client =
    client && client !== "new" ? client : { id: uid(), name: "", creditLimit: 0 };
  const [c, setC] = useState<Client>(base);
  const key = client === "new" ? "new" : (client?.id ?? "");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setC(base);
  }
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
        <Field label="CUIT (opcional)">
          <Input value={c.cuit ?? ""} onChange={(e) => setC({ ...c, cuit: e.target.value })} />
        </Field>
        <Field label="Dirección" className="col-span-2">
          <Input
            value={c.address ?? ""}
            onChange={(e) => setC({ ...c, address: e.target.value })}
          />
        </Field>
        <Field label="Límite de crédito" hint="0 = sin límite">
          <NumberInput value={c.creditLimit} onChange={(v) => setC({ ...c, creditLimit: v })} />
        </Field>
        <Field label="Nota">
          <Input value={c.note ?? ""} onChange={(e) => setC({ ...c, note: e.target.value })} />
        </Field>
      </div>
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
