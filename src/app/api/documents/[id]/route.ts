import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { deleteStoredFile } from "@/lib/docs/storage";

type P = { id: string };

async function getDoc(id: string) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");
  return doc;
}

export const GET = withAuth<P>(async (_req, { params }) => {
  const doc = await getDoc((await params).id);
  return NextResponse.json({ document: doc });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().nullable().optional(),
  content: z.string().max(2_000_000).optional(),
  versionNote: z.string().max(200).optional(),
});

export const PATCH = withAuth<P>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson(req, (v) => patchSchema.parse(v));
  const doc = await getDoc(id);

  if (body.folderId) {
    const exists = await db.folder.count({ where: { id: body.folderId } });
    if (!exists) throw new HttpError(400, "Folder tidak ditemukan.");
  }

  // Editing content snapshots the previous text first so nothing is ever lost.
  if (body.content !== undefined && body.content !== doc.content) {
    await db.documentVersion.create({
      data: { documentId: id, content: doc.content, note: body.versionNote ?? "Sebelum diedit" },
    });
  }

  const updated = await db.document.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.folderId !== undefined && { folderId: body.folderId }),
      ...(body.content !== undefined && { content: body.content }),
    },
    select: { id: true, title: true, folderId: true, updatedAt: true },
  });
  return NextResponse.json({ document: updated });
});

export const DELETE = withAuth<P>(async (_req, { params }) => {
  const doc = await getDoc((await params).id);
  await db.document.delete({ where: { id: doc.id } });
  await deleteStoredFile(doc.filePath);
  return NextResponse.json({ ok: true });
});
