import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { ingestIncoming, ingestUpload } from "@/lib/docs/service";

export const maxDuration = 60;

export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const folder = sp.get("folder");
  const docs = await db.document.findMany({
    where: {
      ...(folder === "none" ? { folderId: null } : folder ? { folderId: folder } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, fileType: true, kind: true, sizeBytes: true, folderId: true, updatedAt: true, createdAt: true },
  });
  return NextResponse.json({ documents: docs });
});

const noteSchema = z.object({ title: z.string().trim().min(1).max(200), content: z.string().max(500_000).default(""), folderId: z.string().nullish() });
const uploadSchema = z.object({ upload: z.object({ path: z.string().min(1).max(200), name: z.string().min(1).max(300) }), folderId: z.string().nullish() });

export const POST = withAuth(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "File tidak ditemukan.");
    const folderId = form.get("folderId");
    const doc = await ingestUpload(file, { folderId: typeof folderId === "string" ? folderId : null });
    return NextResponse.json({ document: { id: doc.id, title: doc.title, fileType: doc.fileType, content: doc.content } }, { status: 201 });
  }
  const json: unknown = await req.json();
  // Step 2 of a direct upload: the browser already put the file in storage (see /api/uploads).
  const up = uploadSchema.safeParse(json);
  if (up.success) {
    const doc = await ingestIncoming(up.data.upload.path, up.data.upload.name, { folderId: up.data.folderId ?? null });
    return NextResponse.json({ document: { id: doc.id, title: doc.title, fileType: doc.fileType, content: doc.content } }, { status: 201 });
  }
  const body = noteSchema.parse(json);
  const doc = await db.document.create({
    data: { title: body.title, content: body.content, fileType: "txt", kind: "note", folderId: body.folderId ?? null },
  });
  return NextResponse.json({ document: { id: doc.id } }, { status: 201 });
});
