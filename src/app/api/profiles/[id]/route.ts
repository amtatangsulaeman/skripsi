import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeConfig } from "@/lib/formatter/profile";

type P = { id: string };
const schema = z.object({ universityName: z.string().trim().min(1).max(200).optional(), configuration: z.unknown().optional() });

export const PATCH = withAuth<P>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson(req, (v) => schema.parse(v));
  if (!(await db.formattingProfile.count({ where: { id } }))) throw new HttpError(404, "Profil tidak ditemukan.");
  await db.formattingProfile.update({
    where: { id },
    data: {
      ...(body.universityName && { universityName: body.universityName }),
      ...(body.configuration !== undefined && { configuration: JSON.stringify(normalizeConfig(body.configuration)) }),
    },
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth<P>(async (_req, { params }) => {
  const { id } = await params;
  if (!(await db.formattingProfile.count({ where: { id } }))) throw new HttpError(404, "Profil tidak ditemukan.");
  await db.formattingProfile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
