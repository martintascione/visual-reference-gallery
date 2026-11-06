// Detección de errores: todo lo que falla en la app queda registrado en la tabla app_errors
// (errores de JavaScript, pantallas rotas, escrituras a la base, ARCA y asistente) con contexto,
// para revisarlo desde Configuración → Salud del sistema sin esperar a que avise el cliente.

import { supabase } from "./supabase";

const env = import.meta.env as Record<string, string | undefined>;
const DEMO = env["VITE_DEMO"] === "1";

export type ErrorSource = "pantalla" | "base" | "arca" | "asistente" | "red" | "otro";

export type AppError = {
  id: string;
  createdAt: string;
  source: ErrorSource;
  message: string;
  stack?: string | undefined;
  route?: string | undefined;
  userEmail?: string | undefined;
  userAgent?: string | undefined;
  context?: Record<string, unknown> | undefined;
  count: number;
  resolved: boolean;
  notes?: string | undefined;
  analysis?: string | undefined;
};

// Evita registrar el mismo error muchas veces seguidas (ráfagas de re-render, reintentos).
const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

let currentUser: string | undefined;
export function setErrorUser(email: string | undefined) {
  currentUser = email;
}

function clean(msg: string) {
  return msg.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Registra un error en la base. Nunca lanza: si falla, lo deja en consola. */
export function reportError(source: ErrorSource, err: unknown, context?: Record<string, unknown>) {
  try {
    const e =
      err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
    const message = clean(e.message || "Error sin mensaje");
    // Ruido que no sirve para diagnosticar.
    if (
      /ResizeObserver loop|Script error\.?$|Load failed|NetworkError when attempting|Failed to fetch dynamically imported/i.test(
        message,
      ) &&
      source === "pantalla"
    )
      return;
    const key = `${source}|${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < WINDOW_MS) return;
    recent.set(key, now);
    console.error(`[${source}]`, e, context ?? "");
    if (DEMO) return;
    const row = {
      source,
      message,
      stack: (e.stack ?? "").slice(0, 4000) || null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      user_email: currentUser ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      context: context
        ? JSON.parse(
            JSON.stringify(context, (_k, v) =>
              typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) + "…" : v,
            ),
          )
        : null,
    };
    void supabase.rpc("log_app_error", { p: row }).then(({ error }) => {
      if (error) console.warn("No se pudo registrar el error:", error.message);
    });
  } catch (inner) {
    console.warn("reportError falló:", inner);
  }
}

/** Captura global: errores no manejados y promesas rechazadas. Llamar una sola vez. */
export function installErrorCapture() {
  if (typeof window === "undefined" || (window as unknown as { __errCap?: boolean }).__errCap)
    return;
  (window as unknown as { __errCap?: boolean }).__errCap = true;
  window.addEventListener("error", (ev) => {
    reportError("pantalla", ev.error ?? ev.message, {
      file: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    reportError("pantalla", ev.reason, { tipo: "promesa sin manejar" });
  });
}

export async function loadErrors(onlyOpen = true, limit = 100): Promise<AppError[]> {
  if (DEMO) return [];
  let q = supabase
    .from("app_errors")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (onlyOpen) q = q.eq("resolved", false);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id),
    createdAt: String(r.last_seen ?? r.created_at),
    source: r.source as ErrorSource,
    message: String(r.message),
    stack: r.stack ?? undefined,
    route: r.route ?? undefined,
    userEmail: r.user_email ?? undefined,
    userAgent: r.user_agent ?? undefined,
    context: (r.context as Record<string, unknown> | null) ?? undefined,
    count: Number(r.count ?? 1),
    resolved: !!r.resolved,
    notes: r.notes ?? undefined,
    analysis: r.analysis ?? undefined,
  }));
}

export async function setErrorResolved(id: string, resolved: boolean) {
  await supabase
    .from("app_errors")
    .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
}

export async function saveErrorAnalysis(id: string, analysis: string) {
  await supabase.from("app_errors").update({ analysis }).eq("id", id);
}

/** Pide al asistente un diagnóstico del error (causa probable, impacto, qué hacer). */
export async function analyzeError(e: AppError): Promise<string> {
  const prompt = [
    "Analizá este error técnico de la plataforma y respondé en español, corto y claro, con tres partes: Qué pasó (en palabras simples para el dueño del negocio), Causa probable (técnica, para el programador), Qué hacer ahora (si el usuario puede seguir trabajando y cómo).",
    `Origen: ${e.source}`,
    `Mensaje: ${e.message}`,
    e.route ? `Pantalla: ${e.route}` : "",
    e.count > 1 ? `Se repitió ${e.count} veces.` : "",
    e.context ? `Contexto: ${JSON.stringify(e.context).slice(0, 1500)}` : "",
    e.stack ? `Stack: ${e.stack.slice(0, 1200)}` : "",
    e.userAgent ? `Navegador: ${e.userAgent}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const { data, error } = await supabase.functions.invoke<{ texto?: string; error?: string }>(
    "asistente",
    {
      body: {
        messages: [{ role: "user", content: prompt }],
        contexto:
          "Modo diagnóstico técnico: no proponés acciones del negocio, solo analizás el error.",
      },
    },
  );
  if (error) throw new Error(error.message);
  if (!data?.texto) throw new Error(data?.error ?? "Sin respuesta");
  return data.texto;
}
