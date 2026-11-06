// Edge Function "correo": proxy seguro a la API de correo de Hostinger (buzón del negocio).
// El token vive en el secreto HOSTINGER_MAIL_TOKEN; el navegador nunca lo ve. Solo usuarios logueados.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://api.mail.hostinger.com/api/v1";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

async function hostinger(token: string, method: string, path: string, body?: unknown, raw = false) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: raw ? "*/*" : "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) {
    if (!r.ok) throw new Error(`Hostinger ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(s), contentType: r.headers.get("content-type") ?? "application/octet-stream" };
  }
  if (r.status === 204) return { ok: true };
  const text = await r.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const e = data as { error?: string; code?: string };
    throw new Error(e.error ? `${e.error}${e.code ? ` (${e.code})` : ""}` : `Hostinger ${r.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

const enc = (s: string) => encodeURIComponent(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let action = "";
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await anon.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData.user) return json({ error: "No autorizado" }, 401);

    const token = Deno.env.get("HOSTINGER_MAIL_TOKEN");
    if (!token) return json({ ok: false, error: "Falta el secreto HOSTINGER_MAIL_TOKEN (token de la API de correo de Hostinger)." });

    const b = (await req.json()) as Record<string, unknown> & { action: string };
    action = b.action;

    // Buzón: el primero del token, o el indicado.
    const me = (await hostinger(token, "GET", "/me")) as { data: { mailboxes: { resourceId: string; address: string }[] } };
    const boxes = me.data.mailboxes;
    const box = boxes.find((m) => m.address === b.mailbox) ?? boxes[0];
    if (!box) throw new Error("El token no tiene ningún buzón asociado.");
    const base = `/mailboxes/${box.resourceId}`;
    const folder = enc(String(b.folder ?? "INBOX"));

    switch (action) {
      case "me":
        return json({ ok: true, mailboxes: boxes, mailbox: box.address });
      case "folders":
        return json({ ok: true, mailbox: box.address, ...(await hostinger(token, "GET", `${base}/folders`) as object) });
      case "list": {
        const page = Number(b.page ?? 1);
        const perPage = Number(b.perPage ?? 25);
        const q = b.query as Record<string, unknown> | undefined;
        const res = q && Object.keys(q).length
          ? await hostinger(token, "POST", `${base}/folders/${folder}/messages/search?page=${page}&perPage=${perPage}&sort=-uid`, q)
          : await hostinger(token, "GET", `${base}/folders/${folder}/messages?page=${page}&perPage=${perPage}&sort=-uid`);
        return json({ ok: true, mailbox: box.address, ...(res as object) });
      }
      case "get": {
        const uid = Number(b.uid);
        const [meta, text] = await Promise.all([
          hostinger(token, "GET", `${base}/folders/${folder}/messages/${uid}`),
          hostinger(token, "GET", `${base}/folders/${folder}/messages/${uid}/text`),
        ]);
        if (b.markRead !== false) {
          try { await hostinger(token, "PATCH", `${base}/folders/${folder}/messages/${uid}`, { addFlags: ["\\Seen"] }); } catch { /* no es crítico */ }
        }
        return json({ ok: true, message: (meta as { data: unknown }).data, body: (text as { data: unknown }).data });
      }
      case "attachment": {
        const r = await hostinger(token, "GET", `${base}/folders/${folder}/messages/${Number(b.uid)}/attachments/${enc(String(b.attachmentId))}`, undefined, true);
        return json({ ok: true, ...(r as object) });
      }
      case "send": {
        const payload: Record<string, unknown> = {
          to: b.to,
          cc: b.cc ?? undefined,
          bcc: b.bcc ?? undefined,
          subject: b.subject ?? "",
          text: b.text ?? undefined,
          html: b.html ?? undefined,
          displayName: b.displayName ?? undefined,
          attachments: b.attachments ?? undefined,
          inReplyTo: b.inReplyTo ?? undefined,
          forwardOf: b.forwardOf ?? undefined,
        };
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
        await hostinger(token, "POST", `${base}/send`, payload);
        return json({ ok: true });
      }
      case "flags": {
        await hostinger(token, "PATCH", `${base}/folders/${folder}/messages/${Number(b.uid)}`, { addFlags: b.addFlags ?? [], removeFlags: b.removeFlags ?? [] });
        return json({ ok: true });
      }
      case "move": {
        await hostinger(token, "POST", `${base}/folders/${folder}/messages/${Number(b.uid)}/move`, { targetFolder: String(b.targetFolder) });
        return json({ ok: true });
      }
      case "delete": {
        await hostinger(token, "DELETE", `${base}/folders/${folder}/messages/${Number(b.uid)}`);
        return json({ ok: true });
      }
      default:
        return json({ ok: false, error: "Acción desconocida" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await db.rpc("log_app_error", { p: { source: "red", message: `Correo: ${msg}`.slice(0, 500), stack: null, route: "edge:correo", context: { action } } });
    } catch { /* sin registro */ }
    return json({ ok: false, error: msg });
  }
});
