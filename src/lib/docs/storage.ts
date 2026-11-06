import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { MIME, type FileKind } from "./extract";

// Two drivers behind one API:
// - "supabase": a PRIVATE Supabase Storage bucket, reached only with the service-role key on the server (Vercel).
// - "local":    files under STORAGE_DIR (self-hosted / development without Supabase).
// Stored paths are always relative ("uploads/<uuid>.pdf"), so the DB is the same for both.

export type StorageDriver = "supabase" | "local";

export function storageDriver(): StorageDriver {
  return env.supabaseUrl && env.supabaseServiceKey ? "supabase" : "local";
}

function safeExt(ext: string) {
  return ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5);
}

function contentType(ext: string) {
  return MIME[ext as FileKind] ?? "application/octet-stream";
}

// ── Supabase ─────────────────────────────────────────────────────

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function supabase(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Create the private bucket on first use if it does not exist yet. */
async function bucket() {
  const sb = supabase();
  bucketReady ??= (async () => {
    const { data } = await sb.storage.getBucket(env.supabaseBucket);
    if (data) {
      if (data.public) throw new Error(`Bucket "${env.supabaseBucket}" bersifat publik. Ubah menjadi private di Supabase.`);
      return;
    }
    const { error } = await sb.storage.createBucket(env.supabaseBucket, { public: false, fileSizeLimit: env.maxUploadBytes });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Gagal membuat bucket: ${error.message}`);
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  await bucketReady;
  return sb.storage.from(env.supabaseBucket);
}

// ── Local ────────────────────────────────────────────────────────

/** Resolve a stored relative path and guarantee it stays inside STORAGE_DIR (no traversal). */
export function resolveStoragePath(relative: string): string {
  const root = env.storageDir;
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Path di luar direktori penyimpanan.");
  return full;
}

// ── Public API ───────────────────────────────────────────────────

export async function saveFile(data: Buffer, ext: string, folder = "uploads"): Promise<string> {
  const e = safeExt(ext);
  const rel = path.posix.join(folder, `${randomUUID()}.${e}`);
  if (storageDriver() === "supabase") {
    const { error } = await (await bucket()).upload(rel, data, { contentType: contentType(e), upsert: false });
    if (error) throw new Error(`Gagal menyimpan file: ${error.message}`);
    return rel;
  }
  const full = resolveStoragePath(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: "wx" });
  return rel;
}

export async function readStoredFile(relative: string): Promise<Buffer> {
  if (storageDriver() === "supabase") {
    const { data, error } = await (await bucket()).download(relative);
    if (error || !data) throw new Error(`Gagal membaca file: ${error?.message ?? "tidak ditemukan"}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(resolveStoragePath(relative));
}

export async function deleteStoredFile(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  if (storageDriver() === "supabase") {
    const { error } = await (await bucket()).remove([relative]);
    if (error) throw new Error(`Gagal menghapus file: ${error.message}`);
    return;
  }
  try {
    await fs.unlink(resolveStoragePath(relative));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

// ── Direct browser uploads (Supabase only) ───────────────────────
// Vercel limits request bodies to 4.5 MB, so the browser uploads straight to the private bucket
// through a one-time signed URL. The file lands in "incoming/" and is only accepted after the
// server has re-checked its size and bytes (claimIncoming).

const INCOMING = /^incoming\/[0-9a-f-]{36}\.(docx|pdf|txt)$/;

export function isIncomingPath(p: string): boolean {
  return INCOMING.test(p);
}

export async function createUploadTarget(ext: string): Promise<{ path: string; signedUrl: string }> {
  const rel = `incoming/${randomUUID()}.${safeExt(ext)}`;
  const { data, error } = await (await bucket()).createSignedUploadUrl(rel);
  if (error || !data) throw new Error(`Gagal menyiapkan unggahan: ${error?.message ?? "tanpa respons"}`);
  return { path: rel, signedUrl: data.signedUrl };
}

/** Move a verified incoming upload to its permanent folder and return the new path. */
export async function claimIncoming(incoming: string, ext: string, folder = "uploads"): Promise<string> {
  if (!isIncomingPath(incoming)) throw new Error("Path unggahan tidak valid.");
  const rel = path.posix.join(folder, `${randomUUID()}.${safeExt(ext)}`);
  const { error } = await (await bucket()).move(incoming, rel);
  if (error) throw new Error(`Gagal memindahkan file: ${error.message}`);
  return rel;
}

/** Short-lived signed link for downloads, so large files don't pass through a serverless function. */
export async function signedDownloadUrl(relative: string, opts: { filename: string; inline: boolean }): Promise<string> {
  const { data, error } = await (await bucket()).createSignedUrl(relative, 60, opts.inline ? undefined : { download: opts.filename });
  if (error || !data) throw new Error(`Gagal membuat tautan unduhan: ${error?.message ?? "tanpa respons"}`);
  return data.signedUrl;
}

/** Count and size of stored files (local driver only; Supabase totals come from the database). */
export async function storageUsage(): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  async function walk(dir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name !== ".gitkeep") {
        files++;
        bytes += (await fs.stat(p)).size;
      }
    }
  }
  await walk(env.storageDir);
  return { files, bytes };
}
