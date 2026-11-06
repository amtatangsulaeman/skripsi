import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { loadStructured } from "@/lib/formatter/pipeline";
import { normalizeConfig } from "@/lib/formatter/profile";
import { outline, renderPreview } from "@/lib/formatter/preview";

export const maxDuration = 60;

const schema = z.object({ documentId: z.string().min(1), config: z.unknown() });

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => schema.parse(v));
  const config = normalizeConfig(body.config);
  const { structured } = await loadStructured(body.documentId, config);
  return NextResponse.json({
    pages: renderPreview(structured, config),
    outline: outline(structured, config),
    changes: structured.changes,
    warnings: structured.warnings,
    stats: structured.sourceStats,
    sourceKind: structured.sourceKind,
  });
});
