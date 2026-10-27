import type { DB, Quote, Sale } from "./types";
import { ars2 } from "./format";

const fmtFull = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
import { qtyUnit } from "./pricing";
import logo from "@/assets/aridos-petreos-logo.png";

/**
 * Genera el presupuesto (o comprobante de venta) como PDF usando la impresión del navegador.
 * Se abre en una pestaña nueva con el diálogo de imprimir listo: "Guardar como PDF".
 * Replica el formato del Word que usa el corralón: cotización, fecha, válido hasta, datos del
 * cliente, tabla de ítems, bonificación, IVA, total y la franja de contacto.
 */
export function openDocumentPdf(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta") {
  const s = db.settings;
  const client = doc.clientId ? db.clients.find((c) => c.id === doc.clientId) : undefined;
  const number = String(doc.number).padStart(4, "0");
  const title = kind === "presupuesto" ? `COTIZACIÓN ${number}` : `COMPROBANTE DE VENTA ${number}`;
  const itemsTotal = doc.items.reduce((a, i) => a + i.subtotal, 0);
  const discountPct = doc.discountPct ?? 0;
  const discount = Math.round((itemsTotal * discountPct) / 100);
  const flete = doc.delivery?.price ?? 0;
  const base = itemsTotal - discount + flete;
  const iva = doc.withIva ? Math.round(base * (s.ivaPct / 100)) : 0;
  const total = base + iva;
  const validUntil = "validUntil" in doc ? doc.validUntil : undefined;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const logoUrl = new URL(logo, window.location.origin).href;

  const rows = doc.items
    .map(
      (i) => `<tr>
        <td class="c">${esc(qtyUnit(i.qty, i.unit))}</td>
        <td><span class="name">${esc(i.name)}</span>${i.discountPct ? ` <span class="muted">(−${i.discountPct}% por cantidad)</span>` : ""}</td>
        <td class="r">${ars2(i.unitPrice)}</td>
        <td class="r">${ars2(i.subtotal)}</td>
      </tr>`,
    )
    .join("");
  const fleteRow = doc.delivery
    ? `<tr><td class="c">1</td><td><span class="name">Flete a domicilio</span> · ${esc(doc.delivery.zone)}${doc.delivery.address ? " · " + esc(doc.delivery.address) : ""}</td><td class="r">${ars2(flete)}</td><td class="r">${ars2(flete)}</td></tr>`
    : "";

  const ico = {
    wa: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L0 24l6.5-1.7a11.8 11.8 0 0 0 5.6 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.4zM12.1 21.7c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.9 1 1-3.8-.2-.4a9.8 9.8 0 1 1 8.5 4.8zm5.4-7.3c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z"/></svg>`,
    ig: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };
  const clientLines = [
    client?.address || client?.city
      ? esc([client?.address, client?.city].filter(Boolean).join(", "))
      : "",
    client?.cuit ? "CUIT " + esc(client.cuit) : client?.dni ? "DNI " + esc(client.dni) : "",
    client?.ivaCategory ? esc(client.ivaCategory) : "",
    client?.phone ? "Tel. " + esc(client.phone) : "",
  ].filter(Boolean);

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(s.businessName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  @page { size: A4; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; font-size: 12px; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 20px 10px 10px; }
  .brand { color: #7a1fa2; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 18px; }
  .head img { height: 58px; width: auto; }
  .numbox { background: #111; color: #fff; border-radius: 20px; padding: 14px 18px; min-width: 230px; }
  .numbox .k { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; opacity: .65; }
  .numbox .n { font-size: 22px; font-weight: 800; letter-spacing: -.01em; margin-top: 2px; }
  .numbox .row { display: flex; justify-content: space-between; gap: 14px; margin-top: 6px; font-size: 11px; }
  .numbox .row span:first-child { opacity: .65; }
  .cards { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { background: #f4f6f8; border-radius: 18px; padding: 14px 16px; }
  .card .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #777; margin-bottom: 6px; }
  .card .big { font-size: 15px; font-weight: 700; }
  .card .l { color: #444; margin-top: 2px; }
  .card .kv { display: flex; justify-content: space-between; gap: 10px; margin-top: 3px; }
  .card .kv span:first-child { color: #777; }
  .tbl { border-radius: 18px; overflow: hidden; border: 1px solid #ececef; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #777; font-weight: 600; padding: 10px 14px; background: #f4f6f8; }
  td { padding: 10px 14px; border-top: 1px solid #ececef; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; white-space: nowrap; width: 120px; }
  .name { font-weight: 600; }
  .muted { color: #888; font-size: 10.5px; font-weight: 400; }
  .bottom { display: grid; grid-template-columns: 1fr 300px; gap: 14px; margin-top: 14px; align-items: start; }
  .notes { background: #f4f6f8; border-radius: 18px; padding: 14px 16px; color: #333; line-height: 1.55; min-height: 40px; }
  .notes .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #777; margin-bottom: 6px; }
  .totals { background: #111; color: #fff; border-radius: 20px; padding: 14px 18px; }
  .totals .kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: 11.5px; }
  .totals .kv span:first-child { opacity: .65; }
  .totals .total { border-top: 1px solid rgba(255,255,255,.2); margin-top: 6px; padding-top: 10px; }
  .totals .total span:first-child { opacity: 1; font-weight: 600; }
  .totals .total span:last-child { font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
  .foot { margin-top: 22px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .foot span { display: inline-flex; align-items: center; gap: 6px; background: #f6effa; color: #7a1fa2; border-radius: 999px; padding: 7px 12px; font-weight: 600; font-size: 11.5px; white-space: nowrap; }
  .tiny { text-align: center; color: #999; font-size: 9.5px; margin-top: 10px; }
  @media print { .page { padding: 0; } }
</style></head><body><div class="page">
  <div class="head">
    <img src="${logoUrl}" alt="${esc(s.businessName)}">
    <div class="numbox">
      <div class="k">${kind === "presupuesto" ? "Cotización" : "Comprobante de venta"}</div>
      <div class="n">N° ${number}</div>
      <div class="row"><span>Fecha</span><span>${fmtFull(doc.date)}</span></div>
      ${validUntil ? `<div class="row"><span>Válido hasta</span><span>${fmtFull(validUntil)}</span></div>` : ""}
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="k">Señor/es</div>
      <div class="big">${esc(doc.clientName)}</div>
      ${clientLines.map((l) => `<div class="l">${l}</div>`).join("")}
    </div>
    <div class="card">
      <div class="k">Condiciones</div>
      <div class="kv"><span>Moneda</span><span>Pesos argentinos</span></div>
      <div class="kv"><span>IVA</span><span>${doc.withIva ? `${s.ivaPct}% discriminado` : "Precios finales"}</span></div>
      ${discountPct ? `<div class="kv"><span>Bonificación</span><span>${discountPct}%</span></div>` : ""}
      ${doc.delivery ? `<div class="kv"><span>Entrega</span><span>A domicilio</span></div>` : `<div class="kv"><span>Entrega</span><span>Retira en el local</span></div>`}
    </div>
  </div>

  <div class="tbl"><table>
    <thead><tr><th class="c">Cantidad</th><th>Producto / Servicio / Detalle</th><th class="r">P. unitario</th><th class="r">Subtotal</th></tr></thead>
    <tbody>${rows}${fleteRow}</tbody>
  </table></div>

  <div class="bottom">
    <div class="notes">
      ${doc.note ? `<div class="k">Observaciones</div><div>${esc(doc.note)}</div>` : ""}
      ${kind === "presupuesto" ? `<div style="margin-top:${doc.note ? "10px" : "0"}">${esc(s.quoteFooter ?? "Saludos cordiales, esperamos una pronta respuesta.")}</div>` : `<div>Gracias por su compra.</div>`}
    </div>
    <div class="totals">
      <div class="kv"><span>Subtotal</span><span>${ars2(itemsTotal + flete)}</span></div>
      ${discount ? `<div class="kv"><span>Bonificación ${discountPct}%</span><span>− ${ars2(discount)}</span></div>` : ""}
      ${doc.withIva ? `<div class="kv"><span>IVA ${s.ivaPct}%</span><span>${ars2(iva)}</span></div>` : ""}
      <div class="kv total"><span>Total</span><span>${ars2(total)}</span></div>
    </div>
  </div>

  <div class="foot">
    ${s.phone ? `<span>${ico.wa} ${esc(s.phone)}</span>` : ""}
    ${s.instagram ? `<span>${ico.ig} @${esc(s.instagram.replace(/^@/, ""))}</span>` : ""}
    ${s.address ? `<span>${ico.pin} ${esc(s.address)}${s.city ? " · " + esc(s.city) : ""}</span>` : ""}
  </div>
  <div class="tiny">${esc(s.businessName)} · ${kind === "presupuesto" ? "Presupuesto sin valor fiscal" : "Comprobante interno sin valor fiscal"}</div>
</div>
<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 400); });</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    console.warn("Ventana emergente bloqueada: permití pop-ups para generar el PDF.");
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
