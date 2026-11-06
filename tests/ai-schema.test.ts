import { describe, expect, it } from "vitest";
import { toGeminiSchema } from "@/lib/ai/client";
import { analysisSchema, grammarSchema, guidelinesSchema, paraphraseSchema, rewriteSchema } from "@/lib/ai/service";

describe("Gemini response schemas", () => {
  it.each([
    ["paraphrase", paraphraseSchema],
    ["rewrite", rewriteSchema],
    ["grammar", grammarSchema],
    ["analysis", analysisSchema],
    ["guidelines", guidelinesSchema],
  ])("%s converts to a plain JSON schema without unsupported keywords", (_name, schema) => {
    const json = JSON.stringify(toGeminiSchema(schema));
    expect(json).not.toContain("$schema");
    expect(json).not.toContain("additionalProperties");
    expect(JSON.parse(json).type).toBe("object");
  });

  it("tolerates imperfect model output via defaults/catch", () => {
    const g = grammarSchema.parse({ detectedLanguage: "fr", corrected: "x", corrections: [{ original: "a", corrected: "b", type: "weird", explanation: "e" }] });
    expect(g.detectedLanguage).toBe("id");
    expect(g.corrections[0]!.type).toBe("grammar");
    expect(g.suggestions).toEqual([]);
  });
});
