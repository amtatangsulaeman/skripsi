import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson, HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { createUploadTarget, storageDriver } from "@/lib/docs/storage";

const schema = z.object({ name: z.string().min(1).max(300), size: z.number().int().nonnegative() });

// Step 1 of a direct upload: hands the browser a one-time signed URL into the private bucket.
// With local storage it answers { direct: false } and the client falls back to multipart.
export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => schema.parse(v));
  if (storageDriver() !== "supabase") return NextResponse.json({ direct: false });
  if (body.size === 0) throw new HttpError(400, "File kosong.");
  if (body.size > env.maxUploadBytes) throw new HttpError(413, `Ukuran file melebihi batas ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`);
  const ext = body.name.toLowerCase().split(".").pop() ?? "";
  if (!["docx", "pdf", "txt"].includes(ext)) throw new HttpError(415, "Format tidak didukung. Gunakan DOCX, PDF, atau TXT.");
  return NextResponse.json({ direct: true, ...(await createUploadTarget(ext)) });
});
