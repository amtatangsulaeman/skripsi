import { withAuth, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { readStoredFile, signedDownloadUrl, storageDriver } from "@/lib/docs/storage";
import { MIME, type FileKind } from "@/lib/docs/extract";

// Authenticated file delivery. Files live outside /public and are only reachable through here.
export const GET = withAuth<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id }, select: { title: true, filePath: true, fileType: true, content: true } });
  if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const kind = doc.fileType as FileKind;
  const ext = doc.filePath ? kind : "txt";
  const filename = `${doc.title.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120) || "dokumen"}.${ext}`;

  // Supabase: redirect to a 60-second signed link (Vercel caps function responses at 4.5 MB).
  if (doc.filePath && storageDriver() === "supabase") {
    const url = await signedDownloadUrl(doc.filePath, { filename, inline: inline && kind === "pdf" });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  }

  const body = doc.filePath ? await readStoredFile(doc.filePath) : Buffer.from(doc.content, "utf8");

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[ext as FileKind] ?? "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline && kind === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
