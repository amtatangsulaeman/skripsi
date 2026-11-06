import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson, HttpError } from "@/lib/api";
import { db } from "@/lib/db";

type P = { id: string };
const schema = z.object({ name: z.string().trim().min(1).max(100) });

export const PATCH = withAuth<P>(async (req, { params }) => {
  const { id } = await params;
  const { name } = await readJson(req, (v) => schema.parse(v));
  if (!(await db.folder.count({ where: { id } }))) throw new HttpError(404, "Folder tidak ditemukan.");
  return NextResponse.json({ folder: await db.folder.update({ where: { id }, data: { name } }) });
});

// Deleting a folder never deletes its documents: they move back to "Tanpa folder".
export const DELETE = withAuth<P>(async (_req, { params }) => {
  const { id } = await params;
  if (!(await db.folder.count({ where: { id } }))) throw new HttpError(404, "Folder tidak ditemukan.");
  await db.$transaction([db.document.updateMany({ where: { folderId: id }, data: { folderId: null } }), db.folder.delete({ where: { id } })]);
  return NextResponse.json({ ok: true });
});
