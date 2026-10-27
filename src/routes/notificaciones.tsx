import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  CreditCard,
  FileText,
  Package,
  Receipt,
  Truck,
  Wallet,
} from "lucide-react";
import { buildAlerts, type AlertKind } from "@/lib/alerts";
import { useStore } from "@/lib/store";
import { Badge, Card, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/notificaciones")({
  head: () => ({
    meta: [
      { title: "Avisos · Corralón" },
      { name: "description", content: "Todo lo que requiere atención hoy." },
    ],
  }),
  component: Notificaciones,
});

const icons: Record<AlertKind, typeof Bell> = {
  stock: Package,
  cuota: Wallet,
  cheque: CalendarClock,
  presupuesto: FileText,
  liquidacion: CreditCard,
  debito: Receipt,
  entrega: Truck,
};

function Notificaciones() {
  const { db } = useStore();
  const alerts = buildAlerts(db);
  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle={
          alerts.length
            ? `${alerts.filter((a) => a.urgent).length} urgentes · ${alerts.length} en total`
            : "Todo en orden"
        }
      />
      <Card>
        {alerts.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay nada pendiente. Los avisos aparecen solos: stock bajo, cuotas vencidas, cheques
            por cobrar, presupuestos para llamar, liquidaciones atrasadas y débitos fijos.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {alerts.map((a) => {
            const Icon = icons[a.kind];
            return (
              <Link
                key={a.id}
                to={a.to}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-accent"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card">
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.text}</span>
                  {a.detail && (
                    <span className="block text-[11px] text-muted-foreground">{a.detail}</span>
                  )}
                </span>
                <Badge tone={a.urgent ? "danger" : "dark"}>
                  {a.urgent ? "Urgente" : "Pendiente"}
                </Badge>
              </Link>
            );
          })}
        </div>
      </Card>
    </>
  );
}
