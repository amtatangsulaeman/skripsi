import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { paraphraseText } from "@/lib/ai/service";
import { INTENSITY_VALUES, PARAPHRASE_MODE_VALUES, PRESERVE_KEYS } from "@/lib/options";

export const maxDuration = 120;

const bodySchema = z.object({
  text: z.string().min(1).max(20000),
  mode: z.enum(PARAPHRASE_MODE_VALUES),
  intensity: z.enum(INTENSITY_VALUES),
  preserve: z.array(z.enum(PRESERVE_KEYS)).default([]),
  language: z.enum(["auto", "id", "en"]).default("auto"),
  documentId: z.string().optional(),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => bodySchema.parse(v));
  const result = await paraphraseText({ ...body, preserve: Array.from(new Set(["meaning" as const, ...body.preserve])) });

  const settings = await getSettings();
  let historyId: string | null = null;
  if (settings.saveHistory) {
    const docExists = body.documentId ? await db.document.count({ where: { id: body.documentId } }) : 0;
    const h = await db.paraphraseHistory.create({
      data: {
        feature: "paraphrase",
        originalText: body.text,
        paraphrasedText: result.paraphrased,
        mode: `${body.mode}/${body.intensity}`,
        documentId: docExists ? body.documentId : null,
      },
    });
    historyId = h.id;
  }
  return NextResponse.json({ ...result, historyId });
});
