// Edge Function "arca": conexión con los web services de ARCA (ex AFIP).
// - WSAA: firma el ticket de acceso con el certificado de cada CUIT (tabla arca_issuers + secreto ARCA_<EMISOR>_KEY).
// - wsfev1: último comprobante autorizado y solicitud de CAE.
// - ws_sr_constancia_inscripcion: consulta de padrón por CUIT.
// Los tokens se cachean en la tabla arca_tokens (duran 12 h). Solo responde a usuarios logueados.

import { createClient } from "npm:@supabase/supabase-js@2";
import * as pkijs from "npm:pkijs@3.2.4";
import * as asn1js from "npm:asn1js@3.0.5";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROD = (Deno.env.get("ARCA_ENV") ?? "prod") !== "homo";
const URLS = PROD
  ? {
      wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
      wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      padron: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
    }
  : {
      wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
      wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
      padron: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
    };

pkijs.setEngine("deno", new pkijs.CryptoEngine({ name: "deno", crypto: crypto as Crypto }));
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

type Issuer = { key: string; cuit: string; cert: string; pkey: string };
// deno-lint-ignore no-explicit-any
type Db = ReturnType<typeof createClient<any>>;

/** CUIT y certificado viven en la tabla arca_issuers; la clave privada, en el secreto ARCA_<EMISOR>_KEY. */
async function loadIssuer(db: Db, key: string): Promise<Issuer> {
  const K = key.toUpperCase();
  const pkey = Deno.env.get(`ARCA_${K}_KEY`);
  const { data } = await db.from("arca_issuers").select("cuit, cert").eq("key", key).maybeSingle();
  if (!data?.cuit || !data?.cert) throw new Error(`Falta cargar el CUIT y el certificado del emisor "${key}" (tabla arca_issuers).`);
  if (!pkey) throw new Error(`Falta el secreto ARCA_${K}_KEY (clave privada del emisor "${key}").`);
  return { key, cuit: String(data.cuit).replace(/\D/g, ""), cert: String(data.cert).replace(/\\n/g, "\n"), pkey: pkey.replace(/\\n/g, "\n") };
}

// ---------- utilidades ----------
const pemToDer = (pem: string) => {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
};
const b64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

/** Fecha/hora en Argentina (UTC-3) con offset, como la espera el WSAA. */
function arTime(d: Date) {
  const t = new Date(d.getTime() - 3 * 3600 * 1000);
  return t.toISOString().replace(/\.\d{3}Z$/, "") + "-03:00";
}
/** Fecha yyyymmdd en Argentina. */
function arDate(d = new Date()) {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

// ---------- WSAA ----------
async function signCms(issuer: Issuer, xml: string): Promise<string> {
  const certDer = pemToDer(issuer.cert);
  const cert = pkijs.Certificate.fromBER(certDer);
  const keyDer = pemToDer(issuer.pkey);
  const privateKey = await crypto.subtle.importKey("pkcs8", keyDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const content = new TextEncoder().encode(xml);
  const digest = await crypto.subtle.digest("SHA-256", content);

  const signed = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1", eContent: new asn1js.OctetString({ valueHex: content.buffer }) }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new pkijs.Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] }),
            new pkijs.Attribute({ type: "1.2.840.113549.1.9.5", values: [new asn1js.UTCTime({ valueDate: new Date() })] }),
            new pkijs.Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1js.OctetString({ valueHex: digest })] }),
          ],
        }),
      }),
    ],
    certificates: [cert],
  });
  await signed.sign(privateKey, 0, "SHA-256");
  const cms = new pkijs.ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signed.toSchema(true) });
  return b64(cms.toSchema().toBER(false));
}

async function soap(url: string, action: string, body: string) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: action }, body });
  const text = await r.text();
  if (!r.ok && !text.includes("<soap")) throw new Error(`ARCA respondió ${r.status}: ${text.slice(0, 300)}`);
  return parser.parse(text);
}

async function getTicket(db: Db, issuer: Issuer, service: string): Promise<{ token: string; sign: string }> {
  const { data: cached } = await db.from("arca_tokens").select("token, sign, expires_at").eq("issuer", issuer.key).eq("service", service).maybeSingle();
  if (cached && new Date(cached.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return { token: cached.token, sign: cached.sign };

  const now = new Date();
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${arTime(new Date(now.getTime() - 10 * 60000))}</generationTime><expirationTime>${arTime(new Date(now.getTime() + 10 * 60000))}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
  const cms = await signCms(issuer, tra);
  const env = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const res = await soap(URLS.wsaa, "", env);
  const fault = res?.Envelope?.Body?.Fault;
  if (fault) {
    const msg = String(fault.faultstring ?? "");
    if (/ya posee un TA valido/i.test(msg)) throw new Error("ARCA dice que ya hay un ticket vigente para este certificado; esperá unos minutos y volvé a intentar.");
    throw new Error(`WSAA: ${msg}`);
  }
  const xml = String(res?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn ?? "");
  const ta = parser.parse(xml);
  const token = ta?.loginTicketResponse?.credentials?.token;
  const sign = ta?.loginTicketResponse?.credentials?.sign;
  const exp = ta?.loginTicketResponse?.header?.expirationTime;
  if (!token || !sign) throw new Error("WSAA no devolvió credenciales.");
  await db.from("arca_tokens").upsert({ issuer: issuer.key, service, token, sign, expires_at: new Date(exp).toISOString() }, { onConflict: "issuer,service" });
  return { token, sign };
}

// ---------- WSFE ----------
const FE_NS = "http://ar.gov.afip.dif.FEV1/";
function feEnvelope(inner: string) {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${FE_NS}"><soap:Body>${inner}</soap:Body></soap:Envelope>`;
}
function feAuth(t: { token: string; sign: string }, cuit: string) {
  return `<ar:Auth><ar:Token>${t.token}</ar:Token><ar:Sign>${t.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
}
const errText = (errs: unknown) => {
  if (!errs) return "";
  const list = Array.isArray(errs) ? errs : [errs];
  return list.map((e) => `${(e as { Code?: string }).Code ?? ""}: ${(e as { Msg?: string }).Msg ?? ""}`).join(" · ");
};

async function ultimoAutorizado(db: Db, issuer: Issuer, ptoVta: number, cbteTipo: number) {
  const t = await getTicket(db, issuer, "wsfe");
  const res = await soap(URLS.wsfe, `${FE_NS}FECompUltimoAutorizado`, feEnvelope(`<ar:FECompUltimoAutorizado>${feAuth(t, issuer.cuit)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`));
  const r = res?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;
  const err = errText(r?.Errors?.Err);
  if (err) throw new Error(`ARCA: ${err}`);
  return Number(r?.CbteNro ?? 0);
}

type EmitirInput = {
  issuer: string;
  ptoVta: number;
  cbteTipo: number; // 1 A, 6 B, 11 C
  concepto?: number; // 1 productos, 2 servicios, 3 ambos
  docTipo: number; // 80 CUIT, 96 DNI, 99 consumidor final
  docNro: string;
  condicionIVAReceptor: number;
  fecha?: string; // yyyymmdd
  neto: number;
  iva: number; // importe de IVA (0 en C)
  alicuota?: number; // 21, 10.5, 27, 0
  exento?: number;
  noGravado?: number;
  total: number;
};

const ALIC_ID: Record<string, number> = { "0": 3, "10.5": 4, "21": 5, "27": 6, "5": 8, "2.5": 9 };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function emitir(db: Db, issuer: Issuer, inp: EmitirInput) {
  const t = await getTicket(db, issuer, "wsfe");
  const ultimo = await ultimoAutorizado(db, issuer, inp.ptoVta, inp.cbteTipo);
  const nro = ultimo + 1;
  const fecha = inp.fecha ?? arDate();
  const esC = inp.cbteTipo === 11;
  const neto = r2(inp.neto);
  const iva = esC ? 0 : r2(inp.iva);
  const exento = r2(inp.exento ?? 0);
  const noGravado = r2(inp.noGravado ?? 0);
  const total = r2(inp.total);
  const docNro = (inp.docNro || "0").replace(/\D/g, "") || "0";
  const ivaXml = esC || iva === 0 ? "" : `<ar:Iva><ar:AlicIva><ar:Id>${ALIC_ID[String(inp.alicuota ?? 21)] ?? 5}</ar:Id><ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp><ar:Importe>${iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`;
  const det = `<ar:FECAEDetRequest><ar:Concepto>${inp.concepto ?? 1}</ar:Concepto><ar:DocTipo>${inp.docTipo}</ar:DocTipo><ar:DocNro>${docNro}</ar:DocNro><ar:CbteDesde>${nro}</ar:CbteDesde><ar:CbteHasta>${nro}</ar:CbteHasta><ar:CbteFch>${fecha}</ar:CbteFch><ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>${noGravado.toFixed(2)}</ar:ImpTotConc><ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>${exento.toFixed(2)}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA><ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${inp.condicionIVAReceptor}</ar:CondicionIVAReceptorId>${ivaXml}</ar:FECAEDetRequest>`;
  const body = feEnvelope(`<ar:FECAESolicitar>${feAuth(t, issuer.cuit)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${inp.ptoVta}</ar:PtoVta><ar:CbteTipo>${inp.cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${det}</ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>`);
  const res = await soap(URLS.wsfe, `${FE_NS}FECAESolicitar`, body);
  const r = res?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;
  const gErr = errText(r?.Errors?.Err);
  if (gErr) throw new Error(`ARCA: ${gErr}`);
  const d = r?.FeDetResp?.FECAEDetResponse;
  const det0 = Array.isArray(d) ? d[0] : d;
  const obs = errText(det0?.Observaciones?.Obs);
  if (det0?.Resultado !== "A") throw new Error(`ARCA rechazó el comprobante${obs ? ": " + obs : ""}`);
  return { nro, cae: String(det0.CAE), caeVto: String(det0.CAEFchVto), fecha, obs, ptoVta: inp.ptoVta, cbteTipo: inp.cbteTipo, cuitEmisor: issuer.cuit };
}

// ---------- Padrón ----------
async function padron(db: Db, issuer: Issuer, cuit: string) {
  const t = await getTicket(db, issuer, "ws_sr_constancia_inscripcion");
  const id = cuit.replace(/\D/g, "");
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${t.token}</token><sign>${t.sign}</sign><cuitRepresentada>${issuer.cuit}</cuitRepresentada><idPersona>${id}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`;
  const res = await soap(URLS.padron, "", body);
  const fault = res?.Envelope?.Body?.Fault;
  if (fault) throw new Error(`Padrón: ${fault.faultstring ?? "error"}`);
  const p = res?.Envelope?.Body?.getPersona_v2Response?.personaReturn;
  const err = p?.errorConstancia?.error ?? p?.errorRegimenGeneral?.error ?? p?.errorMonotributo?.error;
  const dg = p?.datosGenerales;
  if (!dg) throw new Error(err ? String(Array.isArray(err) ? err[0] : err) : "ARCA no encontró ese CUIT.");
  const dom = dg.domicilioFiscal ?? {};
  const rg = p?.datosRegimenGeneral;
  const mono = p?.datosMonotributo;
  let condicion = "Consumidor final";
  if (rg) {
    const imps = rg.impuesto ? (Array.isArray(rg.impuesto) ? rg.impuesto : [rg.impuesto]) : [];
    const ivaImp = imps.find((i: { idImpuesto?: string }) => String(i.idImpuesto) === "30");
    condicion = ivaImp ? "Responsable inscripto" : /exent/i.test(JSON.stringify(imps)) ? "Exento" : "Responsable inscripto";
    if (imps.some((i: { idImpuesto?: string }) => String(i.idImpuesto) === "32")) condicion = "Exento";
  } else if (mono) condicion = "Monotributo";
  const nombre = dg.razonSocial ?? [dg.apellido, dg.nombre].filter(Boolean).join(", ");
  return {
    cuit: id,
    nombre: String(nombre ?? "").trim(),
    tipoPersona: dg.tipoPersona,
    condicionIva: condicion,
    domicilio: [dom.direccion, dom.localidad].filter(Boolean).join(", "),
    direccion: dom.direccion ?? "",
    localidad: dom.localidad ?? "",
    provincia: dom.descripcionProvincia ?? "",
    codPostal: dom.codPostal ?? "",
    estado: dg.estadoClave,
  };
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await anon.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData.user) return json({ error: "No autorizado" }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = (await req.json()) as { action: string; issuer?: string; [k: string]: unknown };
    const issuerKey = String(body.issuer ?? "ri");

    switch (body.action) {
      case "estado": {
        // Qué emisores están configurados (sin exponer secretos).
        const { data: rows } = await db.from("arca_issuers").select("key, cuit, cert");
        const out: Record<string, { cuit: string | null; configurado: boolean }> = {};
        for (const k of ["ri", "mono"]) {
          const row = (rows ?? []).find((r: { key: string }) => r.key === k);
          out[k] = { cuit: row?.cuit ?? null, configurado: !!(row?.cuit && row?.cert && Deno.env.get(`ARCA_${k.toUpperCase()}_KEY`)) };
        }
        return json({ ok: true, env: PROD ? "prod" : "homo", emisores: out });
      }
      case "ping": {
        const issuer = await loadIssuer(db, issuerKey);
        const t = await getTicket(db, issuer, "wsfe");
        const res = await soap(URLS.wsfe, `${FE_NS}FEDummy`, feEnvelope(`<ar:FEDummy/>`));
        return json({ ok: true, cuit: issuer.cuit, token: t.token.slice(0, 12) + "…", dummy: res?.Envelope?.Body?.FEDummyResponse?.FEDummyResult });
      }
      case "ultimo": {
        const issuer = await loadIssuer(db, issuerKey);
        const nro = await ultimoAutorizado(db, issuer, Number(body.ptoVta), Number(body.cbteTipo));
        return json({ ok: true, ultimo: nro });
      }
      case "emitir": {
        const issuer = await loadIssuer(db, issuerKey);
        const r = await emitir(db, issuer, body as unknown as EmitirInput);
        return json({ ok: true, ...r });
      }
      case "padron": {
        // Usa el primer emisor configurado.
        let issuer: Issuer | null = null;
        for (const k of [issuerKey, "ri", "mono"]) {
          try { issuer = await loadIssuer(db, k); break; } catch { /* probar el siguiente */ }
        }
        if (!issuer) throw new Error("No hay ningún CUIT configurado para consultar el padrón.");
        const p = await padron(db, issuer, String(body.cuit ?? ""));
        return json({ ok: true, ...p });
      }
      default:
        return json({ error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
