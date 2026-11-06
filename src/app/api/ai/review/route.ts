import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { runReviewPanel } from "@/lib/ai/research";
import { resolveSource, sourceSchema } from "@/lib/research/source";

// Three Gemini calls (two in parallel, then the chair). Long chapters can take a couple of minutes.
export const maxDuration = 300;

const bodySchema = sourceSchema.extend({
  field: z.string().trim().max(120).default(""),
  stage: z.enum(["proposal", "full"]).default("proposal"),
  researchType: z.enum(["auto", "quantitative", "qualitative", "mixed"]).default("auto"),
  focus: z.string().trim().max(600).default(""),
});

export const GET = withAuth(async () => {
  const reports = await db.reviewReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, decision: true, createdAt: true, documentId: true },
  });
  return NextResponse.json({ reports });
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => bodySchema.parse(v));
  const { text, title, documentId } = await resolveSource(body);
  const result = await runReviewPanel(text, { field: body.field, stage: body.stage, researchType: body.researchType, focus: body.focus });
  const saved = await db.reviewReport.create({
    data: { documentId, title: title.slice(0, 200), decision: result.synthesis.decision, data: JSON.stringify(result) },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ id: saved.id, createdAt: saved.createdAt, title, result });
});
