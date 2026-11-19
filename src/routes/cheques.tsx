import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileCheck2, Search } from "lucide-react";
import type { Cheque } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, daysBetween, fmtDateNum, todayISO } from "@/lib/format";
import { chequeFrom, chequeLabel } from "@/lib/cheque-labels";
import {
  Badge,
  Card,
  Empty,
  Input,
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

type Filter = "todos" | "cartera" | "entregados" | "propios" | "cobrados" | "rechazados";
const match = (c: Cheque, f: Filter) =>
  f === "todos"
    ? true
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
  const { db } = useStore();
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
            ]}
          />
        </div>
        <Table
          head={[
            "Vence",
            "N° y banco",
            "Quién me lo dio",
            "De quién es",
            { label: "Monto", right: true },
            "Estado",
            "Entregado a",
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
                    <p className="mt-0.5 text-[11px] text-muted-foreground">en {c.depositBank}</p>
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
    </>
  );
}
