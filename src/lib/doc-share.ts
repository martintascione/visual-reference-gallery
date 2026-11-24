// Compartir presupuestos y comprobantes: PDF subido a un link para mandarlo por WhatsApp,
// o el archivo mismo con el menú de compartir del celular.
import type { DB, Quote, Sale } from "./types";
import { supabase } from "./supabase";
import { documentHtml, pdfFromHtml } from "./quote-pdf";
import { ars } from "./format";

const DEMO = (import.meta.env as Record<string, string | undefined>)["VITE_DEMO"] === "1";

/** Sube el PDF y devuelve un link público para abrirlo sin descargar nada. */
export async function uploadDocPdf(blob: Blob, fileName: string) {
  if (DEMO) return `https://ejemplo.com/${encodeURIComponent(fileName)}.pdf`;
  const safe = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const path = `${crypto.randomUUID()}/${safe || "documento"}.pdf`;
  const { error } = await supabase.storage
    .from("documentos")
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("documentos").getPublicUrl(path).data.publicUrl;
}

/** Texto corto y prolijo para mandar por WhatsApp. */
export function waCopy(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta", link: string) {
  const n = String(doc.number).padStart(4, "0");
  const name =
    doc.clientName && doc.clientName.toLowerCase() !== "consumidor final"
      ? ` ${doc.clientName.split(" ")[0]}`
      : "";
  const what =
    kind === "presupuesto" ? `el presupuesto N° ${n}` : `el comprobante de tu compra N° ${n}`;
  const valid =
    "validUntil" in doc
      ? ` Es válido hasta el ${doc.validUntil.slice(8, 10)}/${doc.validUntil.slice(5, 7)}.`
      : "";
  return `Hola${name}! Te paso ${what} de ${db.settings.businessName} por ${ars(doc.total)}.${valid}\n\nLo podés ver acá: ${link}\n\nCualquier consulta, avisame.`;
}

/** Número para wa.me: 54 + característica sin el 0 y sin el 15. */
export function waPhone(raw: string | undefined) {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");
  return "549" + d;
}

/**
 * Manda el documento por WhatsApp con el PDF listo para abrir.
 * En el celular usa el menú de compartir con el archivo adjunto; en la compu, un link al PDF.
 */
export async function shareDocWhatsApp(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta") {
  const { html, fileName } = documentHtml(db, doc, kind, false);
  const phone = waPhone(
    ("phone" in doc ? doc.phone : undefined) ??
      db.clients.find((c) => c.id === doc.clientId)?.phone,
  );
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  // La ventana se abre antes de armar el PDF para que el navegador no la bloquee.
  const win = mobile ? null : window.open("about:blank", "_blank");
  try {
    const { blob } = await pdfFromHtml(html);
    const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" });
    if (mobile && navigator.canShare?.({ files: [file] })) {
      const text = waCopy(db, doc, kind, "").replace(/\n\nLo podés ver acá: \n/, "\n");
      await navigator.share({ files: [file], text });
      return "compartido";
    }
    const link = await uploadDocPdf(blob, fileName);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(waCopy(db, doc, kind, link))}`;
    if (win) win.location.href = url;
    else window.location.href = url;
    return "link";
  } catch (e) {
    win?.close();
    throw e;
  }
}
