import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, History, Mic, MicOff, Paperclip, Plus, Send, Sparkles, X } from "lucide-react";
import {
  askAssistant,
  loadConversations,
  loadMessages,
  newConversationId,
  routeFor,
  saveFeatureRequest,
  saveMessage,
  type AssistantAction,
  type ChatMessage,
  type Conversation,
} from "@/lib/assistant";
import { DEMO } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { fullContext } from "@/lib/assistant-context";
import { useStore } from "@/lib/store";
import { ACCEPT, MAX_FILES, prepareAttachment, type Attachment } from "@/lib/attachments";
import { buildImport, type ImportRow, type ProductoPropuesto } from "@/lib/product-import";
import { ars, ars2 } from "@/lib/format";
import { btn } from "./ui-bits";

// Tipos mínimos del reconocimiento de voz del navegador (Chrome, Safari, Edge).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const getRecognition = (): (new () => SpeechRecognitionLike) | undefined => {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const welcome: ChatMessage = {
  role: "assistant",
  content:
    'Hola, soy el asistente del panel. Preguntame cómo hacer algo (por ejemplo, "cómo cargo una piedra nueva" o "cómo cobro con cheque") y te llevo a la herramienta. También podés mandarme una foto, PDF o Excel con tu lista de precios con el clip: la leo y te armo los productos para guardar con un toque. Si necesitás algo que el sistema todavía no hace, contame y lo anoto para el programador.',
  botones: [
    { etiqueta: "Cargar un producto", accion: { tipo: "nuevo_producto" } },
    { etiqueta: "Hacer una venta", accion: { tipo: "nueva_venta" } },
    { etiqueta: "Cerrar el día", accion: { tipo: "ir", ruta: "/cierre" } },
  ],
};

export function Assistant() {
  const { db, session, setPendingAction, upsertProducts } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("abrir-asistente", on);
    return () => window.removeEventListener("abrir-asistente", on);
  }, []);
  const [msgs, setMsgs] = useState<ChatMessage[]>([welcome]);
  const [convId, setConvId] = useState<string>(() => newConversationId());
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Al abrir por primera vez: retoma la última conversación guardada.
  useEffect(() => {
    if (!open || loaded || DEMO) return;
    setLoaded(true);
    void (async () => {
      const list = await loadConversations();
      setConvs(list);
      const last = list[0];
      if (last) {
        setConvId(last.id);
        const m = await loadMessages(last.id);
        if (m.length) setMsgs([welcome, ...m]);
      }
    })();
  }, [open, loaded]);

  const openConversation = async (id: string) => {
    setConvId(id);
    setShowHistory(false);
    const m = await loadMessages(id);
    setMsgs([welcome, ...m]);
  };
  const startNew = () => {
    setConvId(newConversationId());
    setMsgs([welcome]);
    setShowHistory(false);
  };
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const canDictate = typeof window !== "undefined" && !!getRecognition();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open, busy]);

  // Archivos adjuntos del próximo mensaje.
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    setFileErr(null);
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setFileErr(`Hasta ${MAX_FILES} archivos por mensaje.`);
      return;
    }
    setPreparing(true);
    const ok: Attachment[] = [];
    for (const f of arr.slice(0, room)) {
      try {
        ok.push(await prepareAttachment(f));
      } catch (e) {
        setFileErr(e instanceof Error ? e.message : String(e));
      }
    }
    if (arr.length > room) setFileErr(`Hasta ${MAX_FILES} archivos por mensaje.`);
    setFiles((xs) => [...xs, ...ok]);
    setPreparing(false);
  };

  const send = async (text: string) => {
    const adj = files;
    const t = text.trim() || (adj.length ? "Analizá el archivo que te mandé." : "");
    if (!t || busy || preparing) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: t,
      adjuntos: adj.length ? adj.map((a) => ({ nombre: a.nombre, preview: a.preview })) : undefined,
    };
    const next: ChatMessage[] = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setFiles([]);
    setFileErr(null);
    setBusy(true);
    if (!DEMO)
      void saveMessage(
        convId,
        {
          ...userMsg,
          nota: adj.length ? `Adjuntos: ${adj.map((a) => a.nombre).join(", ")}` : undefined,
        },
        session?.user.email,
      );
    const reply = await askAssistant(
      next.filter((m) => m !== welcome),
      fullContext(db),
      adj,
    );
    let nota: string | undefined;
    if (reply.mejora) {
      const ok = await saveFeatureRequest(reply.mejora, next, session?.user.email);
      nota = ok
        ? `Mejora anotada para el programador: "${reply.mejora.titulo}"`
        : "No pude guardar la mejora (revisá la conexión).";
    }
    const botMsg: ChatMessage = reply.error
      ? {
          role: "assistant",
          content: `No pude responder ahora. ${reply.error.includes("ANTHROPIC_API_KEY") ? "Falta configurar la clave del asistente en Supabase." : "Probá de nuevo en un momento."}`,
          nota: reply.error,
        }
      : {
          role: "assistant",
          content: reply.texto,
          botones: reply.botones,
          nota,
          productos: reply.productos?.length ? reply.productos : undefined,
        };
    setMsgs([...next, botMsg]);
    setBusy(false);
    if (!DEMO && !reply.error) {
      await saveMessage(convId, botMsg, session?.user.email);
      setConvs(await loadConversations());
    }
  };

  /** Guarda los productos elegidos de una tabla propuesta y deja constancia en el chat. */
  const applyImport = (index: number, chosen: ImportRow[]) => {
    const rows = chosen.filter((r) => r.product);
    if (!rows.length) return;
    // Sobre el producto actual solo se pisan los precios (el stock pudo cambiar mientras tanto).
    upsertProducts(
      rows.map((r) => {
        const p = r.product!;
        const cur = db.products.find((x) => x.id === p.id);
        return cur
          ? {
              ...cur,
              cost: p.cost,
              price: p.price,
              bagPrice: p.bagPrice,
              bagKg: p.bagKg,
              stoneCost: p.stoneCost,
              active: true,
            }
          : p;
      }),
    );
    const nuevos = rows.filter((r) => r.status === "nuevo").length;
    const act = rows.length - nuevos;
    const resumen = [
      nuevos ? `${nuevos} ${nuevos === 1 ? "creado" : "creados"}` : "",
      act ? `${act} ${act === 1 ? "actualizado" : "actualizados"}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const done: ChatMessage = {
      role: "assistant",
      content: `Listo, guardé los precios: ${resumen}. Ya están en el catálogo y se usan en ventas y presupuestos.`,
      botones: [{ etiqueta: "Ver catálogo", accion: { tipo: "ir", ruta: "/catalogo" } }],
    };
    setMsgs((ms) => [...ms.map((m, i) => (i === index ? { ...m, importado: resumen } : m)), done]);
    if (!DEMO) void saveMessage(convId, done, session?.user.email);
  };

  const run = (a: AssistantAction) => {
    setPendingAction(a.tipo === "ir" ? undefined : a);
    const to = a.tipo === "ir" ? a.ruta : routeFor[a.tipo];
    nav({ to: to as "/" });
    setOpen(false);
  };

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const rec = new R();
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    const base = input ? input + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += txt;
        else interim += txt;
      }
      setInput(base + finalText + interim);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const text = (base + finalText).trim();
      if (text) void send(text);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-3 bottom-3 top-16 z-50 flex flex-col overflow-hidden rounded-3xl bg-card shadow-soft md:inset-auto md:bottom-6 md:right-6 md:h-[660px] md:w-[440px]"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-card/90 text-sm font-medium">
              Soltá el archivo para mandarlo
            </div>
          )}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <div>
                <p className="text-sm font-semibold">Asistente</p>
                <p className="text-[11px] text-muted-foreground">
                  Te enseña el panel y lee tus listas de precios
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className={btn.icon}
                onClick={() => setShowHistory((v) => !v)}
                aria-label="Historial"
                title="Conversaciones anteriores"
              >
                <History className="h-4 w-4" strokeWidth={1.6} />
              </button>
              <button
                className={btn.icon}
                onClick={startNew}
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <Plus className="h-4 w-4" strokeWidth={1.6} />
              </button>
              <button className={btn.icon} onClick={() => setOpen(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showHistory && (
            <div className="max-h-56 overflow-y-auto border-b border-border bg-surface px-3 py-2">
              <p className="px-1 pb-1 text-[11px] font-semibold text-muted-foreground">
                Conversaciones guardadas
              </p>
              {convs.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Todavía no hay conversaciones guardadas.
                </p>
              )}
              {convs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void openConversation(c.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-xs transition-colors hover:bg-card ${c.id === convId ? "bg-card font-medium" : ""}`}
                >
                  <span className="truncate">{c.preview || "(sin texto)"}</span>
                  <span className="shrink-0 text-muted-foreground">{fmtDate(c.startedAt)}</span>
                </button>
              ))}
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[88%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface"}`}
                >
                  {m.adjuntos && m.adjuntos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {m.adjuntos.map((a, k) =>
                        a.preview ? (
                          <img
                            key={k}
                            src={a.preview}
                            alt={a.nombre}
                            className="h-16 w-16 rounded-xl object-cover"
                          />
                        ) : (
                          <span
                            key={k}
                            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px]"
                          >
                            <FileText className="h-3 w-3 shrink-0" strokeWidth={1.6} />
                            <span className="truncate">{a.nombre}</span>
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.productos && m.productos.length > 0 && (
                    <ImportCard
                      propuestos={m.productos}
                      importado={m.importado}
                      onSave={(rows) => applyImport(i, rows)}
                    />
                  )}
                  {m.botones && m.botones.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.botones.map((b, k) => (
                        <button
                          key={k}
                          onClick={() => run(b.accion)}
                          className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          {b.etiqueta}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.nota && <p className="mt-2 text-[11px] text-muted-foreground">{m.nota}</p>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-3xl bg-surface px-4 py-2.5 text-sm text-muted-foreground">
                  Pensando…
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex flex-col gap-2 border-t border-border p-3"
          >
            {(files.length > 0 || preparing || fileErr) && (
              <div className="flex flex-col gap-1.5">
                {(files.length > 0 || preparing) && (
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((f) => (
                      <span
                        key={f.id}
                        className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-2 text-[11px]"
                      >
                        {f.preview ? (
                          <img
                            src={f.preview}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-card">
                            <FileText className="h-3 w-3" strokeWidth={1.6} />
                          </span>
                        )}
                        <span className="truncate">{f.nombre}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((xs) => xs.filter((x) => x.id !== f.id))}
                          aria-label={`Quitar ${f.nombre}`}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {preparing && (
                      <span className="rounded-full bg-surface px-3 py-1.5 text-[11px] text-muted-foreground">
                        Preparando archivo…
                      </span>
                    )}
                  </div>
                )}
                {fileErr && (
                  <p className="px-1 text-[11px] text-danger-soft-foreground">{fileErr}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Adjuntar foto, PDF o Excel"
                title="Adjuntar foto, PDF o Excel"
                disabled={busy}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface transition-colors hover:bg-accent disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.6} />
              </button>
              {canDictate && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-label={listening ? "Detener dictado" : "Dictar"}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${listening ? "bg-danger-soft text-danger-soft-foreground" : "bg-surface hover:bg-accent"}`}
                >
                  {listening ? (
                    <MicOff className="h-4 w-4" strokeWidth={1.6} />
                  ) : (
                    <Mic className="h-4 w-4" strokeWidth={1.6} />
                  )}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const pasted = [...e.clipboardData.files];
                  if (pasted.length) {
                    e.preventDefault();
                    void addFiles(pasted);
                  }
                }}
                placeholder={
                  listening
                    ? "Escuchando… hablá tranquilo"
                    : files.length
                      ? "¿Qué hago con esto? (opcional)"
                      : "Escribí, dictá o adjuntá un archivo"
                }
                className="h-10 min-w-0 flex-1 rounded-full bg-surface px-4 text-sm outline-hidden focus:ring-2 focus:ring-ring"
                disabled={busy}
              />
              <button
                type="submit"
                aria-label="Enviar"
                disabled={busy || preparing || (!input.trim() && !files.length)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Tabla para revisar los productos que leyó la IA antes de guardarlos. */
function ImportCard({
  propuestos,
  importado,
  onSave,
}: {
  propuestos: ProductoPropuesto[];
  importado?: string | undefined;
  onSave: (rows: ImportRow[]) => void;
}) {
  const { db } = useStore();
  // Se calcula una sola vez: después de guardar sigue mostrando lo que se guardó.
  const [rows] = useState(() => buildImport(db, propuestos));
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.status !== "error").map((r) => r.key)),
  );
  const valid = rows.filter((r) => r.status !== "error");
  const chosen = valid.filter((r) => sel.has(r.key));
  const money = (n: number) => (n > 0 && n < 100 ? ars2(n) : ars(n));
  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-semibold">
          {rows.length} {rows.length === 1 ? "producto leído" : "productos leídos"}
        </p>
        {!importado && valid.length > 1 && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() =>
              setSel(chosen.length === valid.length ? new Set() : new Set(valid.map((r) => r.key)))
            }
          >
            {chosen.length === valid.length ? "Quitar todos" : "Elegir todos"}
          </button>
        )}
      </div>
      <div className="max-h-72 divide-y divide-border overflow-y-auto">
        {rows.map((r) => (
          <label
            key={r.key}
            className={`flex gap-2.5 px-3 py-2.5 ${r.status === "error" || importado ? "" : "cursor-pointer"}`}
          >
            {!importado && (
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                checked={sel.has(r.key)}
                disabled={r.status === "error"}
                onChange={() => toggle(r.key)}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold">{r.nombre}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.status === "nuevo" ? "bg-success text-success-foreground" : r.status === "actualiza" ? "bg-surface text-muted-foreground" : "bg-danger-soft text-danger-soft-foreground"}`}
                >
                  {r.status === "nuevo"
                    ? "Nuevo"
                    : r.status === "actualiza"
                      ? "Actualiza"
                      : "No se carga"}
                </span>
              </span>
              {r.status !== "error" && (
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  Costo {money(r.costo)}
                  {r.flete > 0 ? ` + flete ${money(r.flete)}` : ""} · margen{" "}
                  {r.margen.toLocaleString("es-AR")} %
                </span>
              )}
              {r.aviso && (
                <span className="mt-0.5 block text-[11px] leading-snug text-danger-soft-foreground">
                  {r.aviso}
                </span>
              )}
            </span>
            {r.status !== "error" && (
              <span className="shrink-0 text-right">
                <span className="block text-xs font-bold tabular-nums">{money(r.precio)}</span>
                <span className="block text-[10px] text-muted-foreground">por {r.unitLabel}</span>
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="border-t border-border px-3 py-2.5">
        {importado ? (
          <p className="text-[11px] font-medium text-success-foreground">Guardado: {importado}.</p>
        ) : (
          <>
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => onSave(chosen)}
              className="h-9 w-full rounded-full bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Guardar {chosen.length} {chosen.length === 1 ? "producto" : "productos"}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Precios sin IVA. Si algo no está bien, decímelo y lo corrijo antes de guardar.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
