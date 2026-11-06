import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, readJson } from "@/lib/api";
import { mentorTurn } from "@/lib/ai/research";

export const maxDuration = 60;

const bodySchema = z.object({
  field: z.string().trim().max(120).default(""),
  topic: z.string().trim().max(600).default(""),
  messages: z.array(z.object({ role: z.enum(["student", "mentor"]), text: z.string().max(6000) })).max(120).default([]),
  requestOutline: z.boolean().default(false),
});

export const POST = withAuth(async (req) => {
  const body = await readJson(req, (v) => bodySchema.parse(v));
  return NextResponse.json(await mentorTurn(body));
});
