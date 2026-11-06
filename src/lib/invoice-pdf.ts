// PDF de factura electrónica (A/B/C) con CAE y QR de ARCA, con el diseño de la marca.
import QRCode from "qrcode";
import type { Issuer, Settings } from "./types";
import type { Invoice } from "./arca";
import { cbteLetter, invoiceQrUrl } from "./arca";
import { ars2 } from "./format";
import logo from "@/assets/aridos-petreos-logo.png";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtFull = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtYmd = (s: string) =>
  s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s;
const fmtCuit = (c: string) =>
  c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c;

export async function openInvoicePdf(
  settings: Settings,
  issuer: Issuer | undefined,
  inv: Invoice,
  copy: "ORIGINAL" | "DUPLICADO" = "ORIGINAL",
) {
  const letter = cbteLetter(inv.cbteTipo);
  const code = inv.cbteTipo === 1 ? "001" : inv.cbteTipo === 6 ? "006" : "011";
  const number = `${String(inv.ptoVta).padStart(5, "0")}-${String(inv.cbteNro).padStart(8, "0")}`;
  const logoUrl = new URL(logo, window.location.origin).href;
  const qr = await QRCode.toDataURL(invoiceQrUrl(inv), {
    margin: 0,
    width: 240,
    errorCorrectionLevel: "M",
  });
  const discriminated = inv.cbteTipo === 1;
  const issuerName = issuer?.name ?? settings.businessName;
  const condEmisor =
    issuer?.kind === "monotributo" ? "Responsable Monotributo" : "IVA Responsable Inscripto";
  const docLabel = inv.docTipo === 80 ? "CUIT" : inv.docTipo === 96 ? "DNI" : "";
  const rows = inv.items
    .map((i) => {
      const unit = discriminated ? i.price / (1 + settings.ivaPct / 100) : i.price;
      const sub = unit * i.qty;
      return `<tr><td class="c">${i.qty.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${esc(i.unit)}</td><td><span class="name">${esc(i.desc)}</span></td><td class="r">${ars2(unit)}</td>${discriminated ? `<td class="r">${settings.ivaPct}%</td>` : ""}<td class="r">${ars2(sub)}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${letter} ${number} · ${esc(issuerName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
  @page { size: A4; margin: 10mm 12mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; font-size: 11.5px; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 16px 10px 10px; }
  .copy { text-align: center; font-size: 10px; letter-spacing: .18em; color: #888; margin-bottom: 8px; }
  .head { display: grid; grid-template-columns: 1fr 86px 1fr; gap: 12px; align-items: stretch; margin-bottom: 12px; }
  .box { background: #f4f6f8; border-radius: 18px; padding: 12px 14px; }
  .box img { height: 50px; width: auto; display: block; margin-bottom: 8px; }
  .box .big { font-size: 14px; font-weight: 800; }
  .box .l { color: #444; margin-top: 2px; font-size: 10.5px; }
  .letter { background: #111; color: #fff; border-radius: 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
  .letter .L { font-size: 40px; font-weight: 800; line-height: 1; }
  .letter .cod { font-size: 9px; opacity: .65; letter-spacing: .08em; }
  .numbox { background: #111; color: #fff; border-radius: 18px; padding: 12px 14px; }
  .numbox .k { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; opacity: .65; }
  .numbox .n { font-size: 20px; font-weight: 800; letter-spacing: -.01em; margin-top: 2px; }
  .numbox .row { display: flex; justify-content: space-between; gap: 12px; margin-top: 5px; font-size: 10.5px; }
  .numbox .row span:first-child { opacity: .65; }
  .cards { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 12px; }
  .card { background: #f4f6f8; border-radius: 18px; padding: 12px 14px; }
  .card .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #777; margin-bottom: 5px; }
  .card .big { font-size: 14px; font-weight: 700; }
  .card .l { color: #444; margin-top: 2px; }
  .card .kv { display: flex; justify-content: space-between; gap: 10px; margin-top: 3px; }
  .card .kv span:first-child { color: #777; }
  .tbl { border-radius: 18px; overflow: hidden; border: 1px solid #ececef; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #777; font-weight: 600; padding: 9px 12px; background: #f4f6f8; }
  td { padding: 9px 12px; border-top: 1px solid #ececef; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; white-space: nowrap; width: 110px; }
  .name { font-weight: 600; }
  .bottom { display: grid; grid-template-columns: 1fr 290px; gap: 12px; margin-top: 12px; align-items: start; }
  .notes { background: #f4f6f8; border-radius: 18px; padding: 12px 14px; color: #333; line-height: 1.5; min-height: 40px; }
  .notes .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #777; margin-bottom: 5px; }
  .totals { background: #111; color: #fff; border-radius: 18px; padding: 12px 14px; }
  .totals .kv { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 11px; }
  .totals .kv span:first-child { opacity: .65; }
  .totals .total { border-top: 1px solid rgba(255,255,255,.2); margin-top: 6px; padding-top: 9px; }
  .totals .total span:first-child { opacity: 1; font-weight: 600; }
  .totals .total span:last-child { font-size: 20px; font-weight: 800; }
  .cae { display: grid; grid-template-columns: 96px 1fr; gap: 14px; align-items: center; margin-top: 14px; background: #f4f6f8; border-radius: 18px; padding: 12px 14px; }
  .cae img { width: 96px; height: 96px; display: block; }
  .cae .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #777; }
  .cae .v { font-size: 15px; font-weight: 800; letter-spacing: .02em; }
  .cae .l { color: #555; font-size: 10.5px; margin-top: 2px; }
  .tiny { text-align: center; color: #999; font-size: 9px; margin-top: 10px; }
  @media print { .page { padding: 0; } }
</style></head><body><div class="page">
  <div class="copy">${copy}</div>
  <div class="head">
    <div class="box">
      <img src="${logoUrl}" alt="${esc(issuerName)}">
      <div class="big">${esc(issuerName)}</div>
      ${issuer?.address ? `<div class="l">${esc(issuer.address)}</div>` : settings.address ? `<div class="l">${esc(settings.address)}${settings.city ? ", " + esc(settings.city) : ""}</div>` : ""}
      <div class="l">${condEmisor}</div>
    </div>
    <div class="letter"><div class="L">${letter}</div><div class="cod">COD. ${code}</div></div>
    <div class="numbox">
      <div class="k">Factura</div>
      <div class="n">${number}</div>
      <div class="row"><span>Fecha de emisión</span><span>${fmtFull(inv.fecha)}</span></div>
      <div class="row"><span>CUIT</span><span>${fmtCuit(inv.cuitEmisor)}</span></div>
      ${issuer?.iibb ? `<div class="row"><span>Ingresos Brutos</span><span>${esc(issuer.iibb)}</span></div>` : ""}
      ${issuer?.activityStart ? `<div class="row"><span>Inicio de actividades</span><span>${fmtFull(issuer.activityStart)}</span></div>` : ""}
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="k">Cliente</div>
      <div class="big">${esc(inv.clientName)}</div>
      ${docLabel ? `<div class="l">${docLabel} ${esc(inv.docTipo === 80 ? fmtCuit(inv.docNro) : inv.docNro)}</div>` : ""}
      ${inv.clientAddress ? `<div class="l">${esc(inv.clientAddress)}</div>` : ""}
      <div class="l">${esc(inv.clientIva ?? "Consumidor final")}</div>
    </div>
    <div class="card">
      <div class="k">Condiciones</div>
      <div class="kv"><span>Condición de venta</span><span>Contado</span></div>
      <div class="kv"><span>Moneda</span><span>Pesos argentinos</span></div>
      <div class="kv"><span>Concepto</span><span>${inv.concepto === 2 ? "Servicios" : inv.concepto === 3 ? "Productos y servicios" : "Productos"}</span></div>
    </div>
  </div>

  <div class="tbl"><table>
    <thead><tr><th class="c">Cantidad</th><th>Producto / Servicio</th><th class="r">${discriminated ? "P. unit. neto" : "P. unitario"}</th>${discriminated ? `<th class="r">IVA</th>` : ""}<th class="r">Subtotal</th></tr></thead>
    <tbody>${rows || `<tr><td class="c">1</td><td><span class="name">Venta</span></td><td class="r">${ars2(discriminated ? inv.neto : inv.total)}</td>${discriminated ? `<td class="r">${settings.ivaPct}%</td>` : ""}<td class="r">${ars2(discriminated ? inv.neto : inv.total)}</td></tr>`}</tbody>
  </table></div>

  <div class="bottom">
    <div class="notes">
      ${inv.note ? `<div class="k">Observaciones</div><div>${esc(inv.note)}</div>` : `<div>Gracias por su compra.</div>`}
    </div>
    <div class="totals">
      ${discriminated ? `<div class="kv"><span>Neto gravado</span><span>${ars2(inv.neto)}</span></div><div class="kv"><span>IVA ${settings.ivaPct}%</span><span>${ars2(inv.iva)}</span></div>` : `<div class="kv"><span>Subtotal</span><span>${ars2(inv.total)}</span></div>`}
      <div class="kv total"><span>Total</span><span>${ars2(inv.total)}</span></div>
    </div>
  </div>

  <div class="cae">
    <img src="${qr}" alt="QR ARCA">
    <div>
      <div class="k">CAE</div>
      <div class="v">${esc(inv.cae)}</div>
      <div class="l">Vencimiento del CAE: ${fmtYmd(inv.caeVto)}</div>
      <div class="l">Comprobante autorizado por ARCA · verificable con el código QR</div>
    </div>
  </div>
  <div class="tiny">${esc(issuerName)} · Factura ${letter} ${number}</div>
</div>
<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 500); });</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
