import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/docs/storage";
import { buildDocx, verifyPreservation } from "@/lib/formatter/build";
import { loadStructured } from "@/lib/formatter/pipeline";
import { normalizeConfig } from "@/lib/formatter/profile";

export const maxDuration = 120;

const schema = z.object({
  documentId: z.string().min(1),
  config: z.unknown(),
  profileName: z.string().max(200).optional(),
  acknowledgeProblems: z.boolean().default(false),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => schema.parse(v));
  const config = normalizeConfig(body.config);
  const { doc, structured } = await loadStructured(body.documentId, config);

  const { buffer, emitted, unsupportedImages } = await buildDocx(structured, config, { title: doc.title });
  const problems = verifyPreservation(structured.sourceStats, emitted, structured, unsupportedImages);
  if (problems.length && !body.acknowledgeProblems) {
    return NextResponse.json({ error: "Pemeriksaan keutuhan konten menemukan masalah.", problems }, { status: 409 });
  }

  // The original is never modified: the result is stored as a new document linked to its source.
  const filePath = await saveFile(buffer, "docx", "formatted");
  const out = await db.document.create({
    data: {
      title: `${doc.title} — terformat${body.profileName ? ` (${body.profileName.slice(0, 60)})` : ""}`.slice(0, 200),
      filePath,
      fileType: "docx",
      kind: "formatted",
      sourceId: doc.id,
      folderId: doc.folderId,
      content: doc.content,
      sizeBytes: buffer.length,
    },
  });
  return NextResponse.json({ document: { id: out.id, title: out.title }, problems, emitted, source: structured.sourceStats });
});
