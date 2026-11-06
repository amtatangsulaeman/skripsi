import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { checkGrammar } from "@/lib/ai/service";

export const maxDuration = 120;

const bodySchema = z.object({
  text: z.string().min(1).max(20000),
  language: z.enum(["auto", "id", "en"]).default("auto"),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => bodySchema.parse(v));
  const result = await checkGrammar(body);
  if ((await getSettings()).saveHistory) {
    await db.paraphraseHistory.create({
      data: { feature: "grammar", originalText: body.text, paraphrasedText: result.corrected, mode: result.detectedLanguage },
    });
  }
  return NextResponse.json(result);
});
