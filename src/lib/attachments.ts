// Archivos que se adjuntan en el chat del asistente: fotos, PDF, Excel (.xlsx), CSV y texto.
// Todo se prepara en el navegador: las fotos se achican, el Excel se pasa a texto.

export type Attachment = {
  id: string;
  nombre: string;
  tipo: "image" | "pdf" | "text";
  mediaType?: string | undefined;
  /** base64 sin el prefijo data: (imágenes y PDF). */
  data?: string | undefined;
  /** Contenido como texto (Excel, CSV, TXT). */
  texto?: string | undefined;
  /** Miniatura para mostrar en el chat (solo imágenes). */
  preview?: string | undefined;
  bytes: number;
};

export const ACCEPT =
  "image/*,.pdf,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv,.txt,text/plain";
export const MAX_FILES = 5;
const MAX_PDF = 8 * 1024 * 1024;
const MAX_TEXT = 60_000;

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

function readAs(file: Blob, how: "dataURL" | "text" | "buffer"): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("No se pudo leer el archivo."));
    fr.onload = () => resolve(fr.result as string | ArrayBuffer);
    if (how === "dataURL") fr.readAsDataURL(file);
    else if (how === "text") fr.readAsText(file);
    else fr.readAsArrayBuffer(file);
  });
}

/** Achica la foto (máx. 2000 px) y la pasa a JPEG: se lee igual de bien y pesa mucho menos. */
async function prepareImage(
  file: File,
): Promise<Pick<Attachment, "data" | "mediaType" | "preview" | "bytes">> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(
          new Error(
            `No pude abrir la foto "${file.name}". Si es HEIC (iPhone), mandala como JPG o como captura de pantalla.`,
          ),
        );
      i.src = url;
    });
    const max = 2000;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la foto.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const thumbScale = Math.min(1, 160 / Math.max(w, h));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(w * thumbScale));
    t.height = Math.max(1, Math.round(h * thumbScale));
    t.getContext("2d")?.drawImage(canvas, 0, 0, t.width, t.height);
    const data = dataUrl.split(",")[1] ?? "";
    return {
      data,
      mediaType: "image/jpeg",
      preview: t.toDataURL("image/jpeg", 0.7),
      bytes: Math.round(data.length * 0.75),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Lectura mínima de .xlsx (zip + XML), sin librerías ----------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error("El Excel parece dañado. Probá guardarlo de nuevo como .xlsx o CSV.");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, () => Promise<Uint8Array>>();
  for (let n = 0; n < count && dv.getUint32(off, true) === 0x02014b50; n++) {
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const comLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + comLen;
    files.set(name, async () => {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = u8.subarray(start, start + csize);
      return method === 0 ? raw : inflateRaw(raw);
    });
  }
  return files;
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Número de Excel → texto a la argentina (coma decimal), para que la IA lo lea igual que en papel. */
const arNum = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n)
    ? n.toLocaleString("es-AR", { maximumFractionDigits: 4, useGrouping: false })
    : raw;
};

async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const zip = await unzip(buf);
  const dec = new TextDecoder();
  const xml = async (path: string) => {
    const f = zip.get(path);
    return f ? new DOMParser().parseFromString(dec.decode(await f()), "application/xml") : null;
  };
  const shared: string[] = [];
  const ss = await xml("xl/sharedStrings.xml");
  ss?.querySelectorAll("si").forEach((si) => {
    shared.push([...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""));
  });
  const wb = await xml("xl/workbook.xml");
  const names = wb
    ? [...wb.getElementsByTagName("sheet")].map((s) => s.getAttribute("name") ?? "")
    : [];
  const sheets = [...zip.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/g)?.pop()) - Number(b.match(/\d+/g)?.pop()));
  const out: string[] = [];
  for (const [si, path] of sheets.entries()) {
    const doc = await xml(path);
    if (!doc) continue;
    const lines: string[] = [];
    for (const row of [...doc.getElementsByTagName("row")].slice(0, 600)) {
      const cells: string[] = [];
      for (const c of row.getElementsByTagName("c")) {
        const idx = colIndex(c.getAttribute("r") ?? "A");
        if (idx > 40) continue;
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr")
          val = [...c.getElementsByTagName("t")].map((x) => x.textContent ?? "").join("");
        else if (t === "str" || t === "b" || t === "e") val = v;
        else val = v ? arNum(v) : "";
        cells[idx] = val.replace(/[\t\n\r]+/g, " ").trim();
      }
      if (cells.some((x) => x)) lines.push(Array.from(cells, (x) => x ?? "").join("\t"));
    }
    if (lines.length)
      out.push(
        `Hoja "${names[si] ?? `Hoja ${si + 1}`}" (columnas separadas por tabulación):\n${lines.join("\n")}`,
      );
  }
  if (!out.length) throw new Error("El Excel no tiene datos para leer.");
  return out.join("\n\n");
}

/** Prepara un archivo para mandarlo al asistente. Tira un error con un mensaje claro si no se puede. */
export async function prepareAttachment(file: File): Promise<Attachment> {
  const id = Math.random().toString(36).slice(2);
  const e = ext(file.name);
  if (
    file.type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(e)
  ) {
    return { id, nombre: file.name, tipo: "image", ...(await prepareImage(file)) };
  }
  if (file.type === "application/pdf" || e === "pdf") {
    if (file.size > MAX_PDF)
      throw new Error(`"${file.name}" pesa más de 8 MB. Mandá solo las hojas con la lista.`);
    const data = String(await readAs(file, "dataURL")).split(",")[1] ?? "";
    return {
      id,
      nombre: file.name,
      tipo: "pdf",
      mediaType: "application/pdf",
      data,
      bytes: file.size,
    };
  }
  if (e === "xlsx") {
    const texto = (await xlsxToText((await readAs(file, "buffer")) as ArrayBuffer)).slice(
      0,
      MAX_TEXT,
    );
    return { id, nombre: file.name, tipo: "text", texto, bytes: texto.length };
  }
  if (e === "xls")
    throw new Error(
      `"${file.name}" es un Excel viejo (.xls). Abrilo y guardalo como .xlsx o CSV, o mandá una foto.`,
    );
  if (["csv", "txt", "tsv"].includes(e) || file.type.startsWith("text/")) {
    const texto = String(await readAs(file, "text")).slice(0, MAX_TEXT);
    return { id, nombre: file.name, tipo: "text", texto, bytes: texto.length };
  }
  throw new Error(
    `No puedo leer "${file.name}". Mandá una foto, un PDF, un Excel (.xlsx) o un CSV.`,
  );
}
