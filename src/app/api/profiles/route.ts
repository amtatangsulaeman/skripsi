import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureBuiltinProfiles } from "@/lib/formatter/pipeline";
import { normalizeConfig } from "@/lib/formatter/profile";
import { safeJsonParse } from "@/lib/utils";

export const GET = withAuth(async () => {
  await ensureBuiltinProfiles();
  const rows = await db.formattingProfile.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    profiles: rows.map((p) => ({ id: p.id, universityName: p.universityName, configuration: normalizeConfig(safeJsonParse(p.configuration, {})), updatedAt: p.updatedAt })),
  });
});

const schema = z.object({ universityName: z.string().trim().min(1).max(200), configuration: z.unknown() });

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => schema.parse(v));
  const p = await db.formattingProfile.create({
    data: { universityName: body.universityName, configuration: JSON.stringify(normalizeConfig(body.configuration)) },
  });
  return NextResponse.json({ profile: { id: p.id } }, { status: 201 });
});
