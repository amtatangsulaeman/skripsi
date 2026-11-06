import { NextResponse } from "next/server";
import { withAuth, readJson } from "@/lib/api";
import { checkWriting } from "@/lib/writing/check";
import { resolveSource, sourceSchema } from "@/lib/research/source";

// Deterministic (no AI): works even when the Gemini quota is exhausted.
export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => sourceSchema.parse(v));
  const { text, title } = await resolveSource(body);
  return NextResponse.json({ title, report: checkWriting(text) });
});
