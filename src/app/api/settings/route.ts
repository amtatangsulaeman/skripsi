import { NextResponse } from "next/server";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { saveSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/settings-schema";

export const PATCH = withAuth(async (req) => {
  const patch = await readJson(req, (v) => settingsSchema.partial().parse(v));
  const settings = await saveSettings(patch);
  const res = NextResponse.json({ settings });
  res.cookies.set("tm_theme", settings.theme, { httpOnly: false, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});

/** Clears stored AI history (paraphrase/rewrite/grammar). Documents are not touched. */
export const DELETE = withAuth(async (req) => {
  const what = req.nextUrl.searchParams.get("what");
  if (what === "history") {
    const { count } = await db.paraphraseHistory.deleteMany({});
    return NextResponse.json({ deleted: count });
  }
  if (what === "usage") {
    const { count } = await db.usageLog.deleteMany({});
    return NextResponse.json({ deleted: count });
  }
  return NextResponse.json({ error: "Parameter tidak valid." }, { status: 400 });
});
