import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { rewriteSentence } from "@/lib/ai/service";
import { REWRITE_GOAL_VALUES } from "@/lib/options";

export const maxDuration = 120;

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  goals: z.array(z.enum(REWRITE_GOAL_VALUES)).min(1),
  language: z.enum(["auto", "id", "en"]).default("auto"),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => bodySchema.parse(v));
  const result = await rewriteSentence(body);
  if ((await getSettings()).saveHistory) {
    await db.paraphraseHistory.create({
      data: { feature: "rewrite", originalText: body.text, paraphrasedText: result.revised, mode: body.goals.join(",") },
    });
  }
  return NextResponse.json(result);
});
