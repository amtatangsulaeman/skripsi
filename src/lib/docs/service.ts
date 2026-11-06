import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/api";
import { extractText, sniffFileKind, type FileKind } from "./extract";
import { claimIncoming, deleteStoredFile, isIncomingPath, readStoredFile, saveFile } from "./storage";

const tooLarge = () => new HttpError(413, `Ukuran file melebihi batas ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`);

/** Validate bytes + extract text. Shared by multipart uploads and direct (signed URL) uploads. */
async function inspect(buf: Buffer, name: string): Promise<{ kind: FileKind; content: string }> {
  if (buf.length === 0) throw new HttpError(400, "File kosong.");
  if (buf.length > env.maxUploadBytes) throw tooLarge();
  const kind = sniffFileKind(buf, name);
  if (!kind) throw new HttpError(415, "Format tidak didukung. Gunakan DOCX, PDF, atau TXT (isi file harus sesuai ekstensinya).");

  let content = "";
  try {
    content = await extractText(buf, kind);
  } catch (e) {
    console.error("[extract]", e);
    throw new HttpError(422, "Gagal membaca isi file. Pastikan file tidak rusak atau terkunci kata sandi.");
  }
  if (kind === "pdf" && content.replace(/\s/g, "").length < 20) content = "";
  return { kind, content };
}

async function createDocument(name: string, kind: FileKind, content: string, sizeBytes: number, filePath: string, folderId?: string | null) {
  const folder = folderId ? ((await db.folder.count({ where: { id: folderId } })) ? folderId : null) : null;
  const title = name.replace(/\.(docx|pdf|txt)$/i, "").slice(0, 200) || "Dokumen";
  return db.document.create({ data: { title, filePath, fileType: kind, content, sizeBytes, folderId: folder } });
}

/** Validate, store privately and index a file sent as multipart form data. */
export async function ingestUpload(file: File, opts: { folderId?: string | null } = {}) {
  if (file.size > env.maxUploadBytes) throw tooLarge();
  const buf = Buffer.from(await file.arrayBuffer());
  const { kind, content } = await inspect(buf, file.name);
  const filePath = await saveFile(buf, kind);
  return createDocument(file.name, kind, content, buf.length, filePath, opts.folderId);
}

/** Read a browser upload from the incoming area. Invalid files are deleted before the error is thrown. */
export async function readIncoming(incomingPath: string, name: string): Promise<{ buf: Buffer; kind: FileKind; content: string }> {
  if (!isIncomingPath(incomingPath)) throw new HttpError(400, "Referensi unggahan tidak valid.");
  let buf: Buffer;
  try {
    buf = await readStoredFile(incomingPath);
  } catch {
    throw new HttpError(404, "File unggahan tidak ditemukan. Coba unggah ulang.");
  }
  try {
    return { buf, ...(await inspect(buf, name)) };
  } catch (e) {
    await deleteStoredFile(incomingPath).catch(() => {});
    throw e;
  }
}

/** Accept a file the browser uploaded directly to storage (see createUploadTarget). */
export async function ingestIncoming(incomingPath: string, name: string, opts: { folderId?: string | null } = {}) {
  const { buf, kind, content } = await readIncoming(incomingPath, name);
  const filePath = await claimIncoming(incomingPath, kind);
  return createDocument(name, kind, content, buf.length, filePath, opts.folderId);
}
