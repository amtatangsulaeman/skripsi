import { NextResponse } from "next/server";
import { withAuth, HttpError } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withAuth<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const r = await db.reviewReport.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, "Laporan review tidak ditemukan.");
  return NextResponse.json({ id: r.id, title: r.title, createdAt: r.createdAt, result: JSON.parse(r.data) });
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  await db.reviewReport.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
});
