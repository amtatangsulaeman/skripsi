import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getActiveModel } from "@/lib/settings";
import { AiError } from "./errors";
import { assertQuotaAvailable, orderCandidates, runWithFailover } from "./failover";

const clients = new Map<number, GoogleGenAI>();

function getClient(keyIndex: number): GoogleGenAI {
  const key = env.geminiApiKeys[keyIndex];
  if (!key) throw new AiError("not_configured", "GEMINI_API_KEY belum diatur di file .env server.", 503);
  let c = clients.get(keyIndex);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(keyIndex, c);
  }
  return c;
}

/** Convert a zod schema into the JSON-Schema subset Gemini accepts. */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        // Keywords Gemini's response schema does not need (defaults are applied by zod after parsing).
        if (k === "$schema" || k === "additionalProperties" || k === "default") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

export type AiResult<T> = { data: T; model: string; tokens: number };

/**
 * Central entry point for every Gemini call: structured JSON output validated by zod, timeout,
 * automatic failover across API keys (GEMINI_API_KEY, GEMINI_API_KEY_2, …) and an optional
 * fallback model when quotas run out, plus usage logging.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  feature: string;
  system: string;
  prompt: string;
  schema: S;
  temperature?: number;
  /** Overrides GEMINI_TIMEOUT_MS for long jobs (e.g. reviewing a whole chapter). */
  timeoutMs?: number;
}): Promise<AiResult<z.infer<S>>> {
  const keyCount = env.geminiApiKeys.length;
  if (!keyCount) throw new AiError("not_configured", "GEMINI_API_KEY belum diatur di file .env server.", 503);

  const primary = await getActiveModel();
  const fallback = env.geminiFallbackModel;
  const models = fallback && fallback !== primary ? [primary, fallback] : [primary];
  const responseJsonSchema = toGeminiSchema(opts.schema);
  // Quota validation: fail fast with the reset time instead of calling Gemini when every key is known to be exhausted.
  assertQuotaAvailable(keyCount, models);

  try {
    const { value, candidate } = await runWithFailover(orderCandidates(keyCount, models), async ({ keyIndex, model }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? env.geminiTimeoutMs);
      try {
        const res = await getClient(keyIndex).models.generateContent({
          model,
          contents: opts.prompt,
          config: {
            systemInstruction: opts.system,
            temperature: opts.temperature ?? 0.4,
            responseMimeType: "application/json",
            responseJsonSchema,
            abortSignal: controller.signal,
          },
        });
        const raw = res.text;
        if (!raw) {
          const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason;
          if (reason === "MAX_TOKENS") {
            throw new AiError("too_long", "Jawaban Gemini terpotong karena melebihi batas token output. Proses teks per bagian/bab yang lebih pendek.", 413);
          }
          throw new AiError("blocked", `Gemini tidak mengembalikan teks${reason ? ` (${reason})` : ""}. Coba ubah teks atau persingkat.`, 422);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new AiError("invalid_response", "Respons Gemini tidak dapat dibaca (JSON tidak valid).", 502);
        }
        const result = opts.schema.safeParse(parsed);
        if (!result.success) throw new AiError("invalid_response", "Respons Gemini tidak sesuai format yang diharapkan.", 502);
        return { data: result.data as z.infer<S>, tokens: res.usageMetadata?.totalTokenCount ?? 0 };
      } finally {
        clearTimeout(timer);
      }
    });

    const label = keyCount > 1 ? `${candidate.model} · key ${candidate.keyIndex + 1}` : candidate.model;
    await logUsage(opts.feature, label, value.tokens, true);
    return { data: value.data, model: label, tokens: value.tokens };
  } catch (err) {
    await logUsage(opts.feature, primary, 0, false);
    throw err;
  }
}

async function logUsage(feature: string, model: string, tokens: number, success: boolean) {
  try {
    await db.usageLog.create({ data: { feature, model, tokensUsed: tokens, success } });
  } catch (e) {
    console.error("[usage-log]", e);
  }
}
