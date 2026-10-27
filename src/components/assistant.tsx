import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, Mic, MicOff, Plus, Send, Sparkles, X } from "lucide-react";
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
    'Hola, soy el asistente del panel. Preguntame cómo hacer algo (por ejemplo, "cómo cargo una piedra nueva" o "cómo cobro con cheque") y te llevo a la herramienta. Si necesitás algo que el sistema todavía no hace, contame y lo anoto para el programador. También podés hablarme con el micrófono.',
  botones: [
    { etiqueta: "Cargar un producto", accion: { tipo: "nuevo_producto" } },
    { etiqueta: "Hacer una venta", accion: { tipo: "nueva_venta" } },
    { etiqueta: "Cerrar el día", accion: { tipo: "ir", ruta: "/cierre" } },
  ],
};

export function Assistant() {
  const { db, session, setPendingAction } = useStore();
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

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const userMsg: ChatMessage = { role: "user", content: t };
    const next: ChatMessage[] = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setBusy(true);
    if (!DEMO) void saveMessage(convId, userMsg, session?.user.email);
    const reply = await askAssistant(
      next.filter((m) => m !== welcome),
      fullContext(db),
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
      : { role: "assistant", content: reply.texto, botones: reply.botones, nota };
    setMsgs([...next, botMsg]);
    setBusy(false);
    if (!DEMO && !reply.error) {
      await saveMessage(convId, botMsg, session?.user.email);
      setConvs(await loadConversations());
    }
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
        <div className="fixed inset-x-3 bottom-3 top-16 z-50 flex flex-col overflow-hidden rounded-3xl bg-card shadow-soft md:inset-auto md:bottom-6 md:right-6 md:h-[620px] md:w-[400px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <div>
                <p className="text-sm font-semibold">Asistente</p>
                <p className="text-[11px] text-muted-foreground">Te enseña a usar el panel</p>
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
                  <p className="whitespace-pre-wrap">{m.content}</p>
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
            className="flex items-center gap-2 border-t border-border p-3"
          >
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
              placeholder={
                listening ? "Escuchando… hablá tranquilo" : "Escribí o dictá tu pregunta"
              }
              className="h-10 min-w-0 flex-1 rounded-full bg-surface px-4 text-sm outline-hidden focus:ring-2 focus:ring-ring"
              disabled={busy}
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={busy || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
