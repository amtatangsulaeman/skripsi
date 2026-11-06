import { NextResponse } from "next/server";
import { withAuth, HttpError } from "@/lib/api";
import { db } from "@/lib/db";

export const DELETE = withAuth<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  if (!(await db.similarityReport.count({ where: { id } }))) throw new HttpError(404, "Laporan tidak ditemukan.");
  await db.similarityReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
