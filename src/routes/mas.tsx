import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChartColumn,
  ChevronRight,
  FileText,
  Landmark,
  Lock,
  Receipt,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/mas")({
  head: () => ({ meta: [{ title: "Más · Corralón" }] }),
  component: Mas,
});

const items = [
  {
    to: "/presupuestos",
    label: "Presupuestos",
    d: "Seguimiento y conversión a venta",
    icon: FileText,
  },
  { to: "/catalogo", label: "Catálogo y precios", d: "Calculadora de costos", icon: Tags },
  {
    to: "/clientes",
    label: "Clientes y cuentas corrientes",
    d: "Cuotas, cobros y deudores",
    icon: Users,
  },
  { to: "/caja", label: "Caja y bancos", d: "Saldos, cheques y liquidaciones", icon: Landmark },
  {
    to: "/gastos",
    label: "Gastos y débitos",
    d: "Fijos, imprevistos y débitos bancarios",
    icon: Receipt,
  },
  { to: "/cierre", label: "Cierre del día", d: "Cierre de lote y ganancia", icon: Lock },
  { to: "/reportes", label: "Reportes", d: "Ganancia por día, semana y mes", icon: ChartColumn },
  {
    to: "/configuracion",
    label: "Configuración",
    d: "Bancos, pasarelas, fletes, gastos fijos",
    icon: Settings,
  },
] as const;

function Mas() {
  return (
    <>
      <PageHeader title="Más secciones" />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="card-soft flex items-center gap-4 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface">
              <i.icon className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{i.label}</span>
              <span className="block text-xs text-muted-foreground">{i.d}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </>
  );
}
