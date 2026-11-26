import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileCheck2, Pencil, Search, Trash2 } from "lucide-react";
import type { Cheque } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, daysBetween, fmtDateNum, todayISO } from "@/lib/format";
import { chequeFrom, chequeLabel } from "@/lib/cheque-labels";
import { SEPARATE_BANK, SEPARATE_NAME, bankLabel } from "@/lib/banks";
import {
  Badge,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  NumberInput,
  Toggle,
  PageHeader,
  Segmented,
  Stat,
  Table,
  btn,
  tr,
} from "@/components/ui-bits";
import { ChequeForm } from "@/components/cheque-form";

export const Route = createFileRoute("/cheques")({
  head: () => ({
    meta: [
      { title: "Cheques · Corralón" },
      {
        name: "description",
        content:
          "Historial de cheques: quién lo dio, de quién es, vencimiento y a quién se entregó.",
      },
    ],
  }),
  component: Cheques,
});

type Filter = "todos" | "cartera" | "entregados" | "propios" | "cobrados" | "rechazados" | "tecla";
const isTecla = (c: Cheque) => c.ownerAccount === SEPARATE_BANK || c.depositBank === SEPARATE_BANK;
const match = (c: Cheque, f: Filter) =>
  f === "todos"
    ? true
    : f === "tecla"
      ? isTecla(c)
      : f === "cartera"
        ? c.status === "cartera" || c.status === "depositado"
        : f === "entregados"
          ? c.status === "endosado"
          : f === "propios"
            ? !!c.own
            : f === "cobrados"
              ? c.status === "acreditado"
              : c.status === "rechazado";

function Cheques() {
  const { db, removeCheque } = useStore();
  const [editing, setEditing] = useState<Cheque | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const del = (c: Cheque) => {
    const extra =
      c.status === "depositado" || c.status === "acreditado"
        ? ` También se saca el depósito de ${c.depositBank ?? "el banco"}.`
        : c.dueId
          ? " La cuota que pagaba vuelve a quedar pendiente."
          : "";
    if (!window.confirm(`Eliminar el cheque N° ${c.number || "s/n"} de ${ars(c.amount)}?${extra}`))
      return;
    setMsg(removeCheque(c.id));
  };
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("todos");
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return db.cheques
      .filter((c) => match(c, f))
      .filter(
        (c) =>
          !t ||
          [c.number, c.bank, c.drawer, c.clientName, c.givenTo ?? "", String(c.amount)].some((x) =>
            x.toLowerCase().includes(t),
          ),
      )
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [db.cheques, q, f]);
  const sum = (fn: (c: Cheque) => boolean) =>
    db.cheques.filter(fn).reduce((a, c) => a + c.amount, 0);
  const tone = (c: Cheque) =>
    c.status === "rechazado"
      ? "danger"
      : c.status === "cartera" || c.status === "depositado"
        ? "dark"
        : c.status === "acreditado"
          ? "ok"
          : "muted";

  return (
    <>
      <PageHeader
        title="Cheques"
        subtitle="Todos los cheques que pasaron por el corralón: quién lo dio, de quién es, cuándo vence y a quién se entregó"
      >
        <button className={btn.primary} onClick={() => setAdding(true)}>
          <FileCheck2 className="h-4 w-4" strokeWidth={1.6} /> Cargar cheque recibido
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="En cartera"
          value={ars(sum((c) => c.status === "cartera" || c.status === "depositado"))}
        />
        <Stat
          label="De clientes entregados a proveedores"
          value={ars(sum((c) => c.status === "endosado"))}
        />
        <Stat
          label="Propios emitidos sin vencer"
          value={ars(sum((c) => !!c.own && c.dueDate >= today))}
        />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, nombre, banco o monto"
              className="pl-9"
            />
          </div>
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: "todos", label: "Todos" },
              { value: "cartera", label: "En cartera" },
              { value: "entregados", label: "Entregados" },
              { value: "propios", label: "Propios" },
              { value: "cobrados", label: "Cobrados" },
              { value: "rechazados", label: "Rechazados" },
              { value: "tecla", label: "El Tecla" },
            ]}
          />
        </div>
        {msg && (
          <p className="mb-3 rounded-2xl bg-danger-soft px-4 py-2 text-xs text-danger-soft-foreground">
            {msg}
          </p>
        )}
        <Table
          head={[
            "Vence",
            "N° y banco",
            "Quién me lo dio",
            "De quién es",
            { label: "Monto", right: true },
            "Estado",
            "Entregado a",
            "",
          ]}
          min={860}
        >
          {list.map((c) => {
            const d = daysBetween(today, c.dueDate);
            const open = c.status === "cartera" || c.status === "depositado";
            return (
              <tr key={c.id} className={tr}>
                <td className="whitespace-nowrap align-top">
                  <p className="font-medium tabular-nums">{fmtDateNum(c.dueDate)}</p>
                  {open && (
                    <p className="text-[11px] text-muted-foreground">
                      {d < 0 ? `venció hace ${-d} d` : d === 0 ? "cobra hoy" : `en ${d} d`}
                    </p>
                  )}
                </td>
                <td className="align-top">
                  <p className="font-medium">
                    N° {c.number || "s/n"}
                    {c.echeq && <Badge className="ml-1">e-cheq</Badge>}
                    {isTecla(c) && (
                      <Badge className="ml-1" tone="dark">
                        {SEPARATE_NAME}
                      </Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{c.bank}</p>
                </td>
                <td className="align-top">
                  <p>{chequeFrom(c)}</p>
                  {c.receivedDate && (
                    <p className="text-[11px] text-muted-foreground">
                      el {fmtDateNum(c.receivedDate)}
                    </p>
                  )}
                </td>
                <td className="align-top">{c.drawer || "—"}</td>
                <td className="text-right align-top font-semibold tabular-nums">{ars(c.amount)}</td>
                <td className="align-top">
                  <Badge tone={tone(c)}>{chequeLabel[c.status]}</Badge>
                  {c.depositBank && c.status !== "cartera" && !c.own && c.status !== "endosado" && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      en {bankLabel(c.depositBank)}
                    </p>
                  )}
                </td>
                <td className="align-top">
                  {c.givenTo ? (
                    <>
                      <p>{c.givenTo}</p>
                      {c.givenDate && (
                        <p className="text-[11px] text-muted-foreground">
                          el {fmtDateNum(c.givenDate)}
                        </p>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap text-right align-top">
                  <button
                    className={btn.icon}
                    aria-label="Editar cheque"
                    title="Editar cheque"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                  <button
                    className={btn.icon}
                    aria-label="Eliminar cheque"
                    title="Eliminar cheque"
                    onClick={() => del(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
        {list.length === 0 && (
          <Empty
            title={db.cheques.length === 0 ? "Todavía no hay cheques" : "Ningún cheque coincide"}
            text="Acá queda cada cheque recibido de un cliente y cada cheque con el que se le paga a un proveedor."
          />
        )}
      </Card>
      <ChequeForm open={adding} onClose={() => setAdding(false)} />
      <ChequeEdit
        cheque={editing}
        onClose={(m) => {
          setEditing(null);
          setMsg(m ?? null);
        }}
      />
    </>
  );
}

function ChequeEdit({
  cheque,
  onClose,
}: {
  cheque: Cheque | null;
  onClose: (msg?: string | null) => void;
}) {
  const { db, updateCheque } = useStore();
  const [c, setC] = useState<Cheque | null>(cheque);
  const [last, setLast] = useState(cheque?.id);
  if (cheque?.id !== last) {
    setLast(cheque?.id);
    setC(cheque);
  }
  if (!cheque || !c) return null;
  const sale = cheque.saleId ? db.sales.find((x) => x.id === cheque.saleId) : undefined;
  const supplierPay = db.supplierPayments.some((x) => x.chequeId === cheque.id);
  const lockAmount = !!sale || supplierPay;
  const save = () =>
    onClose(
      updateCheque(cheque.id, {
        number: c.number.trim(),
        bank: c.bank.trim(),
        drawer: c.drawer.trim(),
        dueDate: c.dueDate,
        receivedDate: c.receivedDate || undefined,
        echeq: c.echeq,
        amount: c.amount,
        givenTo: c.givenTo?.trim() || undefined,
      }),
    );
  return (
    <Modal open onClose={() => onClose()} title={`Editar cheque N° ${cheque.number || "s/n"}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="N° de cheque">
          <Input value={c.number} onChange={(e) => setC({ ...c, number: e.target.value })} />
        </Field>
        <Field label="Banco emisor">
          <Input value={c.bank} onChange={(e) => setC({ ...c, bank: e.target.value })} />
        </Field>
        <Field label="De quién es (librador)">
          <Input value={c.drawer} onChange={(e) => setC({ ...c, drawer: e.target.value })} />
        </Field>
        <Field
          label="Monto"
          hint={
            sale
              ? `Es el cobro de la venta #${sale.number}: el monto se cambia editando la venta`
              : supplierPay
                ? "Es un pago a proveedor: el monto se cambia desde ese pago"
                : undefined
          }
        >
          <NumberInput
            value={c.amount}
            onChange={(v) => setC({ ...c, amount: v })}
            prefix="$"
            disabled={lockAmount}
          />
        </Field>
        <Field label="Vencimiento (fecha de cobro)">
          <Input
            type="date"
            value={c.dueDate}
            onChange={(e) => setC({ ...c, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Lo recibí el">
          <Input
            type="date"
            value={c.receivedDate ?? ""}
            onChange={(e) => setC({ ...c, receivedDate: e.target.value })}
          />
        </Field>
        {cheque.status === "endosado" && (
          <Field label="Entregado a" className="col-span-2">
            <Input
              value={c.givenTo ?? ""}
              onChange={(e) => setC({ ...c, givenTo: e.target.value })}
            />
          </Field>
        )}
        <div className="col-span-2">
          <Toggle checked={c.echeq} onChange={(v) => setC({ ...c, echeq: v })} label="Es e-cheq" />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={() => onClose()}>
          Cancelar
        </button>
        <button className={btn.primary} disabled={!c.dueDate || c.amount <= 0} onClick={save}>
          Guardar cambios
        </button>
      </div>
    </Modal>
  );
}
