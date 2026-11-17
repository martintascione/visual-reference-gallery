// Edge Function "recordatorios": mail de lunes a viernes a la mañana con los presupuestos para seguir.
// La dispara pg_cron (con la clave de la tabla cron_secrets) o un usuario logueado desde Configuración ("Enviar prueba").
// Envía desde la casilla del negocio con la API de correo de Hostinger (secreto HOSTINGER_MAIL_TOKEN).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const API = "https://api.mail.hostinger.com/api/v1";
const APP = "https://aridospetreos.com";

type Quote = {
  id: string;
  number: number;
  client_name: string;
  phone: string | null;
  total: number | string;
  status: string;
  valid_until: string;
  follow_up: string | null;
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ars = (n: number) =>
  "$ " + Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 }).replace(/,/g, ".");
const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
/** Fecha de hoy en Argentina (UTC-3), formato AAAA-MM-DD. */
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function hostinger(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Hostinger ${r.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function html(business: string, today: string, rows: Quote[]) {
  const items = rows
    .map((q) => {
      const follow = (q.follow_up ?? q.valid_until).slice(0, 10);
      const vencido = q.valid_until.slice(0, 10) < today;
      const tel = (q.phone ?? "").replace(/\D/g, "");
      const estado = vencido
        ? `<span style="color:#c0392b;font-weight:600">Venció el ${fecha(q.valid_until)}</span>`
        : follow < today
          ? `Para llamar desde el ${fecha(follow)}`
          : "Para llamar hoy";
      return `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #ececef">
          <div style="font-size:15px;font-weight:600;color:#1d1d1f">${esc(q.client_name || "Sin nombre")}</div>
          <div style="font-size:12px;color:#86868b;margin-top:3px">Presupuesto #${q.number} · ${estado}${tel ? ` · <a href="https://wa.me/54${tel}" style="color:#C121C4;text-decoration:none">WhatsApp ${esc(q.phone ?? "")}</a>` : ""}</div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #ececef;text-align:right;font-size:15px;font-weight:700;color:#1d1d1f;white-space:nowrap">${ars(Number(q.total))}</td>
      </tr>`;
    })
    .join("");
  const total = rows.reduce((a, q) => a + Number(q.total), 0);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:24px">
<tr><td style="padding:28px 28px 0">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#86868b">Seguimiento de presupuestos</div>
  <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:#1d1d1f;margin-top:6px">${rows.length === 1 ? "Hoy hay 1 cliente para llamar" : `Hoy hay ${rows.length} clientes para llamar`}</div>
  <div style="font-size:13px;color:#86868b;margin-top:4px">${fecha(today)} · ${ars(total)} en presupuestos abiertos</div>
</td></tr>
<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table></td></tr>
<tr><td style="padding:22px 28px 0" align="center">
  <a href="${APP}/presupuestos" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:999px">Abrir presupuestos</a>
</td></tr>
<tr><td style="padding:20px 28px 26px;font-size:12px;line-height:1.6;color:#86868b;text-align:center">
  Cuando hables con el cliente, tocá "Hablé, seguir en X días", "Aceptado" o "Perdido" y deja de aparecer.<br>
  <span style="color:#C121C4;font-weight:600">${esc(business)}</span> · Este aviso se envía de lunes a viernes a las 8:30. Se apaga en Configuración.
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    // Quién la llama: el cron (secreto) o un usuario logueado (prueba).
    // El aviso programado manda una clave que genera y guarda la base (tabla cron_secrets, sin acceso público).
    const sent = req.headers.get("x-cron-secret");
    let cronOk = false;
    if (sent) {
      const { data: cs } = await db.from("cron_secrets").select("token").eq("id", "recordatorios").maybeSingle();
      cronOk = !!cs?.token && cs.token === sent;
    }
    let prueba = false;
    if (!cronOk) {
      const auth = req.headers.get("Authorization") ?? "";
      const { data, error } = await db.auth.getUser(auth.replace("Bearer ", ""));
      if (error || !data.user) return json({ error: "No autorizado" }, 401);
      prueba = true;
    }
    const body = (await req.json().catch(() => ({}))) as { to?: string };

    const { data: st } = await db.from("settings").select("data").eq("id", "main").maybeSingle();
    const settings = (st?.data ?? {}) as { businessName?: string; followUpEmail?: { on: boolean; to: string } };
    const cfg = settings.followUpEmail ?? { on: true, to: "administracion@aridospetreos.com" };
    if (!prueba && !cfg.on) return json({ ok: true, enviado: false, motivo: "Apagado en Configuración" });
    const to = (body.to || cfg.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ ok: false, error: "Falta un email válido en Configuración." });

    const today = hoyAR();
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    if (!prueba && (dow === 0 || dow === 6)) return json({ ok: true, enviado: false, motivo: "Fin de semana" });

    const { data: quotes, error } = await db
      .from("quotes")
      .select("id, number, client_name, phone, total, status, valid_until, follow_up")
      .in("status", ["borrador", "enviado", "seguimiento"]);
    if (error) throw error;
    const rows = ((quotes ?? []) as Quote[])
      .filter((q) => (q.follow_up ?? q.valid_until).slice(0, 10) <= today)
      .sort((a, b) => (a.follow_up ?? a.valid_until).localeCompare(b.follow_up ?? b.valid_until));
    if (!rows.length && !prueba) return json({ ok: true, enviado: false, motivo: "No hay presupuestos para seguir" });

    const token = Deno.env.get("HOSTINGER_MAIL_TOKEN");
    if (!token) throw new Error("Falta el secreto HOSTINGER_MAIL_TOKEN.");
    const me = await hostinger(token, "GET", "/me");
    const box = (me?.data?.mailboxes ?? [])[0] as { resourceId: string; address: string } | undefined;
    if (!box) throw new Error("El token de correo no tiene buzón.");
    const business = settings.businessName ?? "Áridos Petreos";
    const subject = rows.length
      ? `Seguimiento: ${rows.length} ${rows.length === 1 ? "presupuesto" : "presupuestos"} para llamar hoy`
      : "Seguimiento: hoy no hay presupuestos para llamar (prueba)";
    const text = rows.length
      ? rows.map((q) => `#${q.number} ${q.client_name} ${ars(Number(q.total))}${q.phone ? " · " + q.phone : ""}`).join("\n") + `\n\n${APP}/presupuestos`
      : "Hoy no hay presupuestos para llamar. Este es un mail de prueba.";
    await hostinger(token, "POST", `/mailboxes/${box.resourceId}/send`, {
      to: [to],
      subject,
      text,
      html: rows.length ? html(business, today, rows) : `<p style="font-family:Arial,sans-serif;font-size:15px">Hoy no hay presupuestos para llamar. Este es un mail de prueba del recordatorio diario.</p>`,
    });
    return json({ ok: true, enviado: true, cantidad: rows.length, a: to });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await db.rpc("log_app_error", { p: { source: "red", message: `Recordatorios: ${msg}`.slice(0, 500), stack: null, route: "edge:recordatorios", context: null } });
    } catch { /* sin registro */ }
    return json({ ok: false, error: msg });
  }
});
