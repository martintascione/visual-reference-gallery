// Compartir presupuestos y comprobantes: PDF subido a un link para mandarlo por WhatsApp,
// o el archivo mismo con el menú de compartir del celular.
import type { DB, Quote, Sale } from "./types";
import { supabase } from "./supabase";
import { documentHtml, pdfFromHtml } from "./quote-pdf";
import { ars } from "./format";

const DEMO = (import.meta.env as Record<string, string | undefined>)["VITE_DEMO"] === "1";

/**
 * Sube el PDF (más la imagen y el título para la vista previa en WhatsApp)
 * y devuelve un link corto del propio sitio (ej. aridospetreos.com/p/k3f9a2x).
 */
export async function uploadDocPdf(
  blob: Blob,
  _fileName: string,
  preview?: { cover?: Blob | undefined; title: string; description: string },
) {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  const id = [...bytes].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
  const host = window.location.host.replace(/^www\./, "");
  if (DEMO) return `${host}/p/${id}`;
  const up = (path: string, body: Blob, type: string) =>
    supabase.storage.from("documentos").upload(path, body, { contentType: type, upsert: false });
  const { error } = await up(`d/${id}.pdf`, blob, "application/pdf");
  if (error) throw new Error(error.message);
  // La vista previa es un extra: si falla, el link igual funciona.
  if (preview) {
    await Promise.all([
      preview.cover ? up(`d/${id}.jpg`, preview.cover, "image/jpeg") : null,
      up(
        `d/${id}.json`,
        new Blob([JSON.stringify({ t: preview.title, d: preview.description })], {
          type: "application/json",
        }),
        "application/json",
      ),
    ]).catch(() => null);
  }
  return `${host}/p/${id}`;
}

/** Mensaje corto y simple para WhatsApp. */
export function waCopy(db: DB, doc: Quote | Sale, kind: "presupuesto" | "venta", link: string) {
  const n = String(doc.number).padStart(4, "0");
  const first =
    doc.clientName && doc.clientName.toLowerCase() !== "consumidor final"
      ? ` ${doc.clientName
          .trim()
          .split(" ")[0]!
          .replace(/^./, (c) => c.toUpperCase())}`
      : "";
  const isList = "priceList" in doc && !!doc.priceList;
  const what = isList
    ? `la lista de precios N° ${n}`
    : kind === "presupuesto"
      ? `el presupuesto N° ${n}`
      : `el comprobante N° ${n}`;
  const valid =
    "validUntil" in doc
      ? `, válido hasta el ${doc.validUntil.slice(8, 10)}/${doc.validUntil.slice(5, 7)}`
      : "";
  return `Hola${first}! Te paso ${what}${isList ? "" : ` por ${ars(doc.total)}`}${valid}.${link ? `\n${link}` : ""}\n\n${db.settings.businessName}`;
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

/** ¿El navegador puede compartir el archivo PDF directo (menú de compartir con WhatsApp)? */
export function canShareFile() {
  try {
    const f = new File([new Blob(["x"], { type: "application/pdf" })], "x.pdf", {
      type: "application/pdf",
    });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

/**
 * Manda el documento por WhatsApp. Si el navegador lo permite, abre el menú de compartir
 * con el PDF adjunto (se elige WhatsApp y el chat). Si no, abre WhatsApp con el mensaje y un link corto al PDF.
 * El PDF ya tiene que estar armado (blob) para no perder el clic del usuario.
 */
export async function shareDocWhatsApp(
  db: DB,
  doc: Quote | Sale,
  kind: "presupuesto" | "venta",
  ready?: Blob,
  /** "archivo": menú de compartir con el PDF adjunto. "link": abre el chat de WhatsApp con un link al PDF. */
  how: "archivo" | "link" = "archivo",
  cover?: Blob,
) {
  const { html, fileName } = documentHtml(db, doc, kind, false);
  const phone = waPhone(
    ("phone" in doc ? doc.phone : undefined) ??
      db.clients.find((c) => c.id === doc.clientId)?.phone,
  );
  if (how === "archivo" && ready && canShareFile()) {
    const file = new File([ready], `${fileName}.pdf`, { type: "application/pdf" });
    const text = waCopy(db, doc, kind, "");
    await navigator.share({ files: [file], title: fileName, text });
    return "compartido";
  }
  // La ventana se abre antes de subir el PDF para que el navegador no la bloquee.
  const win = window.open("about:blank", "_blank");
  try {
    const made = ready ? null : await pdfFromHtml(html);
    const blob = ready ?? made!.blob;
    const n = String(doc.number).padStart(4, "0");
    const link = await uploadDocPdf(blob, fileName, {
      cover: cover ?? made?.cover,
      title: `${"priceList" in doc && doc.priceList ? "Lista de precios" : kind === "presupuesto" ? "Presupuesto" : "Comprobante"} N° ${n} · ${db.settings.businessName}`,
      description: `${doc.clientName && doc.clientName.toLowerCase() !== "consumidor final" ? doc.clientName + " · " : ""}${"priceList" in doc && doc.priceList ? "Precios por producto" : `Total ${ars(doc.total)}`}. Tocá para ver el PDF.`,
    });
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(waCopy(db, doc, kind, link))}`;
    if (win) win.location.href = url;
    else window.location.href = url;
    return "link";
  } catch (e) {
    win?.close();
    throw e;
  }
}
