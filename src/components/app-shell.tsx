import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  FileText,
  Home,
  Landmark,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Tags,
  SlidersHorizontal,
  Users,
  Mountain,
} from "lucide-react";

const nav = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText },
  { to: "/catalogo", label: "Catálogo y precios", icon: Tags },
  { to: "/stock", label: "Stock", icon: Package },
  { to: "/clientes", label: "Clientes y cuentas corrientes", icon: Users },
  { to: "/caja", label: "Caja y bancos", icon: Landmark },
  { to: "/gastos", label: "Gastos", icon: Receipt },
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
  return (
    <div className="flex min-h-screen w-full gap-4 p-3 pb-24 md:p-5 md:pb-5">
      {/* Sidebar */}
      <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-11 shrink-0 flex-col items-center md:flex">
        <div className={circle}>
          <Mountain className="h-5 w-5" strokeWidth={1.6} />
        </div>
        <nav className="my-auto flex flex-col gap-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`group relative ${circle}`}
              activeProps={{ className: activeCircle }}
              activeOptions={{ exact: true }}
              aria-label={label}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
              <Tip label={label} />
            </Link>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/configuracion"
            className={`group relative ${circle}`}
            activeProps={{ className: activeCircle }}
            aria-label="Configuración"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
            <Tip label="Configuración" />
          </Link>
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

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Top bar */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <label className="flex h-11 w-full max-w-sm items-center gap-2 rounded-full bg-card px-4 shadow-soft">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
            <input
              placeholder="Buscar producto, cliente o venta"
              className="min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
            />
            <SlidersHorizontal
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.6}
            />
          </label>
          <div className="flex items-center gap-2">
            <Link to="/notificaciones" className={`relative ${circle}`} aria-label="Notificaciones">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} />
              <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-destructive" />
            </Link>
            <Link to="/calendario" className={`hidden sm:grid ${circle}`} aria-label="Calendario">
              <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            <Link
              to="/configuracion"
              className={`hidden sm:grid ${circle}`}
              aria-label="Configuración"
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            <Link
              to="/nueva-venta"
              className="hidden h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground md:flex"
            >
              <Plus className="h-4 w-4" /> Nueva venta
            </Link>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full bg-card px-2 py-2 shadow-soft md:hidden">
        {[
          { to: "/", label: "Inicio", icon: Home },
          { to: "/ventas", label: "Ventas", icon: ShoppingCart },
        ].map(({ to, label, icon: Icon }) => (
          <MobileItem key={to} to={to} label={label} icon={Icon} />
        ))}
        <Link
          to="/nueva-venta"
          aria-label="Nueva venta"
          className="grid h-14 w-14 -translate-y-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"
        >
          <Plus className="h-6 w-6" />
        </Link>
        <MobileItem to="/stock" label="Stock" icon={Package} />
        <MobileItem to="/mas" label="Más" icon={Menu} />
      </nav>
    </div>
  );
}

function MobileItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex flex-col items-center gap-0.5 px-2 text-[10px] text-muted-foreground"
      activeProps={{ className: "!text-foreground font-semibold" }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.6} />
      {label}
    </Link>
  );
}
