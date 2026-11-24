import { useMemo, useState } from "react";
import { Copy, Printer } from "lucide-react";
import type { Product } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, todayISO } from "@/lib/format";
import { productPrices, stoneGroup } from "@/lib/pricing";
import logo from "@/assets/aridos-petreos-logo.png";
import { Modal, Segmented, btn } from "./ui-bits";

type Section = { title: string; items: Product[] };

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Lista de precios con la estética de la marca: para capturar, imprimir, guardar en PDF o mandar por WhatsApp. */
export function PriceList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useStore();
  const s = db.settings;
  const [iva, setIva] = useState<"sin" | "con">("sin");
  const [copied, setCopied] = useState(false);
  const f = iva === "con" ? 1 + s.ivaPct / 100 : 1;
  const money = (n: number) => ars(Math.round(n * f));
  const nota = iva === "con" ? `Precios con IVA ${s.ivaPct} % incluido` : "Precios sin IVA";
  const contacto = [
    s.phone ? `WhatsApp ${s.phone}` : "",
    s.instagram ? `@${s.instagram.replace(/^@/, "")}` : "",
    s.address ? `${s.address}${s.city ? ", " + s.city : ""}` : "",
  ].filter(Boolean);

  const sections = useMemo<Section[]>(() => {
    const act = db.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
    const st = (g: string) => act.filter((p) => p.category === "piedra" && stoneGroup(p) === g);
    return [
      { title: "Piedras decorativas", items: st("decorativa") },
      { title: "Gravas", items: st("grava") },
      { title: "Construcción", items: st("construccion") },
      {
        title: "Revestimientos",
        items: act.filter((p) => p.category === "laja" || st("revestimiento").includes(p)),
      },
      { title: "Líquidos", items: act.filter((p) => p.category === "liquido") },
      { title: "Otros", items: act.filter((p) => p.category === "unitario") },
    ].filter((x) => x.items.length > 0);
  }, [db.products]);
  const total = sections.reduce((a, x) => a + x.items.length, 0);

  const text = () =>
    [
      `*Lista de precios · ${s.businessName}*`,
      `${fecha(todayISO())} · ${nota}`,
      ...sections.flatMap((sec) => [
        "",
        `*${sec.title.toUpperCase()}*`,
        ...sec.items.map(
          (p) =>
            `• ${p.name}: ${productPrices(p)
              .map((x) => `${x.label} ${money(x.value)}`)
              .join(" · ")}`,
        ),
      ]),
    ].join("\n");

  const print = () => {
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const logoUrl = new URL(logo, window.location.origin).href;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document
      .write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de precios · ${esc(s.businessName)}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#1d1d1f;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:2px solid #C121C4}
.head img{height:46px}
.head .t{text-align:right}
.k{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#86868b}
h1{font-size:24px;letter-spacing:-.02em;margin:2px 0 0}
.sub{font-size:11px;color:#86868b;margin-top:3px}
h2{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#C121C4;margin:20px 0 6px}
.row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid #ececef;break-inside:avoid}
.name{font-size:13px;font-weight:600}
.prices{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.p{background:#f5f5f7;border-radius:12px;padding:5px 10px;min-width:92px;text-align:right}
.p span{display:block;font-size:8.5px;color:#86868b;letter-spacing:.04em}
.p b{font-size:13px;font-variant-numeric:tabular-nums}
.foot{margin-top:22px;padding-top:12px;border-top:1px solid #ececef;font-size:10.5px;color:#86868b;text-align:center;line-height:1.6}
.foot b{color:#C121C4}
</style></head><body>
<div class="head"><img src="${logoUrl}" alt=""><div class="t"><div class="k">Lista de precios</div><h1>${fecha(todayISO())}</h1><div class="sub">${nota}</div></div></div>
${sections
  .map(
    (sec) =>
      `<h2>${esc(sec.title)}</h2>${sec.items
        .map(
          (p) =>
            `<div class="row"><div class="name">${esc(p.name)}</div><div class="prices">${productPrices(
              p,
            )
              .map(
                (x) => `<div class="p"><span>${esc(x.label)}</span><b>${money(x.value)}</b></div>`,
              )
              .join("")}</div></div>`,
        )
        .join("")}`,
  )
  .join("")}
<div class="foot"><b>${esc(s.businessName)}</b>${contacto.length ? "<br>" + esc(contacto.join(" · ")) : ""}<br>Precios sujetos a modificación sin previo aviso.</div>
<script>window.onload=()=>setTimeout(()=>window.print(),350)</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lista de precios"
      subtitle={`${total} productos · lista para capturar, imprimir o mandar`}
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
        {/* Hoja: es lo que se captura para mandarle al cliente */}
        <div className="rounded-3xl bg-white p-5 text-[#1d1d1f] shadow-soft sm:p-7">
          <div className="flex items-end justify-between gap-4 border-b-2 border-[#C121C4] pb-4">
            <img src={logo} alt={s.businessName} className="h-10 w-auto sm:h-12" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#86868b]">
                Lista de precios
              </p>
              <p className="text-xl font-bold tracking-tight sm:text-2xl">{fecha(todayISO())}</p>
              <p className="text-[11px] text-[#86868b]">{nota}</p>
            </div>
          </div>
          {sections.map((sec) => (
            <div key={sec.title}>
              <p className="mb-1 mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C121C4]">
                {sec.title}
              </p>
              {sec.items.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 border-b border-[#ececef] py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <p className="text-sm font-semibold">{p.name}</p>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {productPrices(p).map((x) => (
                      <span
                        key={x.label}
                        className="min-w-[96px] rounded-xl bg-[#f5f5f7] px-2.5 py-1.5 sm:text-right"
                      >
                        <span className="block text-[9px] leading-tight text-[#86868b]">
                          {x.label}
                        </span>
                        <span className="block text-sm font-bold tabular-nums">
                          {money(x.value)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-[#86868b]">
            <span className="font-semibold text-[#C121C4]">{s.businessName}</span>
            {contacto.length > 0 && (
              <>
                <br />
                {contacto.join(" · ")}
              </>
            )}
            <br />
            Precios sujetos a modificación sin previo aviso.
          </p>
        </div>
      </div>
    </Modal>
  );
}
