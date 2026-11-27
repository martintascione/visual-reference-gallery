// Papel de trabajo interno de un presupuesto o venta: costos y ganancia por producto.
// Es solo para el corralón: no se manda al cliente.
import type { DB, Quote, Sale } from "@/lib/types";
import { ars, num } from "@/lib/format";
import { listPrice, qtyUnit, stoneCalc, unitLabelFor } from "@/lib/pricing";

export function workSheetHtml(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta") {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const k = 1 - (doc.discountPct ?? 0) / 100;
  const rows = doc.items.map((i) => {
    const venta = Math.round(i.subtotal * k);
    const gan = venta - i.cost;
    return { name: i.name, qty: qtyUnit(i.qty, i.unit), venta, cost: i.cost, gan };
  });
  const extras: { name: string; venta: number; cost: number }[] = [];
  if (doc.delivery) {
    extras.push({
      name: `Flete · ${doc.delivery.zone}`,
      venta: doc.delivery.price,
      cost: doc.delivery.cost,
    });
    if (doc.delivery.unloadPrice)
      extras.push({ name: "Descarga", venta: doc.delivery.unloadPrice, cost: 0 });
  } else if (doc.pickupFee)
    extras.push({ name: "Servicio de embolsado", venta: doc.pickupFee, cost: 0 });
  if (doc.install?.amount) {
    const fee = Math.round((doc.install.amount * doc.install.feePct) / 100);
    extras.push({
      name: `Colocación (${doc.install.feePct} % empresa)`,
      venta: doc.install.amount,
      cost: doc.install.amount - fee,
    });
  }
  const all = [
    ...rows.map((r) => ({ ...r })),
    ...extras.map((e) => ({ ...e, qty: "1", gan: e.venta - e.cost })),
  ];
  const venta = all.reduce((a, r) => a + r.venta, 0);
  const costo = all.reduce((a, r) => a + r.cost, 0);
  const gan = venta - costo;
  const pct = (g: number, v: number) => (v > 0 ? `${num((g / v) * 100, 1)} %` : "—");
  // Cómo se arma el precio de lista de cada producto (con los costos cargados hoy en el catálogo).
  const comp = doc.items
    .map((i) => {
      const p = db.products.find((x) => x.id === i.productId);
      if (!p) return "";
      const lines: [string, string][] = [];
      if (p.category === "piedra" && p.stoneCost) {
        const c = p.stoneCost;
        const calc = stoneCalc(c, p.bagKg ?? db.settings.bagKg);
        lines.push(["Costo del proveedor", `${ars(c.purchasePerTon)} por t`]);
        if (c.freightPerTon) lines.push(["+ Flete", `${ars(c.freightPerTon)} por t`]);
        if (c.unloadPerTon) lines.push(["+ Descarga", `${ars(c.unloadPerTon)} por t`]);
        if (c.laborPerTon) lines.push(["+ Mano de obra", `${ars(c.laborPerTon)} por t`]);
        if (c.extrasPerTon) lines.push(["+ Extras", `${ars(c.extrasPerTon)} por t`]);
        lines.push(["= Costo por tonelada", ars(calc.costTon)]);
        lines.push([`+ Margen ${num(c.marginPct, 1)} % sobre el costo`, ars(calc.priceTon - calc.costTon)]);
        lines.push(["= Precio de lista por tonelada", ars(calc.priceTon)]);
        if (c.packagingPerBag) lines.push(["Embalaje por bolsa", ars(c.packagingPerBag)]);
      } else {
        const fr = p.freight ?? 0;
        const u = p.unit === "m2" ? "m²" : p.unit === "kg" ? "kg" : "u";
        lines.push(["Costo del proveedor", `${ars(p.cost - fr)} por ${u}`]);
        if (fr) lines.push(["+ Flete y descarga", `${ars(fr)} por ${u}`]);
        lines.push(["= Costo", `${ars(p.cost)} por ${u}`]);
        const m = p.cost > 0 ? (p.price / p.cost - 1) * 100 : 0;
        lines.push([`+ Margen ${num(m, 1)} % sobre el costo`, ars(p.price - p.cost)]);
        lines.push(["= Precio de lista", `${ars(p.price)} por ${u}`]);
      }
      const lp = Math.round(listPrice(p, i.unit));
      lines.push([`Precio de lista por ${unitLabelFor(p, i.unit)}`, ars(lp)]);
      lines.push([`Precio cobrado por ${unitLabelFor(p, i.unit)}`, ars(Math.round(i.unitPrice))]);
      if (i.discountPct) lines.push(["Bonificación del ítem", `${num(i.discountPct, 1)} %`]);
      const costU = i.qty ? i.cost / i.qty : 0;
      lines.push([`Costo por ${unitLabelFor(p, i.unit)}`, ars(Math.round(costU))]);
      const ganU = (i.qty ? (i.subtotal * k) / i.qty : 0) - costU;
      lines.push([`Ganancia por ${unitLabelFor(p, i.unit)}`, ars(Math.round(ganU))]);
      return `<div class="comp"><div class="ct">${esc(i.name)} · ${esc(qtyUnit(i.qty, i.unit))}</div>${lines
        .map(
          ([a, b]) =>
            `<div class="cl${a.startsWith("=") ? " eq" : ""}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`,
        )
        .join("")}</div>`;
    })
    .join("");
  const number = String(doc.number).padStart(4, "0");
  const title = `Papel de trabajo · ${kind === "presupuesto" ? "Presupuesto" : "Venta"} ${number}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(doc.clientName || "")}</title>
<style>
@page { size: A4; margin: 12mm; }
body { font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
.page { max-width: 780px; margin: 0 auto; padding: 16px 8px; }
h1 { font-size: 18px; margin: 0 0 2px; }
.muted { color: #777; }
.warn { background: #fff4e5; color: #8a4b00; border-radius: 10px; padding: 8px 12px; margin: 10px 0 14px; font-size: 11px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #777; padding: 8px; background: #f4f6f8; }
td { padding: 8px; border-top: 1px solid #ececef; }
.r { text-align: right; white-space: nowrap; }
.neg { color: #b42318; }
tfoot td { font-weight: 700; border-top: 2px solid #111; }
h2 { font-size: 14px; margin: 22px 0 8px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.comp { background: #f4f6f8; border-radius: 12px; padding: 10px 12px; break-inside: avoid; }
.ct { font-weight: 700; margin-bottom: 6px; }
.cl { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
.cl span:first-child { color: #555; }
.eq { font-weight: 700; border-top: 1px solid #ddd; margin-top: 2px; padding-top: 4px; }
.eq span:first-child { color: #111; }
@media print { .noprint { display: none; } }
</style></head><body><div class="page">
<h1>${esc(title)}</h1>
<div class="muted">${esc(doc.clientName || "Sin cliente")} · ${doc.date.slice(0, 10).split("-").reverse().join("/")} · ${esc(db.settings.businessName)}</div>
<div class="warn">Documento interno: costos y ganancia. No se le envía al cliente.</div>
<table>
<thead><tr><th>Producto / servicio</th><th>Cantidad</th><th class="r">Venta sin IVA</th><th class="r">Costo</th><th class="r">Ganancia</th><th class="r">Margen s/ venta</th></tr></thead>
<tbody>${all
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.qty)}</td><td class="r">${ars(r.venta)}</td><td class="r">${ars(r.cost)}</td><td class="r ${r.gan < 0 ? "neg" : ""}">${ars(r.gan)}</td><td class="r">${pct(r.gan, r.venta)}</td></tr>`,
    )
    .join("")}</tbody>
<tfoot><tr><td colspan="2">Total</td><td class="r">${ars(venta)}</td><td class="r">${ars(costo)}</td><td class="r ${gan < 0 ? "neg" : ""}">${ars(gan)}</td><td class="r">${pct(gan, venta)}</td></tr></tfoot>
</table>
${doc.discountPct ? `<p class="muted">Incluye la bonificación del ${doc.discountPct} % sobre los productos.</p>` : ""}
<h2>Cómo se arma el precio de cada producto</h2>
<p class="muted">Con los costos que tiene hoy cada producto en el catálogo. Todo sin IVA.</p>
<div class="grid">${comp}</div>
${doc.withIva ? `<p class="muted">Al cliente se le cobra con IVA: total ${ars(doc.total)}. La ganancia se calcula sin IVA.</p>` : ""}
<p class="noprint" style="margin-top:18px"><button onclick="window.print()" style="font:inherit;padding:10px 18px;border-radius:999px;border:0;background:#111;color:#fff;cursor:pointer">Imprimir o guardar en PDF</button></p>
</div></body></html>`;
  return { html, title };
}

/** Abre el papel de trabajo en una pestaña nueva, listo para imprimir o guardar en PDF. */
export function openWorkSheet(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta") {
  const { html } = workSheetHtml(db, doc, kind);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
