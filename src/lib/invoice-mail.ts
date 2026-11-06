// Envío de la factura por mail al cliente: HTML con el diseño de la marca + PDF adjunto.
import type { Issuer, Settings } from "./types";
import type { Invoice } from "./arca";
import { cbteLetter } from "./arca";
import { ars2 } from "./format";
import { buildInvoicePdf } from "./invoice-pdf";
import { mailSend } from "./correo";
import logo from "@/assets/aridos-petreos-logo.png";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtFull = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function invoiceEmailHtml(
  settings: Settings,
  issuer: Issuer | undefined,
  inv: Invoice,
  number: string,
) {
  const letter = cbteLetter(inv.cbteTipo);
  const logoUrl = new URL(logo, window.location.origin).href;
  const name = issuer?.name ?? settings.businessName;
  const items = (
    inv.items.length ? inv.items : [{ desc: "Venta", qty: 1, unit: "", price: inv.total }]
  )
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #ececef;font-size:13px;color:#1d1d1f">${esc(i.desc || "Venta")}</td>
        <td style="padding:10px 0;border-bottom:1px solid #ececef;font-size:13px;color:#515154;text-align:right;white-space:nowrap">${i.qty.toLocaleString("es-AR", { maximumFractionDigits: 2 })}${i.unit ? " " + esc(i.unit) : ""}</td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid #ececef;font-size:13px;color:#1d1d1f;text-align:right;white-space:nowrap;font-weight:600">${ars2(i.price * i.qty)}</td>
      </tr>`,
    )
    .join("");
  const contact = [
    settings.phone,
    settings.instagram ? `@${settings.instagram.replace(/^@/, "")}` : "",
    settings.address ? `${settings.address}${settings.city ? ", " + settings.city : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Factura ${letter} ${number}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
  <tr><td style="padding:32px 32px 0;text-align:center">
    <img src="${logoUrl}" alt="${esc(name)}" height="44" style="height:44px;width:auto;display:inline-block">
  </td></tr>
  <tr><td style="padding:24px 32px 0;text-align:center">
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#86868b">Factura ${letter}</div>
    <div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin-top:6px">N° ${number}</div>
    <div style="font-size:13px;color:#86868b;margin-top:4px">Emitida el ${fmtFull(inv.fecha)}</div>
  </td></tr>
  <tr><td style="padding:24px 32px 0">
    <p style="margin:0;font-size:15px;line-height:1.6">Hola${inv.clientName && inv.clientName !== "Consumidor final" ? ` <strong>${esc(inv.clientName)}</strong>` : ""},</p>
    <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#515154">Te enviamos tu factura electrónica. El PDF con el código QR de ARCA va adjunto a este mensaje.</p>
  </td></tr>
  <tr><td style="padding:24px 32px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <th align="left" style="padding:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#86868b;font-weight:500;border-bottom:1px solid #1d1d1f">Detalle</th>
        <th align="right" style="padding:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#86868b;font-weight:500;border-bottom:1px solid #1d1d1f">Cantidad</th>
        <th align="right" style="padding:0 0 8px 16px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#86868b;font-weight:500;border-bottom:1px solid #1d1d1f">Importe</th>
      </tr>
      ${items}
    </table>
  </td></tr>
  <tr><td style="padding:16px 32px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${inv.cbteTipo === 1 ? `<tr><td style="padding:3px 0;font-size:13px;color:#515154">Neto gravado</td><td align="right" style="padding:3px 0;font-size:13px">${ars2(inv.neto)}</td></tr><tr><td style="padding:3px 0;font-size:13px;color:#515154">IVA ${settings.ivaPct}%</td><td align="right" style="padding:3px 0;font-size:13px">${ars2(inv.iva)}</td></tr>` : ""}
      <tr><td style="padding:12px 0 0;border-top:1.5px solid #C121C4;font-size:14px;font-weight:600">Total</td><td align="right" style="padding:12px 0 0;border-top:1.5px solid #C121C4;font-size:22px;font-weight:700;letter-spacing:-.02em">${ars2(inv.total)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 32px 0">
    <div style="background:#f5f5f7;border-radius:16px;padding:14px 16px;font-size:12px;color:#515154;line-height:1.6">
      <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#86868b">CAE</div>
      <div style="font-size:15px;font-weight:600;color:#1d1d1f;letter-spacing:.04em">${esc(inv.cae)}</div>
      Vencimiento ${inv.caeVto.length === 8 ? `${inv.caeVto.slice(6, 8)}/${inv.caeVto.slice(4, 6)}/${inv.caeVto.slice(0, 4)}` : esc(inv.caeVto)} · Comprobante autorizado por ARCA
    </div>
  </td></tr>
  <tr><td style="padding:28px 32px 32px;text-align:center;font-size:12px;color:#86868b;line-height:1.6">
    <span style="color:#C121C4;font-weight:600">${esc(name)}</span>${contact ? `<br>${esc(contact)}` : ""}<br>Este mensaje fue enviado desde la casilla oficial del negocio.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Genera el PDF y lo manda al cliente. Devuelve el nombre del archivo enviado. */
export async function sendInvoiceEmail(
  settings: Settings,
  issuer: Issuer | undefined,
  inv: Invoice,
  to: string,
) {
  const email = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("El email del cliente no es válido.");
  const pdf = await buildInvoicePdf(settings, issuer, inv);
  const name = issuer?.name ?? settings.businessName;
  const subject = `Factura ${pdf.letter} ${pdf.number} · ${settings.businessName}`;
  const text = `Hola,\n\nTe enviamos la factura ${pdf.letter} N° ${pdf.number} del ${fmtFull(inv.fecha)} por ${ars2(inv.total)}. El PDF con el código QR de ARCA va adjunto.\n\nCAE ${inv.cae}\n\n${name}${settings.phone ? ` · ${settings.phone}` : ""}`;
  await mailSend({
    to: [email],
    subject,
    text,
    html: invoiceEmailHtml(settings, issuer, inv, pdf.number),
    attachments: [
      {
        filename: pdf.filename,
        content: pdf.base64,
        contentType: "application/pdf",
        encoding: "base64",
      },
    ],
  });
  return pdf.filename;
}
