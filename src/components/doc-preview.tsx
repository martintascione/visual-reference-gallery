import { useEffect, useMemo, useState } from "react";
import { Check, FileDown, Loader2, Mail, MessageCircle } from "lucide-react";
import type { Quote, Sale } from "@/lib/types";
import { useStore } from "@/lib/store";
import { documentHtml, openDocumentPdf, pdfFromHtml } from "@/lib/quote-pdf";
import { canShareFile, shareDocWhatsApp } from "@/lib/doc-share";
import { mailSend } from "@/lib/correo";
import { ars } from "@/lib/format";
import { Input, Modal, btn } from "@/components/ui-bits";

const okEmail = (t: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim());
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Vista previa del presupuesto o comprobante dentro de la página, con descarga y envío por mail. */
export function DocPreview({
  doc,
  kind,
  onClose,
}: {
  doc: Quote | Sale | null;
  kind: "presupuesto" | "venta";
  onClose: () => void;
}) {
  const { db, upsertClient } = useStore();
  const client = doc?.clientId ? db.clients.find((c) => c.id === doc.clientId) : undefined;
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState(false);
  const [state, setState] = useState<{ s: "idle" | "sending" | "ok" | "error"; msg?: string }>({
    s: "idle",
  });
  // Al abrir otro documento: email del cliente y sin mensajes (no se reinicia al guardar el email).
  useEffect(() => {
    setEmail(client?.email ?? "");
    setState({ s: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);
  const built = useMemo(
    () => (doc ? documentHtml(db, doc, kind, false) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.id, kind, db.settings, client],
  );
  // El PDF se arma apenas se abre la vista previa: así WhatsApp y el mail salen al toque.
  const [pdf, setPdf] = useState<{ blob: Blob; base64: string; cover?: Blob | undefined } | null>(
    null,
  );
  useEffect(() => {
    setPdf(null);
    if (!built) return;
    let alive = true;
    pdfFromHtml(built.html)
      .then((r) => alive && setPdf(r))
      .catch(() => alive && setPdf(null));
    return () => {
      alive = false;
    };
  }, [built]);
  if (!doc || !built) return null;
  const isList = "priceList" in doc && !!doc.priceList;
  const label = isList
    ? "lista de precios"
    : kind === "presupuesto"
      ? "presupuesto"
      : "comprobante";
  const fileShare = canShareFile();

  const sendWa = async (how: "archivo" | "link") => {
    setWa(true);
    try {
      const r = await shareDocWhatsApp(db, doc, kind, pdf?.blob, how, pdf?.cover);
      setState({
        s: "ok",
        msg:
          r === "link"
            ? "Se abrió el chat de WhatsApp con el mensaje y el link al PDF, listo para enviar."
            : "PDF compartido como archivo.",
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setState({
          s: "error",
          msg: `No se pudo preparar el WhatsApp: ${e instanceof Error ? e.message : "error"}`,
        });
    } finally {
      setWa(false);
    }
  };

  const send = async () => {
    const to = email.trim();
    if (!okEmail(to)) return;
    setState({ s: "sending", msg: `Enviando a ${to}…` });
    try {
      const ready = pdf ?? (await pdfFromHtml(built.html));
      const base64 = ready.base64;
      const s = db.settings;
      const n = String(doc.number).padStart(4, "0");
      const hello =
        doc.clientName && doc.clientName.toLowerCase() !== "consumidor final"
          ? `Hola ${doc.clientName},`
          : "Hola,";
      const body = `${hello}\n\nTe enviamos ${isList ? "la" : "el"} ${label} N° ${n}${isList ? "" : ` por ${ars(doc.total)}`}${"validUntil" in doc ? `, válido hasta el ${doc.validUntil.slice(8, 10)}/${doc.validUntil.slice(5, 7)}/${doc.validUntil.slice(0, 4)}` : ""}. Va adjunto en PDF.\n\nCualquier consulta, respondé este mail${s.phone ? ` o escribinos al ${s.phone}` : ""}.\n\nSaludos,\n${s.businessName}`;
      await mailSend({
        to: [to],
        subject: `${isList ? "Lista de precios" : kind === "presupuesto" ? "Presupuesto" : "Comprobante"} N° ${n} · ${s.businessName}`,
        text: body,
        html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1d1d1f;max-width:560px">${esc(body).replace(/\n/g, "<br>")}</div>`,
        attachments: [
          {
            filename: `${built.fileName}.pdf`,
            content: base64,
            contentType: "application/pdf",
            encoding: "base64",
          },
        ],
      });
      // Si el mail es nuevo o cambió, queda guardado en el cliente.
      if (client && (client.email ?? "") !== to) upsertClient({ ...client, email: to });
      setState({ s: "ok", msg: `Enviado a ${to}` });
    } catch (e) {
      setState({
        s: "error",
        msg: `No se pudo enviar: ${e instanceof Error ? e.message : "error"}`,
      });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={built.fileName}
      subtitle={
        isList
          ? "Vista previa de la lista de precios"
          : `Vista previa del ${label} · ${ars(doc.total)}`
      }
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <button className={`${btn.soft} mr-auto`} onClick={() => openDocumentPdf(db, doc, kind)}>
            <FileDown className="h-4 w-4" strokeWidth={1.6} /> Descargar PDF
          </button>
          <button
            className={btn.soft}
            disabled={wa || !pdf}
            onClick={() => void sendWa(fileShare ? "archivo" : "link")}
            title={
              pdf
                ? fileShare
                  ? "Abre el menú Compartir con el PDF adjunto"
                  : "Abre el chat de WhatsApp con el link al PDF"
                : "Preparando el PDF…"
            }
          >
            {wa || !pdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" strokeWidth={1.6} />
            )}
            WhatsApp
          </button>
          {fileShare && (
            <button
              className={btn.ghost}
              disabled={wa || !pdf}
              onClick={() => void sendWa("link")}
              title="Abre el chat del cliente en WhatsApp con el mensaje y el link al PDF"
            >
              Chat con link
            </button>
          )}
          <span className="w-56">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email del cliente"
              className="h-10"
            />
          </span>
          <button
            className={btn.primary}
            disabled={!okEmail(email) || state.s === "sending"}
            onClick={() => void send()}
          >
            {state.s === "sending" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state.s === "ok" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" strokeWidth={1.6} />
            )}
            {state.s === "ok" ? "Enviado" : "Enviar por email"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {state.msg && (
          <p
            className={`rounded-2xl px-4 py-2 text-xs ${state.s === "error" ? "bg-danger-soft text-danger-soft-foreground" : "bg-surface text-muted-foreground"}`}
          >
            {state.msg}
          </p>
        )}
        {fileShare && !/Android|iPhone|iPad/i.test(navigator.userAgent) && (
          <p className="text-[11px] text-muted-foreground">
            WhatsApp: si en el menú Compartir no aparece WhatsApp, tocá "Editar extensiones…" y
            activalo (tiene que estar instalada la app de WhatsApp en la compu). O usá "Chat con
            link", que abre el chat del cliente con el mensaje listo.
          </p>
        )}
        {!client?.email && !email && (
          <p className="text-[11px] text-muted-foreground">
            El cliente no tiene email cargado: escribilo abajo y queda guardado al enviar.
          </p>
        )}
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <iframe title="Vista previa" srcDoc={built.html} className="h-[65vh] w-full" />
        </div>
      </div>
    </Modal>
  );
}
