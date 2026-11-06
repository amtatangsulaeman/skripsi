import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { analyzeSimilarity } from "@/lib/similarity/engine";

export const maxDuration = 60;

const schema = z.object({
  title: z.string().trim().max(200).default(""),
  /** Analyse a library document… */
  documentId: z.string().optional(),
  /** …or pasted text. */
  text: z.string().max(1_000_000).optional(),
  /** Compare against these documents; empty = all other documents in the library. */
  sourceIds: z.array(z.string()).max(500).default([]),
  /** Optional pasted comparison passage (two-text compare). */
  compareText: z.string().max(1_000_000).optional(),
  options: z
    .object({ minWords: z.number().int().min(5).max(50).default(8), excludeQuotes: z.boolean().default(true), excludeReferences: z.boolean().default(true) })
    .default({ minWords: 8, excludeQuotes: true, excludeReferences: true }),
  save: z.boolean().default(true),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => schema.parse(v));

  let target = body.text ?? "";
  let title = body.title;
  let documentId: string | null = null;
  if (body.documentId) {
    const doc = await db.document.findUnique({ where: { id: body.documentId }, select: { id: true, title: true, content: true } });
    if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");
    target = doc.content;
    title ||= doc.title;
    documentId = doc.id;
  }
  if (!target.trim()) throw new HttpError(400, "Teks yang dianalisis kosong.");

  const excludeIds = new Set([documentId].filter(Boolean) as string[]);
  // Formatted copies of the same document would trivially match 100%: exclude them.
  if (documentId) {
    const derived = await db.document.findMany({ where: { sourceId: documentId }, select: { id: true } });
    derived.forEach((d) => excludeIds.add(d.id));
  }

  const docs = await db.document.findMany({
    where: {
      ...(body.sourceIds.length ? { id: { in: body.sourceIds } } : {}),
      NOT: { id: { in: Array.from(excludeIds) } },
      content: { not: "" },
    },
    select: { id: true, title: true, content: true },
  });
  const sources = docs.map((d) => ({ id: d.id, title: d.title, text: d.content }));
  if (body.compareText?.trim()) sources.push({ id: "pasted", title: "Teks pembanding (ditempel)", text: body.compareText });
  if (!sources.length) {
    throw new HttpError(422, "Belum ada dokumen pembanding. Unggah dokumen lain ke My Documents atau tempel teks pembanding.");
  }

  const result = analyzeSimilarity(target, sources, body.options);
  const payload = { ...result, target, sourceCount: sources.length };

  let reportId: string | null = null;
  if (body.save) {
    const r = await db.similarityReport.create({
      data: {
        documentId,
        title: title || `Teks tempel (${result.totalWords} kata)`,
        similarityScore: result.score,
        matchedPassages: JSON.stringify(payload),
        analysisScope: "internal",
      },
    });
    reportId = r.id;
  }
  return NextResponse.json({ ...payload, reportId, analysisScope: "internal" });
});
