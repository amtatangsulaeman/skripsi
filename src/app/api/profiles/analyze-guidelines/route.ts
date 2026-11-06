import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { analyzeFormattingGuidelines } from "@/lib/ai/service";
import { extractText, sniffFileKind, type FileKind } from "@/lib/docs/extract";
import { readIncoming } from "@/lib/docs/service";
import { deleteStoredFile } from "@/lib/docs/storage";
import { normalizeConfig } from "@/lib/formatter/profile";
import { safeJsonParse } from "@/lib/utils";

export const maxDuration = 120;

// Guideline files are only read for analysis; they are not stored.
// Accepts multipart (local storage) or JSON { upload: { path, name }, base } after a direct upload.
export const POST = withAuth(async (req) => {
  let kind: FileKind | null;
  let text: string;
  let baseRaw: string;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "File pedoman tidak ditemukan.");
    if (file.size > env.maxUploadBytes) throw new HttpError(413, "File terlalu besar.");
    const buf = Buffer.from(await file.arrayBuffer());
    kind = sniffFileKind(buf, file.name);
    if (kind !== "pdf" && kind !== "docx") throw new HttpError(415, "Pedoman harus berupa PDF atau DOCX.");
    text = await extractText(buf, kind);
    baseRaw = String(form.get("base") ?? "{}");
  } else {
    const body = z.object({ upload: z.object({ path: z.string().max(200), name: z.string().max(300) }), base: z.string().max(200_000).default("{}") }).parse(await req.json());
    try {
      ({ kind, content: text } = await readIncoming(body.upload.path, body.upload.name));
    } finally {
      await deleteStoredFile(body.upload.path).catch(() => {});
    }
    if (kind !== "pdf" && kind !== "docx") throw new HttpError(415, "Pedoman harus berupa PDF atau DOCX.");
    baseRaw = body.base;
  }
  if (text.replace(/\s/g, "").length < 100) throw new HttpError(422, "Teks pedoman tidak terbaca (PDF hasil scan?).");
  const base = normalizeConfig(safeJsonParse(baseRaw, {}));
  return NextResponse.json(await analyzeFormattingGuidelines(text, base));
});
