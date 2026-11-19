import { useMemo, useState } from "react";
import { Copy, Printer } from "lucide-react";
import type { Product } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, fmtDate, todayISO } from "@/lib/format";
import { bigBagKg, listPrice } from "@/lib/pricing";
import { Modal, Segmented, btn } from "./ui-bits";

const kg = (n: number) => `${n.toLocaleString("es-AR")} kg`;

/** Lista de precios simple para consultar, imprimir o mandar por WhatsApp. */
export function PriceList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useStore();
  const s = db.settings;
  const [iva, setIva] = useState<"sin" | "con">("sin");
  const [copied, setCopied] = useState(false);
  const f = iva === "con" ? 1 + s.ivaPct / 100 : 1;
  const money = (n: number) => ars(Math.round(n * f));

  const { stones, others } = useMemo(() => {
    const act = db.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
    return {
      stones: act.filter((p) => p.category === "piedra"),
      others: act.filter((p) => p.category !== "piedra"),
    };
  }, [db.products]);
  const unitOf = (p: Product) =>
    p.category === "laja"
      ? "m²"
      : p.category === "liquido"
        ? `bidón ${p.liters ?? ""} L`
        : "unidad";
  const has2 = stones.some((p) => (p.stoneCost?.bigBag2Kg ?? 0) > 0);
  const bigs = (p: Product) =>
    `${money(listPrice(p, "bigbag"))}${(p.stoneCost?.bigBag2Kg ?? 0) > 0 ? ` · ${kg(p.stoneCost?.bigBag2Kg ?? 0)}: ${money(listPrice(p, "bigbag2"))}` : ""}`;
  const nota = iva === "con" ? `Precios con IVA ${s.ivaPct} % incluido` : "Precios sin IVA";

  const text = () =>
    [
      `*Lista de precios · ${s.businessName}*`,
      `${fmtDate(todayISO())} · ${nota}`,
      "",
      ...stones.map(
        (p) =>
          `*${p.name}*\nBolsa ${kg(p.bagKg ?? 25)}: ${money(listPrice(p, "bolson"))} · Bolsón ${kg(bigBagKg(p))}: ${bigs(p)} · Tonelada: ${money(listPrice(p, "t"))}`,
      ),
      others.length ? "" : null,
      ...others.map((p) => `*${p.name}*: ${money(p.price)} por ${unitOf(p)}`),
    ]
      .filter((l) => l !== null)
      .join("\n");

  const print = () => {
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document
      .write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de precios</title>
<style>body{font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1d1d1f;margin:32px}h1{font-size:22px;margin:0}p{color:#86868b;font-size:12px;margin:4px 0 18px}
table{width:100%;border-collapse:collapse;margin-bottom:22px}th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#86868b;font-weight:500;text-align:right;padding:6px 8px;border-bottom:1px solid #1d1d1f}
th:first-child,td:first-child{text-align:left}td{font-size:13px;padding:8px;border-bottom:1px solid #e5e5ea;text-align:right;white-space:nowrap}td:first-child{white-space:normal;font-weight:600}</style></head><body>
<h1>Lista de precios · ${esc(s.businessName)}</h1><p>${fmtDate(todayISO())} · ${nota}</p>
${stones.length ? `<table><thead><tr><th>Piedras y áridos</th><th>Bolsa</th><th>Bolsón</th><th>Tonelada</th></tr></thead><tbody>${stones.map((p) => `<tr><td>${esc(p.name)}</td><td>${money(listPrice(p, "bolson"))}</td><td>${bigs(p)}</td><td>${money(listPrice(p, "t"))}</td></tr>`).join("")}</tbody></table>` : ""}
${others.length ? `<table><thead><tr><th>Lajas, líquidos y otros</th><th>Precio</th></tr></thead><tbody>${others.map((p) => `<tr><td>${esc(p.name)}</td><td>${money(p.price)} / ${esc(unitOf(p))}</td></tr>`).join("")}</tbody></table>` : ""}
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lista de precios"
      subtitle={`${stones.length + others.length} productos · ${nota}`}
      wide
      footer={
        <>
          <button
            className={btn.soft}
            onClick={() => {
              void navigator.clipboard.writeText(text()).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            <Copy className="h-4 w-4" strokeWidth={1.6} />{" "}
            {copied ? "Copiada" : "Copiar para WhatsApp"}
          </button>
          <button className={btn.primary} onClick={print}>
            <Printer className="h-4 w-4" strokeWidth={1.6} /> Imprimir o PDF
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={iva}
          onChange={setIva}
          options={[
            { value: "sin", label: "Sin IVA" },
            { value: "con", label: `Con IVA ${s.ivaPct} %` },
          ]}
        />
        {stones.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-right text-[11px] text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Piedras y áridos</th>
                  <th className="pb-2 font-medium">Bolsa</th>
                  <th className="pb-2 font-medium">Bolsón{has2 ? " (y segundo)" : ""}</th>
                  <th className="pb-2 font-medium">Tonelada</th>
                </tr>
              </thead>
              <tbody>
                {stones.map((p) => (
                  <tr key={p.id} className="border-t border-border text-right tabular-nums">
                    <td className="py-2.5 text-left font-medium">{p.name}</td>
                    <td>{money(listPrice(p, "bolson"))}</td>
                    <td>{bigs(p)}</td>
                    <td className="font-semibold">{money(listPrice(p, "t"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {others.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-[11px] text-muted-foreground">
                <th className="pb-2 text-left font-medium">Lajas, líquidos y otros</th>
                <th className="pb-2 font-medium">Precio</th>
              </tr>
            </thead>
            <tbody>
              {others.map((p) => (
                <tr key={p.id} className="border-t border-border text-right tabular-nums">
                  <td className="py-2.5 text-left font-medium">{p.name}</td>
                  <td>
                    <b>{money(p.price)}</b>{" "}
                    <span className="text-xs text-muted-foreground">/ {unitOf(p)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
