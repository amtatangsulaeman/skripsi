import { NextResponse } from "next/server";
import { withAuth, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { analyzeDocument } from "@/lib/ai/service";

export const maxDuration = 120;

export const POST = withAuth<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id }, select: { content: true } });
  if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");
  if (!doc.content.trim()) throw new HttpError(422, "Dokumen tidak memiliki teks yang bisa dianalisis (PDF hasil scan?).");
  return NextResponse.json(await analyzeDocument(doc.content));
});
