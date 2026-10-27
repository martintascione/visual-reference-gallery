import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Package, Search, ShoppingCart, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { ars, fmtDate } from "@/lib/format";

type Hit = {
  key: string;
  icon: typeof Search;
  title: string;
  sub: string;
  to: "/catalogo" | "/clientes" | "/ventas" | "/presupuestos";
};

export function GlobalSearch() {
  const { db } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const out: Hit[] = [];
    for (const p of db.products
      .filter((p) => p.active && p.name.toLowerCase().includes(t))
      .slice(0, 4))
      out.push({
        key: "p" + p.id,
        icon: Package,
        title: p.name,
        sub: `${p.bagPrice ? ars(p.bagPrice) + " el bolsón · " : ""}${ars(p.price)}/${p.unit === "m2" ? "m²" : p.unit} · stock ${Math.round(p.stock)}`,
        to: "/catalogo",
      });
    for (const c of db.clients
      .filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? "").includes(t))
      .slice(0, 4))
      out.push({
        key: "c" + c.id,
        icon: Users,
        title: c.name,
        sub: c.phone ?? "Cliente",
        to: "/clientes",
      });
    for (const s of db.sales
      .filter(
        (s) =>
          String(s.number).includes(t) ||
          s.clientName.toLowerCase().includes(t) ||
          s.items.some((i) => i.name.toLowerCase().includes(t)),
      )
      .slice(0, 4))
      out.push({
        key: "s" + s.id,
        icon: ShoppingCart,
        title: `Venta #${s.number} · ${s.clientName}`,
        sub: `${fmtDate(s.date)} · ${ars(s.total)}`,
        to: "/ventas",
      });
    return out;
  }, [q, db]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    nav({ to: h.to });
  };

  return (
    <div ref={box} className="relative w-full max-w-sm">
      <label className="flex h-11 w-full items-center gap-2 rounded-full bg-card px-4 shadow-soft">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) go(hits[0]);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Buscar producto, cliente o venta"
          className="min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
      </label>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-3xl bg-card p-2 shadow-soft">
          {hits.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
          )}
          {hits.map((h) => (
            <button
              key={h.key}
              onClick={() => go(h)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface">
                <h.icon className="h-3.5 w-3.5" strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{h.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{h.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
