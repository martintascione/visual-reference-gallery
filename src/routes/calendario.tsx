import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CreditCard,
  FileText,
  Receipt,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { buildAgenda, type AlertKind } from "@/lib/alerts";
import { useStore } from "@/lib/store";
import { ars, fmtDateLong, todayISO } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Agenda · Corralón" },
      { name: "description", content: "Entregas, cheques, cuotas y débitos de los próximos días." },
    ],
  }),
  component: Calendario,
});

const icons: Partial<Record<AlertKind, LucideIcon>> = {
  entrega: Truck,
  cheque: CalendarClock,
  cuota: Wallet,
  presupuesto: FileText,
  liquidacion: CreditCard,
  debito: Receipt,
};
const labels: Partial<Record<AlertKind, string>> = {
  entrega: "Entrega",
  cheque: "Cheque",
  cuota: "Cuota",
  presupuesto: "Presupuesto",
  liquidacion: "Acredita",
  debito: "Débito",
};

function Calendario() {
  const { db } = useStore();
  const today = todayISO();
  const items = buildAgenda(db, 30);
  const groups = new Map<string, typeof items>();
  for (const i of items) groups.set(i.date, [...(groups.get(i.date) ?? []), i]);
  const entering = items
    .filter((i) => i.kind === "cheque" || i.kind === "cuota" || i.kind === "liquidacion")
    .reduce((a, i) => a + (i.amount ?? 0), 0);
  const leaving = items.filter((i) => i.kind === "debito").reduce((a, i) => a + (i.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Agenda · próximos 30 días"
        subtitle={`Entra ${ars(entering)} · sale ${ars(leaving)} en débitos fijos`}
      />
      {items.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No hay nada agendado. Acá aparecen solas las entregas, los cheques a cobrar, las cuotas
            de clientes, las acreditaciones de Payway y los débitos fijos.
          </p>
        </Card>
      )}
      <div className="flex flex-col gap-3">
        {[...groups.entries()].map(([date, list]) => (
          <Card key={date} className={date < today ? "ring-1 ring-danger-soft" : ""}>
            <p className="mb-2 text-xs font-semibold">
              {date === today ? "Hoy · " : date < today ? "Atrasado · " : ""}
              {fmtDateLong(date)}
            </p>
            <div className="flex flex-col gap-1.5">
              {list.map((i, k) => {
                const Icon = icons[i.kind] ?? CalendarClock;
                return (
                  <Link
                    key={k}
                    to={i.to}
                    className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm transition-colors hover:bg-surface"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1 truncate">{i.text}</span>
                    {i.amount !== undefined && (
                      <span className="tabular-nums font-semibold">{ars(i.amount)}</span>
                    )}
                    <Badge tone={i.kind === "debito" ? "danger" : "muted"}>{labels[i.kind]}</Badge>
                  </Link>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
