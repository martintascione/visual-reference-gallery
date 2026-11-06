// Cliente de la Edge Function "arca": padrón, numeración y emisión con CAE.
// En modo DEMO (VITE_DEMO=1) simula las respuestas sin tocar ARCA.

import { supabase, toRow, fromRow } from "./supabase";
import { uid } from "./format";

const env = import.meta.env as Record<string, string | undefined>;
const DEMO = env["VITE_DEMO"] === "1";

export type IssuerKey = "ri" | "mono";

export type PadronResult = {
  cuit: string;
  nombre: string;
  tipoPersona?: string;
  condicionIva: string; // "Responsable inscripto" | "Monotributo" | "Exento" | "Consumidor final"
  domicilio: string;
  direccion: string;
  localidad: string;
  provincia: string;
  codPostal: string;
  estado?: string;
};

export type InvoiceItem = { desc: string; qty: number; unit: string; price: number };

export type Invoice = {
  id: string;
  createdAt?: string | undefined;
  issuer: IssuerKey;
  cuitEmisor: string;
  ptoVta: number;
  cbteTipo: number; // 1 A · 6 B · 11 C
  cbteNro: number;
  cae: string;
  caeVto: string; // yyyymmdd
  fecha: string; // yyyy-mm-dd
  docTipo: number; // 80 CUIT · 96 DNI · 99 consumidor final
  docNro: string;
  clientId?: string | undefined;
  clientName: string;
  clientAddress?: string | undefined;
  clientIva?: string | undefined;
  condicionIvaReceptor: number;
  concepto: number;
  items: InvoiceItem[];
  neto: number;
  iva: number;
  total: number;
  note?: string | undefined;
  saleId?: string | undefined;
  quoteId?: string | undefined;
  status: string;
};

export const cbteLetter = (t: number) =>
  t === 1 ? "A" : t === 6 ? "B" : t === 11 ? "C" : String(t);
export const cbteName = (t: number) => `Factura ${cbteLetter(t)}`;

/** Código de condición de IVA del receptor que pide ARCA (RG 5616). */
export function condicionIvaCode(label: string | undefined): number {
  switch ((label ?? "").toLowerCase()) {
    case "responsable inscripto":
      return 1;
    case "exento":
      return 4;
    case "monotributo":
      return 6;
    default:
      return 5; // consumidor final
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { ok?: boolean; error?: string }>(
    "arca",
    { body },
  );
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = (await ctx.clone().json()) as { error?: string };
        if (j.error) detail = j.error;
      }
    } catch {
      /* sin detalle */
    }
    throw new Error(detail);
  }
  if (!data) throw new Error("ARCA no respondió.");
  if (data.ok === false || data.error) throw new Error(data.error ?? "Error de ARCA");
  return data;
}

export type ArcaEstado = {
  env: string;
  emisores: Record<string, { cuit: string | null; configurado: boolean }>;
};

export async function arcaEstado(): Promise<ArcaEstado> {
  if (DEMO)
    return {
      env: "demo",
      emisores: {
        ri: { cuit: "20148499153", configurado: true },
        mono: { cuit: null, configurado: false },
      },
    };
  return call<ArcaEstado>({ action: "estado" });
}

export async function padronLookup(cuit: string): Promise<PadronResult> {
  const id = cuit.replace(/\D/g, "");
  if (id.length !== 11) throw new Error("El CUIT tiene que tener 11 números.");
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 400));
    return {
      cuit: id,
      nombre: "CLIENTE DE PRUEBA S.R.L.",
      condicionIva: "Responsable inscripto",
      domicilio: "Av. Siempre Viva 742, TRENQUE LAUQUEN",
      direccion: "Av. Siempre Viva 742",
      localidad: "TRENQUE LAUQUEN",
      provincia: "BUENOS AIRES",
      codPostal: "6400",
      estado: "ACTIVO",
    };
  }
  return call<PadronResult>({ action: "padron", cuit: id });
}

export async function ultimoAutorizado(
  issuer: IssuerKey,
  ptoVta: number,
  cbteTipo: number,
): Promise<number> {
  if (DEMO) return 41;
  const r = await call<{ ultimo: number }>({ action: "ultimo", issuer, ptoVta, cbteTipo });
  return r.ultimo;
}

export type EmitirDraft = Omit<
  Invoice,
  "id" | "cbteNro" | "cae" | "caeVto" | "cuitEmisor" | "status" | "createdAt"
> & { alicuota?: number };

/** Pide el CAE a ARCA y guarda la factura en la base. */
export async function emitirFactura(draft: EmitirDraft): Promise<Invoice> {
  let r: { nro: number; cae: string; caeVto: string; cuitEmisor: string; fecha: string };
  if (DEMO) {
    await new Promise((res) => setTimeout(res, 800));
    r = {
      nro: 42,
      cae: "7" + String(Date.now()).slice(-13),
      caeVto: draft.fecha.replace(/-/g, ""),
      cuitEmisor: "20148499153",
      fecha: draft.fecha.replace(/-/g, ""),
    };
  } else {
    r = await call({
      action: "emitir",
      issuer: draft.issuer,
      ptoVta: draft.ptoVta,
      cbteTipo: draft.cbteTipo,
      concepto: draft.concepto,
      docTipo: draft.docTipo,
      docNro: draft.docNro,
      condicionIVAReceptor: draft.condicionIvaReceptor,
      fecha: draft.fecha.replace(/-/g, ""),
      neto: draft.neto,
      iva: draft.iva,
      alicuota: draft.alicuota ?? 21,
      total: draft.total,
    });
  }
  const { alicuota: _a, ...rest } = draft;
  void _a;
  const inv: Invoice = {
    ...rest,
    id: uid(),
    cbteNro: r.nro,
    cae: r.cae,
    caeVto: r.caeVto,
    cuitEmisor: r.cuitEmisor,
    status: "emitida",
  };
  if (!DEMO) {
    const { error } = await supabase
      .from("invoices")
      .insert(toRow(inv as unknown as Record<string, unknown>));
    if (error) console.error("No se pudo guardar la factura:", error.message);
  }
  return inv;
}

export async function loadInvoices(limit = 200): Promise<Invoice[]> {
  if (DEMO) return [];
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => fromRow<Invoice>(row as Record<string, unknown>));
}

/** URL del QR obligatorio (RG 4892). */
export function invoiceQrUrl(inv: Invoice) {
  const payload = {
    ver: 1,
    fecha: inv.fecha,
    cuit: Number(inv.cuitEmisor),
    ptoVta: inv.ptoVta,
    tipoCmp: inv.cbteTipo,
    nroCmp: inv.cbteNro,
    importe: Math.round(inv.total * 100) / 100,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: inv.docTipo,
    nroDocRec: Number(inv.docNro.replace(/\D/g, "") || "0"),
    tipoCodAut: "E",
    codAut: Number(inv.cae),
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}
