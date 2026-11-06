import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(1).max(100) });

export const POST = withAuth(async (req) => {
  const { name } = await readJson(req, (v) => schema.parse(v));
  const folder = await db.folder.create({ data: { name } });
  return NextResponse.json({ folder }, { status: 201 });
});
