import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Forward,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  fileToAttachment,
  fmtAddr,
  folderLabel,
  mailAttachment,
  mailDelete,
  mailFolders,
  mailGet,
  mailList,
  mailMove,
  mailSend,
  shortAddr,
  type MailFolder,
  type MailMessage,
  type SendAttachment,
} from "@/lib/correo";
import { Badge, Empty, Field, Input, Modal, PageHeader, btn } from "@/components/ui-bits";

export const Route = createFileRoute("/correo")({
  head: () => ({
    meta: [
      { title: "Casilla · Corralón" },
      { name: "description", content: "Correo del negocio dentro de la plataforma." },
    ],
  }),
  component: Correo,
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};
const fmtSize = (n: number) =>
  n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

type Compose = {
  to: string;
  cc: string;
  subject: string;
  text: string;
  attachments: SendAttachment[];
  inReplyTo?: { uid: number; folder: string } | undefined;
  forwardOf?: { uid: number; folder: string } | undefined;
};

function Correo() {
  const { db } = useStore();
  const [mailbox, setMailbox] = useState("");
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [list, setList] = useState<MailMessage[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{
    message: MailMessage;
    body: { text: string; html: string };
  } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trashPath = useMemo(
    () => folders.find((f) => /TRASH|DELETED|PAPELERA/i.test(f.path))?.path ?? "INBOX.Trash",
    [folders],
  );

  const loadFolders = async () => {
    try {
      const r = await mailFolders();
      setMailbox(r.mailbox);
      const order = (f: MailFolder) =>
        f.path === "INBOX"
          ? 0
          : /SENT/i.test(f.path)
            ? 1
            : /DRAFT/i.test(f.path)
              ? 2
              : /TRASH/i.test(f.path)
                ? 4
                : /JUNK|SPAM/i.test(f.path)
                  ? 5
                  : 3;
      setFolders([...r.folders].sort((a, b) => order(a) - order(b)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar con el correo");
    }
  };

  const load = async (f = folder, p = page, query = q) => {
    setLoading(true);
    try {
      const search = query.trim()
        ? { subject: query.trim(), from: query.trim(), body: query.trim() }
        : undefined;
      const r = await mailList(f, p, search);
      setList(r.data);
      setPages(r.pagination.totalPages || 1);
      setTotal(r.pagination.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la carpeta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFolders();
  }, []);
  useEffect(() => {
    void load(folder, page, q);
  }, [folder, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMessage = async (m: MailMessage) => {
    setOpening(m.uid);
    try {
      const r = await mailGet(folder, m.uid);
      setOpen(r);
      setList((xs) => xs.map((x) => (x.uid === m.uid ? { ...x, unseen: false } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el mensaje");
    } finally {
      setOpening(null);
    }
  };

  const download = async (
    uid: number,
    id: string,
    filename: string | null,
    contentType: string,
  ) => {
    try {
      const r = await mailAttachment(folder, uid, id);
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType || contentType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? "adjunto";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar");
    }
  };

  const toTrash = async (m: MailMessage) => {
    try {
      if (/TRASH/i.test(folder)) await mailDelete(folder, m.uid);
      else await mailMove(folder, m.uid, trashPath);
      setList((xs) => xs.filter((x) => x.uid !== m.uid));
      if (open?.message.uid === m.uid) setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const quote = (m: MailMessage, body: { text: string; html: string }) => {
    const plain =
      body.text ||
      body.html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return `\n\n\n--- El ${new Date(m.date).toLocaleString("es-AR")}, ${fmtAddr(m.from)} escribió:\n${plain
      .split("\n")
      .map((l) => "> " + l)
      .join("\n")}`;
  };
  const startReply = () => {
    if (!open) return;
    const m = open.message;
    setCompose({
      to: m.from?.address ?? "",
      cc: "",
      subject: /^re:/i.test(m.subject ?? "") ? (m.subject ?? "") : `Re: ${m.subject ?? ""}`,
      text: quote(m, open.body),
      attachments: [],
      inReplyTo: { uid: m.uid, folder },
    });
  };
  const startForward = () => {
    if (!open) return;
    const m = open.message;
    setCompose({
      to: "",
      cc: "",
      subject: /^fwd?:/i.test(m.subject ?? "") ? (m.subject ?? "") : `Fwd: ${m.subject ?? ""}`,
      text: quote(m, open.body),
      attachments: [],
      forwardOf: { uid: m.uid, folder },
    });
  };

  const send = async () => {
    if (!compose) return;
    const to = compose.to
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cc = compose.cc
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!to.length) {
      setError("Falta el destinatario.");
      return;
    }
    setSending(true);
    try {
      const html = `<div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f">${esc(compose.text).replace(/\n/g, "<br>")}<br><br><div style="color:#86868b;font-size:12px">${esc(db.settings.businessName)}${db.settings.phone ? ` · ${esc(db.settings.phone)}` : ""}${db.settings.address ? ` · ${esc(db.settings.address)}` : ""}</div></div>`;
      await mailSend({
        to,
        cc: cc.length ? cc : undefined,
        subject: compose.subject,
        text: compose.text,
        html,
        attachments: compose.attachments.length ? compose.attachments : undefined,
        inReplyTo: compose.inReplyTo,
        forwardOf: compose.forwardOf,
      });
      setCompose(null);
      setToast("Mensaje enviado");
      setTimeout(() => setToast(null), 2500);
      if (/SENT/i.test(folder)) void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !compose) return;
    const atts = await Promise.all(Array.from(files).map(fileToAttachment));
    setCompose({ ...compose, attachments: [...compose.attachments, ...atts] });
  };

  const srcdoc = open
    ? open.body.html
      ? `<base target="_blank"><style>body{font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f;margin:0;padding:4px} img{max-width:100%;height:auto}</style>${open.body.html}`
      : `<style>body{font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f;margin:0;padding:4px;white-space:pre-wrap}</style>${esc(open.body.text)}`
    : "";

  return (
    <>
      <PageHeader
        title="Casilla"
        subtitle={mailbox ? `Correo de ${mailbox}` : "Correo del negocio"}
      >
        <button
          className={btn.soft}
          onClick={() => {
            void loadFolders();
            void load();
          }}
          aria-label="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.6} />{" "}
          Actualizar
        </button>
        <button
          className={btn.primary}
          onClick={() => setCompose({ to: "", cc: "", subject: "", text: "", attachments: [] })}
        >
          <PenSquare className="h-4 w-4" strokeWidth={1.6} /> Redactar
        </button>
      </PageHeader>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {toast && (
        <div className="fixed inset-x-3 top-3 z-50 rounded-full bg-primary px-4 py-2 text-center text-xs text-primary-foreground shadow-soft">
          {toast}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_380px_minmax(0,1fr)]">
        {/* Carpetas */}
        <div className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {folders.map((f) => {
            const on = f.path === folder;
            return (
              <button
                key={f.path}
                onClick={() => {
                  setFolder(f.path);
                  setPage(1);
                  setOpen(null);
                }}
                className={`flex shrink-0 items-center justify-between gap-2 rounded-full px-4 py-2 text-left text-sm transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-accent"}`}
              >
                <span className="flex items-center gap-2">
                  {f.path === "INBOX" ? (
                    <Inbox className="h-4 w-4" strokeWidth={1.6} />
                  ) : (
                    <Mail className="h-4 w-4" strokeWidth={1.6} />
                  )}{" "}
                  {folderLabel(f)}
                </span>
                {typeof f.unseen === "number" && f.unseen > 0 && (
                  <span
                    className={`rounded-full px-2 text-[11px] font-semibold ${on ? "bg-white/20" : "bg-card"}`}
                  >
                    {f.unseen}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Lista */}
        <div
          className={`card-soft flex min-h-[60vh] flex-col overflow-hidden ${open ? "hidden xl:flex" : ""}`}
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-surface px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    void load(folder, 1, q);
                  }
                }}
                placeholder="Buscar en esta carpeta"
                className="h-full w-full bg-transparent text-sm outline-hidden"
              />
              {q && (
                <button
                  onClick={() => {
                    setQ("");
                    setPage(1);
                    void load(folder, 1, "");
                  }}
                  aria-label="Limpiar"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {loading && list.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>
            )}
            {!loading && list.length === 0 && (
              <Empty
                title="Sin mensajes"
                text={q ? "Nada coincide con la búsqueda." : "Esta carpeta está vacía."}
              />
            )}
            {list.map((m) => (
              <button
                key={m.uid}
                onClick={() => void openMessage(m)}
                className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent ${open?.message.uid === m.uid ? "bg-accent" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${m.unseen ? "font-bold" : "font-medium"}`}>
                    {/SENT/i.test(folder)
                      ? `Para: ${m.to.map(shortAddr).join(", ")}`
                      : shortAddr(m.from) || "(sin remitente)"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {opening === m.uid ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      fmtWhen(m.date)
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {m.unseen && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <span
                    className={`truncate text-sm ${m.unseen ? "font-semibold" : "text-muted-foreground"}`}
                  >
                    {m.subject || "(sin asunto)"}
                  </span>
                  {m.attachments.length > 0 && (
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <button
                className={btn.ghost}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anteriores
              </button>
              <span>
                Página {page} de {pages} · {total} mensajes
              </span>
              <button
                className={btn.ghost}
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguientes
              </button>
            </div>
          )}
        </div>

        {/* Lectura */}
        <div
          className={`card-soft flex min-h-[60vh] flex-col overflow-hidden ${open ? "" : "hidden xl:flex"}`}
        >
          {!open ? (
            <Empty title="Elegí un mensaje" text="Se muestra acá, con sus adjuntos." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
                <button className={`${btn.ghost} xl:hidden`} onClick={() => setOpen(null)}>
                  <ArrowLeft className="h-4 w-4" /> Volver
                </button>
                <div className="flex gap-1">
                  <button className={btn.soft} onClick={startReply}>
                    <Reply className="h-4 w-4" /> Responder
                  </button>
                  <button className={btn.soft} onClick={startForward}>
                    <Forward className="h-4 w-4" /> Reenviar
                  </button>
                  <button
                    className={btn.icon}
                    aria-label="Eliminar"
                    onClick={() => void toTrash(open.message)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-bold leading-tight">
                  {open.message.subject || "(sin asunto)"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  De <span className="text-foreground">{fmtAddr(open.message.from)}</span> ·{" "}
                  {new Date(open.message.date).toLocaleString("es-AR")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Para {open.message.to.map(fmtAddr).join(", ")}
                  {open.message.cc.length ? ` · CC ${open.message.cc.map(fmtAddr).join(", ")}` : ""}
                </p>
                {open.message.attachments.filter((a) => !a.inline).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {open.message.attachments
                      .filter((a) => !a.inline)
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() =>
                            void download(open.message.uid, a.id, a.filename, a.contentType)
                          }
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium hover:bg-accent"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {a.filename ?? "adjunto"}{" "}
                          <span className="text-muted-foreground">{fmtSize(a.sizeBytes)}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <iframe
                title="Mensaje"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={srcdoc}
                className="min-h-[50vh] w-full flex-1 bg-white"
              />
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!compose}
        onClose={() => !sending && setCompose(null)}
        title={compose?.inReplyTo ? "Responder" : compose?.forwardOf ? "Reenviar" : "Nuevo mensaje"}
        subtitle={mailbox ? `Desde ${mailbox}` : undefined}
        wide
      >
        {compose && (
          <div className="flex flex-col gap-3">
            <Field label="Para" hint="Varios destinatarios separados por coma">
              <Input
                value={compose.to}
                onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                placeholder="cliente@correo.com"
                autoFocus
              />
            </Field>
            <Field label="CC (opcional)">
              <Input
                value={compose.cc}
                onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
              />
            </Field>
            <Field label="Asunto">
              <Input
                value={compose.subject}
                onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
              />
            </Field>
            <Field label="Mensaje">
              <textarea
                value={compose.text}
                onChange={(e) => setCompose({ ...compose, text: e.target.value })}
                rows={12}
                className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-hidden focus:ring-2 focus:ring-ring"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void addFiles(e.target.files)}
              />
              <button className={btn.soft} onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-4 w-4" /> Adjuntar
              </button>
              {compose.attachments.map((a, i) => (
                <Badge key={i}>
                  {a.filename}
                  <button
                    className="ml-1"
                    aria-label="Quitar"
                    onClick={() =>
                      setCompose({
                        ...compose,
                        attachments: compose.attachments.filter((_, k) => k !== i),
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className={btn.soft} disabled={sending} onClick={() => setCompose(null)}>
                Cancelar
              </button>
              <button
                className={btn.primary}
                disabled={sending || !compose.to.trim()}
                onClick={() => void send()}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}{" "}
                Enviar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
