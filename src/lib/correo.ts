// Cliente de la Edge Function "correo" (buzón del negocio en Hostinger).
import { supabase } from "./supabase";
import { reportError } from "./errors";

const env = import.meta.env as Record<string, string | undefined>;
const DEMO = env["VITE_DEMO"] === "1";

export type MailAddress = { name: string; address: string };
export type MailAttachment = {
  id: string;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
  filename: string | null;
  contentId: string | null;
};
export type MailMessage = {
  uid: number;
  path: string;
  date: string;
  flags: string[];
  unseen: boolean;
  size: number;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  messageId: string | null;
  inReplyTo: string | null;
  attachments: MailAttachment[];
};
export type MailFolder = {
  path: string;
  name?: string;
  specialUse?: string | null;
  unseen?: number;
  total?: number;
  [k: string]: unknown;
};
export type MailList = {
  data: MailMessage[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
};
export type SendAttachment = {
  filename: string;
  content: string;
  contentType?: string;
  encoding?: string;
};
export type SendInput = {
  to: string[];
  cc?: string[] | undefined;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
  attachments?: SendAttachment[] | undefined;
  inReplyTo?: { uid: number; folder: string } | undefined;
  forwardOf?: { uid: number; folder: string } | undefined;
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { ok?: boolean; error?: string }>(
    "correo",
    { body },
  );
  if (error) {
    reportError("red", new Error(error.message), { fn: "correo", action: body["action"] });
    throw new Error(error.message);
  }
  if (!data) throw new Error("Sin respuesta del correo.");
  if (data.ok === false || data.error) throw new Error(data.error ?? "Error de correo");
  return data;
}

const demoMessages: MailMessage[] = [
  {
    uid: 3,
    path: "INBOX",
    date: new Date().toISOString(),
    flags: [],
    unseen: true,
    size: 2200,
    subject: "Consulta por piedra blanca",
    from: { name: "Juan Pérez", address: "juan@example.com" },
    to: [{ name: "", address: "administracion@aridospetreos.com" }],
    cc: [],
    bcc: [],
    messageId: "<a@x>",
    inReplyTo: null,
    attachments: [],
  },
  {
    uid: 2,
    path: "INBOX",
    date: new Date(Date.now() - 86400000).toISOString(),
    flags: ["\\Seen"],
    unseen: false,
    size: 5200,
    subject: "Factura de proveedor",
    from: { name: "Canteras del Sur", address: "ventas@canteras.example" },
    to: [{ name: "", address: "administracion@aridospetreos.com" }],
    cc: [],
    bcc: [],
    messageId: "<b@x>",
    inReplyTo: null,
    attachments: [
      {
        id: "att1",
        contentType: "application/pdf",
        sizeBytes: 48000,
        inline: false,
        filename: "factura-0001.pdf",
        contentId: null,
      },
    ],
  },
];

export async function mailFolders(): Promise<{ mailbox: string; folders: MailFolder[] }> {
  if (DEMO)
    return {
      mailbox: "administracion@aridospetreos.com",
      folders: [
        { path: "INBOX", name: "Recibidos", unseen: 1 },
        { path: "INBOX.Sent", name: "Enviados" },
        { path: "INBOX.Drafts", name: "Borradores" },
        { path: "INBOX.Trash", name: "Papelera" },
      ],
    };
  const r = await call<{ mailbox: string; data: MailFolder[] }>({ action: "folders" });
  return { mailbox: r.mailbox, folders: r.data ?? [] };
}

export async function mailList(
  folder: string,
  page = 1,
  query?: Record<string, unknown>,
): Promise<MailList> {
  if (DEMO)
    return {
      data: folder === "INBOX" ? demoMessages : [],
      pagination: { page: 1, perPage: 25, total: folder === "INBOX" ? 2 : 0, totalPages: 1 },
    };
  return call<MailList>({ action: "list", folder, page, perPage: 25, query });
}

export async function mailGet(
  folder: string,
  uid: number,
): Promise<{ message: MailMessage; body: { text: string; html: string } }> {
  if (DEMO) {
    const m = demoMessages.find((x) => x.uid === uid) ?? demoMessages[0]!;
    return {
      message: m,
      body: {
        text: "Hola, quería saber el precio por tonelada de la piedra blanca y si hacen envío a Pehuajó.\n\nGracias.",
        html: "",
      },
    };
  }
  return call({ action: "get", folder, uid });
}

export async function mailAttachment(
  folder: string,
  uid: number,
  attachmentId: string,
): Promise<{ base64: string; contentType: string }> {
  return call({ action: "attachment", folder, uid, attachmentId });
}

export async function mailSend(input: SendInput): Promise<void> {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  await call({ action: "send", ...input });
}

export async function mailFlags(
  folder: string,
  uid: number,
  addFlags: string[],
  removeFlags: string[] = [],
): Promise<void> {
  if (DEMO) return;
  await call({ action: "flags", folder, uid, addFlags, removeFlags });
}

export async function mailMove(folder: string, uid: number, targetFolder: string): Promise<void> {
  if (DEMO) return;
  await call({ action: "move", folder, uid, targetFolder });
}

export async function mailDelete(folder: string, uid: number): Promise<void> {
  if (DEMO) return;
  await call({ action: "delete", folder, uid });
}

/** Lee un archivo del navegador como base64 para adjuntarlo. */
export function fileToAttachment(file: File): Promise<SendAttachment> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
    fr.onload = () =>
      resolve({
        filename: file.name,
        content: String(fr.result).split(",")[1] ?? "",
        contentType: file.type || "application/octet-stream",
        encoding: "base64",
      });
    fr.readAsDataURL(file);
  });
}

export const folderLabel = (f: MailFolder) => {
  const p = f.path.toUpperCase();
  if (p === "INBOX") return "Recibidos";
  if (/SENT|ENVIADOS/.test(p)) return "Enviados";
  if (/DRAFT|BORRADOR/.test(p)) return "Borradores";
  if (/TRASH|DELETED|PAPELERA/.test(p)) return "Papelera";
  if (/JUNK|SPAM/.test(p)) return "Spam";
  if (/ARCHIVE/.test(p)) return "Archivo";
  return f.name ?? f.path.replace(/^INBOX\./, "");
};

export const fmtAddr = (a: MailAddress | null | undefined) =>
  a ? (a.name ? `${a.name} <${a.address}>` : a.address) : "";
export const shortAddr = (a: MailAddress | null | undefined) => (a ? a.name || a.address : "");
