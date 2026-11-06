// PDF de factura electrónica (A/B/C) con CAE y QR de ARCA, generado con jsPDF.
// Diseño minimalista: blanco, Helvetica, líneas finas y un solo acento (el magenta del logo).
// El mismo archivo se usa para ver/imprimir y para adjuntar en el mail al cliente.
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Issuer, Settings } from "./types";
import type { Invoice } from "./arca";
import { cbteLetter, invoiceQrUrl } from "./arca";
import { ars2 } from "./format";
import logo from "@/assets/aridos-petreos-logo.png";

const BRAND: [number, number, number] = [193, 33, 196];
const INK: [number, number, number] = [29, 29, 31];
const GREY: [number, number, number] = [134, 134, 139];
const SOFT: [number, number, number] = [81, 81, 84];
const LINE: [number, number, number] = [229, 229, 234];

const fmtFull = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtYmd = (s: string) =>
  s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s;
const fmtCuit = (c: string) =>
  c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c;
const qty = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

let logoCache: { dataUrl: string; ratio: number } | null = null;
async function loadLogo() {
  if (logoCache) return logoCache;
  const res = await fetch(new URL(logo, window.location.origin).href);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("logo"));
    fr.readAsDataURL(blob);
  });
  const ratio = await new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width / img.height || 3.3);
    img.onerror = () => resolve(3.3);
    img.src = dataUrl;
  });
  logoCache = { dataUrl, ratio };
  return logoCache;
}

export type InvoicePdf = {
  blob: Blob;
  base64: string;
  filename: string;
  number: string;
  letter: string;
};

/** Genera el PDF de la factura (archivo) con el diseño de la marca. */
export async function buildInvoicePdf(
  settings: Settings,
  issuer: Issuer | undefined,
  inv: Invoice,
  copy: "ORIGINAL" | "DUPLICADO" = "ORIGINAL",
): Promise<InvoicePdf> {
  const letter = cbteLetter(inv.cbteTipo);
  const code = inv.cbteTipo === 1 ? "001" : inv.cbteTipo === 6 ? "006" : "011";
  const number = `${String(inv.ptoVta).padStart(5, "0")}-${String(inv.cbteNro).padStart(8, "0")}`;
  const discriminated = inv.cbteTipo === 1;
  const issuerName = issuer?.name ?? settings.businessName;
  const condEmisor =
    issuer?.kind === "monotributo" ? "Responsable Monotributo" : "IVA Responsable Inscripto";
  const docLabel = inv.docTipo === 80 ? "CUIT" : inv.docTipo === 96 ? "DNI" : "";
  const [qr, lg] = await Promise.all([
    QRCode.toDataURL(invoiceQrUrl(inv), {
      margin: 0,
      width: 300,
      errorCorrectionLevel: "M",
      color: { dark: "#1a1a1a", light: "#ffffff" },
    }),
    loadLogo(),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210;
  const L = 16;
  const R = W - 16;
  const font = (
    size: number,
    style: "normal" | "bold" = "normal",
    color: [number, number, number] = INK,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const hr = (y: number, color: [number, number, number] = LINE, w = 0.25) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(L, y, R, y);
  };
  const label = (t: string, x: number, y: number, align: "left" | "right" = "left") => {
    font(6.5, "normal", GREY);
    doc.text(t.toUpperCase(), x, y, { align, charSpace: 0.4 });
  };

  // Encabezado
  const logoH = 13;
  doc.addImage(lg.dataUrl, "PNG", L, 14, logoH * lg.ratio, logoH);
  font(6.5, "normal", GREY);
  doc.text(copy, L, 33, { charSpace: 0.6 });
  font(22, "normal", INK);
  const tW = doc.getTextWidth("Factura ");
  doc.setFont("helvetica", "bold");
  const lW = doc.getTextWidth(letter);
  doc.setFont("helvetica", "normal");
  doc.text("Factura ", R - lW - tW, 23);
  doc.setFont("helvetica", "bold");
  doc.text(letter, R - lW, 23);
  font(10.5, "bold", INK);
  doc.text(`N° ${number}`, R, 30, { align: "right" });
  font(8.5, "normal", GREY);
  doc.text(`Emitida el ${fmtFull(inv.fecha)}`, R, 35, { align: "right" });
  hr(42);

  // Emisor / Cliente / Letra
  let y = 50;
  label("Emisor", L, y);
  label("Cliente", 102, y);
  const lines = (items: string[], x: number, startY: number, nameFirst = true) => {
    let yy = startY;
    items.forEach((t, i) => {
      if (!t) return;
      if (i === 0 && nameFirst) font(10.5, "bold", INK);
      else font(8.5, "normal", SOFT);
      const wrapped = doc.splitTextToSize(t, 78) as string[];
      doc.text(wrapped, x, yy);
      yy += wrapped.length * (i === 0 && nameFirst ? 5.2 : 4.3);
    });
    return yy;
  };
  const yE = lines(
    [
      issuerName,
      `CUIT ${fmtCuit(inv.cuitEmisor)}`,
      issuer?.address ??
        (settings.address ? `${settings.address}${settings.city ? ", " + settings.city : ""}` : ""),
      condEmisor,
      issuer?.iibb ? `Ingresos Brutos ${issuer.iibb}` : "",
      issuer?.activityStart ? `Inicio de actividades ${fmtFull(issuer.activityStart)}` : "",
    ],
    L,
    y + 6,
  );
  const yC = lines(
    [
      inv.clientName,
      docLabel ? `${docLabel} ${inv.docTipo === 80 ? fmtCuit(inv.docNro) : inv.docNro}` : "",
      inv.clientAddress ?? "",
      inv.clientIva ?? "Consumidor final",
      "Condición de venta: contado",
    ],
    102,
    y + 6,
  );
  // Letra
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.roundedRect(R - 18, y - 3, 18, 18, 4, 4);
  font(16, "bold", BRAND);
  doc.text(letter, R - 9, y + 6, { align: "center" });
  font(5.5, "normal", BRAND);
  doc.text(`COD. ${code}`, R - 9, y + 11, { align: "center", charSpace: 0.3 });
  y = Math.max(yE, yC, y + 18) + 4;
  hr(y);

  // Tabla
  y += 8;
  const cols = discriminated
    ? { desc: L, qty: 118, price: 146, iva: 164, total: R }
    : { desc: L, qty: 126, price: 158, iva: 0, total: R };
  label("Descripción", cols.desc, y);
  label("Cantidad", cols.qty, y, "right");
  label(discriminated ? "Precio neto" : "Precio", cols.price, y, "right");
  if (discriminated) label("IVA", cols.iva, y, "right");
  label("Importe", cols.total, y, "right");
  y += 2.5;
  hr(y, INK, 0.3);
  const items = inv.items.length
    ? inv.items
    : [{ desc: "Venta", qty: 1, unit: "", price: discriminated ? inv.neto : inv.total }];
  for (const it of items) {
    // Los ítems ya vienen sin IVA (precio de lista); en Factura A el IVA se suma en los totales.
    const unit = it.price;
    const desc = doc.splitTextToSize(it.desc || "Venta", cols.qty - L - 30) as string[];
    const rowH = Math.max(1, desc.length) * 4.4 + 4.5;
    if (y + rowH > 248) {
      doc.addPage();
      y = 20;
    }
    font(9, "bold", INK);
    doc.text(desc, cols.desc, y + 6);
    font(9, "normal", SOFT);
    doc.text(`${qty(it.qty)}${it.unit ? " " + it.unit : ""}`, cols.qty, y + 6, { align: "right" });
    doc.text(ars2(unit), cols.price, y + 6, { align: "right" });
    if (discriminated) doc.text(`${settings.ivaPct}%`, cols.iva, y + 6, { align: "right" });
    font(9, "bold", INK);
    doc.text(ars2(unit * it.qty), cols.total, y + 6, { align: "right" });
    y += rowH;
    hr(y);
  }

  // Totales
  y += 8;
  const tx = 126;
  const kv = (k: string, v: string, yy: number, big = false) => {
    font(big ? 10.5 : 8.5, big ? "bold" : "normal", big ? INK : SOFT);
    doc.text(k, tx, yy);
    font(big ? 16 : 8.5, big ? "bold" : "normal", INK);
    doc.text(v, R, yy, { align: "right" });
  };
  if (discriminated) {
    kv("Neto gravado", ars2(inv.neto), y);
    kv(`IVA ${settings.ivaPct}%`, ars2(inv.iva), y + 5.5);
    y += 9;
  } else {
    kv("Subtotal", ars2(inv.total), y);
    y += 3.5;
  }
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(tx, y + 2, R, y + 2);
  kv("Total", ars2(inv.total), y + 10, true);
  if (inv.note) {
    label("Observaciones", L, y - (discriminated ? 9 : 3.5));
    font(8.5, "normal", SOFT);
    doc.text(doc.splitTextToSize(inv.note, 95) as string[], L, y - (discriminated ? 9 : 3.5) + 5);
  }

  // CAE + QR (al pie)
  const yc = Math.max(y + 26, 236);
  hr(yc);
  doc.addImage(qr, "PNG", L, yc + 6, 24, 24);
  label("CAE", L + 30, yc + 11);
  font(12, "bold", INK);
  doc.text(inv.cae, L + 30, yc + 17, { charSpace: 0.3 });
  font(7.5, "normal", GREY);
  doc.text(`Vencimiento ${fmtYmd(inv.caeVto)} · Comprobante autorizado por ARCA`, L + 30, yc + 22);
  font(8.5, "normal", INK);
  doc.text(issuerName, R, yc + 15, { align: "right" });
  font(7.5, "normal", GREY);
  doc.text(`Factura ${letter} · ${number}`, R, yc + 20, { align: "right" });
  font(7, "normal", BRAND);
  const foot1 = "Áridos Petreos";
  const foot2 = ` · Piedras naturales${settings.phone ? ` · ${settings.phone}` : ""}${settings.instagram ? ` · ${settings.instagram}` : ""}`;
  const fw =
    doc.getTextWidth(foot1) +
    (() => {
      doc.setTextColor(...GREY);
      return doc.getTextWidth(foot2);
    })();
  const fx = (W - fw) / 2;
  doc.setTextColor(...BRAND);
  doc.text(foot1, fx, 284);
  doc.setTextColor(...GREY);
  doc.text(foot2, fx + doc.getTextWidth(foot1), 284);

  const blob = doc.output("blob");
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  return { blob, base64, filename: `Factura-${letter}-${number}.pdf`, number, letter };
}

/** Abre el PDF en una pestaña nueva (desde ahí se imprime o se guarda). */
export async function openInvoicePdf(
  settings: Settings,
  issuer: Issuer | undefined,
  inv: Invoice,
  copy: "ORIGINAL" | "DUPLICADO" = "ORIGINAL",
) {
  const pdf = await buildInvoicePdf(settings, issuer, inv, copy);
  const url = URL.createObjectURL(pdf.blob);
  const w = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!w;
}
