import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";

/** Either a library document or pasted text. */
export const sourceSchema = z.object({
  documentId: z.string().min(1).optional(),
  text: z.string().max(400_000).optional(),
});

const htmlToText = (html: string) =>
  html
    .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function resolveSource(input: z.infer<typeof sourceSchema>): Promise<{ text: string; title: string; documentId: string | null }> {
  if (input.documentId) {
    const doc = await db.document.findUnique({ where: { id: input.documentId }, select: { id: true, title: true, content: true, kind: true } });
    if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");
    const text = doc.kind === "note" || /^\s*<[a-z]/i.test(doc.content) ? htmlToText(doc.content) : doc.content;
    if (!text.trim()) throw new HttpError(422, "Dokumen ini tidak memiliki teks yang terbaca (mungkin PDF hasil scan).");
    return { text, title: doc.title, documentId: doc.id };
  }
  const text = (input.text ?? "").trim();
  if (!text) throw new HttpError(400, "Pilih dokumen atau tempel teks terlebih dahulu.");
  return { text, title: text.split("\n")[0]!.slice(0, 80), documentId: null };
}
