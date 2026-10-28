import { Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  CircleHelp,
  FileCheck,
  FileText,
  Home,
  Landmark,
  Lock,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";
import logo from "@/assets/aridos-petreos-logo.png";
import { buildAlerts } from "@/lib/alerts";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { GlobalSearch } from "./global-search";
import { Assistant } from "./assistant";
import { Tour } from "./tour";

const nav = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText },
  { to: "/facturalo", label: "Facturalo Fácil", icon: FileCheck },
  { to: "/catalogo", label: "Catálogo y precios", icon: Tags },
  { to: "/stock", label: "Stock", icon: Package },
  { to: "/clientes", label: "Clientes y cuentas corrientes", icon: Users },
  { to: "/caja", label: "Caja y bancos", icon: Landmark },
  { to: "/gastos", label: "Gastos y débitos", icon: Receipt },
  { to: "/cierre", label: "Cierre del día", icon: Lock },
  { to: "/reportes", label: "Reportes", icon: ChartColumn },
] as const;

const circle =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-soft transition-colors hover:bg-accent";
const activeCircle = "!bg-primary !text-primary-foreground";

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-14 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { db } = useStore();
  const alertCount = useMemo(() => buildAlerts(db).filter((a) => a.urgent).length, [db]);

  return (
    <div className="min-h-screen w-full">
      {/* Cabecera fija: logo, buscador y accesos. Siempre visible, en todas las secciones. */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center gap-4 px-4 md:px-6">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Inicio">
            <img src={logo} alt="Áridos Petreos" className="h-9 w-auto md:h-10" />
          </Link>
          <div data-tour="buscador" className="hidden min-w-0 flex-1 justify-center md:flex">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              data-tour="asistente"
              onClick={() => window.dispatchEvent(new Event("abrir-asistente"))}
              className="group relative flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium shadow-soft transition-colors hover:bg-accent"
              aria-label="Asistente"
            >
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />
              <span className="hidden lg:inline">Asistente</span>
            </button>
            <Link
              to="/notificaciones"
              data-tour="avisos"
              className={`relative ${circle}`}
              aria-label="Avisos"
              activeProps={{ className: activeCircle }}
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} />
              {alertCount > 0 && (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
              )}
            </Link>
            <button
              onClick={() => window.dispatchEvent(new Event("abrir-tour"))}
              className={`hidden lg:grid ${circle}`}
              aria-label="Recorrido guiado"
              title="Recorrido guiado"
            >
              <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </button>
            <Link
              to="/calendario"
              className={`hidden sm:grid ${circle}`}
              aria-label="Agenda"
              activeProps={{ className: activeCircle }}
            >
              <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            <Link
              to="/configuracion"
              data-tour="configuracion"
              className={`hidden sm:grid ${circle}`}
              aria-label="Configuración"
              activeProps={{ className: activeCircle }}
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            <Link
              to="/nueva-venta"
              data-tour="nueva-venta"
              className="hidden h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 md:flex"
            >
              <Plus className="h-4 w-4" /> Nueva venta
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1480px] gap-5 px-4 pb-28 pt-5 md:px-6 md:pb-8">
        {/* Menú lateral */}
        <aside className="sticky top-[92px] hidden h-[calc(100vh-112px)] w-11 shrink-0 flex-col items-center md:flex">
          <nav className="flex flex-col gap-3">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`group relative ${circle}`}
                activeProps={{ className: activeCircle }}
                activeOptions={{ exact: to === "/" }}
                aria-label={label}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                <Tip label={label} />
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col items-center gap-3">
            <button
              onClick={() => supabase.auth.signOut()}
              className={`group relative ${circle}`}
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} />
              <Tip label="Cerrar sesión" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1" data-tour="page">
          <div className="mb-4 md:hidden">
            <GlobalSearch />
          </div>
          {children}
        </main>
      </div>

      <Assistant />
      <Tour />

      {/* Barra inferior en el celular */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full bg-card px-2 py-2 shadow-soft md:hidden">
        <MobileItem to="/" label="Inicio" icon={Home} exact />
        <MobileItem to="/ventas" label="Ventas" icon={ShoppingCart} />
        <Link
          to="/nueva-venta"
          aria-label="Nueva venta"
          className="grid h-14 w-14 -translate-y-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"
        >
          <Plus className="h-6 w-6" />
        </Link>
        <MobileItem to="/catalogo" label="Precios" icon={Tags} />
        <MobileItem to="/mas" label="Más" icon={Menu} />
      </nav>
    </div>
  );
}

function MobileItem({
  to,
  label,
  icon: Icon,
  exact,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: !!exact }}
      className="flex flex-col items-center gap-0.5 px-2 text-[10px] text-muted-foreground"
      activeProps={{ className: "!text-foreground font-semibold" }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.6} />
      {label}
    </Link>
  );
}
