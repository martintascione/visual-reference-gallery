// PDF de factura electrónica (A/B/C) con CAE y QR de ARCA.
// Diseño minimalista: blanco, tipografía Inter, líneas finas y un solo acento (el magenta del logo).
import QRCode from "qrcode";
import type { Issuer, Settings } from "./types";
import type { Invoice } from "./arca";
import { cbteLetter, invoiceQrUrl } from "./arca";
import { ars2 } from "./format";
import logo from "@/assets/aridos-petreos-logo.png";

const BRAND = "#C121C4";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtFull = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtYmd = (s: string) =>
  s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s;
const fmtCuit = (c: string) =>
  c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c;
const qty = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

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
    width: 260,
    errorCorrectionLevel: "M",
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  const discriminated = inv.cbteTipo === 1;
  const issuerName = issuer?.name ?? settings.businessName;
  const condEmisor =
    issuer?.kind === "monotributo" ? "Responsable Monotributo" : "IVA Responsable Inscripto";
  const docLabel = inv.docTipo === 80 ? "CUIT" : inv.docTipo === 96 ? "DNI" : "";
  const rows = inv.items.length
    ? inv.items
        .map((i) => {
          const unit = discriminated ? i.price / (1 + settings.ivaPct / 100) : i.price;
          return `<tr><td>${esc(i.desc)}</td><td class="r">${qty(i.qty)} ${esc(i.unit)}</td><td class="r">${ars2(unit)}</td>${discriminated ? `<td class="r">${settings.ivaPct}%</td>` : ""}<td class="r">${ars2(unit * i.qty)}</td></tr>`;
        })
        .join("")
    : `<tr><td>Venta</td><td class="r">1</td><td class="r">${ars2(discriminated ? inv.neto : inv.total)}</td>${discriminated ? `<td class="r">${settings.ivaPct}%</td>` : ""}<td class="r">${ars2(discriminated ? inv.neto : inv.total)}</td></tr>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${letter} ${number} · ${esc(issuerName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
  @page { size: A4; margin: 14mm 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1d1d1f; font-size: 11px; background: #fff; line-height: 1.45; -webkit-font-smoothing: antialiased; }
  .page { max-width: 760px; margin: 0 auto; padding: 24px 8px; }
  .muted { color: #86868b; }
  .k { font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #86868b; font-weight: 500; }
  .num { font-variant-numeric: tabular-nums; }

  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .top img { height: 54px; width: auto; display: block; }
  .top .copy { margin-top: 10px; font-size: 9.5px; letter-spacing: .18em; color: #86868b; }
  .title { text-align: right; }
  .title .t { font-size: 26px; font-weight: 300; letter-spacing: -.02em; line-height: 1; }
  .title .t b { font-weight: 600; }
  .title .n { margin-top: 6px; font-size: 13px; font-weight: 500; }
  .title .d { margin-top: 2px; color: #86868b; }

  .rule { height: 1px; background: #e5e5ea; margin: 22px 0; }
  .rule.brand { background: ${BRAND}; height: 1.5px; }

  .parties { display: grid; grid-template-columns: 1fr 1fr 96px; gap: 24px; align-items: start; }
  .party .k { margin-bottom: 6px; }
  .party .name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .party .l { color: #515154; }
  .letter { justify-self: end; width: 64px; height: 64px; border: 1.5px solid ${BRAND}; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: ${BRAND}; }
  .letter .L { font-size: 30px; font-weight: 600; line-height: 1; }
  .letter .cod { font-size: 8.5px; letter-spacing: .12em; margin-top: 3px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #86868b; font-weight: 500; padding: 0 0 10px; border-bottom: 1px solid #1d1d1f; }
  td { padding: 10px 0; border-bottom: 1px solid #ececef; vertical-align: top; }
  td:first-child { font-weight: 500; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.r { padding-left: 16px; }
  td.r { padding-left: 16px; color: #515154; }
  td.r:last-child { color: #1d1d1f; font-weight: 500; }

  .bottom { display: grid; grid-template-columns: 1fr 260px; gap: 32px; margin-top: 18px; align-items: start; }
  .notes { color: #515154; }
  .notes .k { margin-bottom: 6px; }
  .totals .kv { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; color: #515154; }
  .totals .kv span:last-child { color: #1d1d1f; font-variant-numeric: tabular-nums; }
  .totals .total { border-top: 1.5px solid ${BRAND}; margin-top: 8px; padding-top: 12px; align-items: baseline; }
  .totals .total span:first-child { font-size: 12px; font-weight: 600; color: #1d1d1f; }
  .totals .total span:last-child { font-size: 22px; font-weight: 600; letter-spacing: -.02em; }

  .cae { display: grid; grid-template-columns: 84px 1fr auto; gap: 18px; align-items: center; margin-top: 36px; padding-top: 18px; border-top: 1px solid #e5e5ea; }
  .cae img { width: 84px; height: 84px; display: block; }
  .cae .v { font-size: 15px; font-weight: 600; letter-spacing: .04em; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .cae .l { color: #86868b; font-size: 10px; margin-top: 2px; }
  .cae .right { text-align: right; color: #86868b; font-size: 10px; }
  .cae .right b { display: block; color: #1d1d1f; font-weight: 500; font-size: 11px; }
  .foot { margin-top: 28px; text-align: center; color: #86868b; font-size: 9.5px; }
  .foot span { color: ${BRAND}; }
  @media print { .page { padding: 0; } }
</style></head><body><div class="page">

  <div class="top">
    <div>
      <img src="${logoUrl}" alt="${esc(issuerName)}">
      <div class="copy">${copy}</div>
    </div>
    <div class="title">
      <div class="t">Factura <b>${letter}</b></div>
      <div class="n num">N° ${number}</div>
      <div class="d">Emitida el ${fmtFull(inv.fecha)}</div>
    </div>
  </div>

  <div class="rule"></div>

  <div class="parties">
    <div class="party">
      <div class="k">Emisor</div>
      <div class="name">${esc(issuerName)}</div>
      <div class="l num">CUIT ${fmtCuit(inv.cuitEmisor)}</div>
      ${issuer?.address ? `<div class="l">${esc(issuer.address)}</div>` : settings.address ? `<div class="l">${esc(settings.address)}${settings.city ? ", " + esc(settings.city) : ""}</div>` : ""}
      <div class="l">${condEmisor}</div>
      ${issuer?.iibb ? `<div class="l num">Ingresos Brutos ${esc(issuer.iibb)}</div>` : ""}
      ${issuer?.activityStart ? `<div class="l num">Inicio de actividades ${fmtFull(issuer.activityStart)}</div>` : ""}
    </div>
    <div class="party">
      <div class="k">Cliente</div>
      <div class="name">${esc(inv.clientName)}</div>
      ${docLabel ? `<div class="l num">${docLabel} ${esc(inv.docTipo === 80 ? fmtCuit(inv.docNro) : inv.docNro)}</div>` : ""}
      ${inv.clientAddress ? `<div class="l">${esc(inv.clientAddress)}</div>` : ""}
      <div class="l">${esc(inv.clientIva ?? "Consumidor final")}</div>
      <div class="l">Condición de venta: contado</div>
    </div>
    <div class="letter"><div class="L">${letter}</div><div class="cod">COD. ${code}</div></div>
  </div>

  <div class="rule"></div>

  <table>
    <thead><tr><th>Descripción</th><th class="r">Cantidad</th><th class="r">${discriminated ? "Precio neto" : "Precio"}</th>${discriminated ? `<th class="r">IVA</th>` : ""}<th class="r">Importe</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="bottom">
    <div class="notes">
      ${inv.note ? `<div class="k">Observaciones</div><div>${esc(inv.note)}</div>` : ""}
    </div>
    <div class="totals">
      ${discriminated ? `<div class="kv"><span>Neto gravado</span><span>${ars2(inv.neto)}</span></div><div class="kv"><span>IVA ${settings.ivaPct}%</span><span>${ars2(inv.iva)}</span></div>` : `<div class="kv"><span>Subtotal</span><span>${ars2(inv.total)}</span></div>`}
      <div class="kv total"><span>Total</span><span>${ars2(inv.total)}</span></div>
    </div>
  </div>

  <div class="cae">
    <img src="${qr}" alt="Código QR de ARCA">
    <div>
      <div class="k">CAE</div>
      <div class="v">${esc(inv.cae)}</div>
      <div class="l">Vencimiento ${fmtYmd(inv.caeVto)} · Comprobante autorizado por ARCA</div>
    </div>
    <div class="right"><b>${esc(issuerName)}</b>Factura ${letter} · ${number}</div>
  </div>

  <div class="foot"><span>Áridos Petreos</span> · Piedras naturales${settings.phone ? ` · ${esc(settings.phone)}` : ""}${settings.instagram ? ` · ${esc(settings.instagram)}` : ""}</div>
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
