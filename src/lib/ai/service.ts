import "server-only";
import { z } from "zod";
import type { Intensity, Language, ParaphraseMode, PreserveKey, RewriteGoal } from "@/lib/options";
import { normalizeConfig, type FormattingConfig, SECTION_KEYS } from "@/lib/formatter/profile";
import { generateStructured } from "./client";
import { AiError } from "./errors";
import { checkIntegrity } from "./integrity";
import * as P from "./prompts";

export const MAX_AI_CHARS = 15000;

function guardLength(text: string, max = MAX_AI_CHARS) {
  if (!text.trim()) throw new AiError("too_long", "Teks masih kosong.", 400);
  if (text.length > max) {
    throw new AiError("too_long", `Teks terlalu panjang (${text.length.toLocaleString("id-ID")} karakter). Maksimal ${max.toLocaleString("id-ID")} karakter per permintaan — proses per bagian/bab.`, 413);
  }
}

/* ---------- Paraphrase ---------- */
export const paraphraseSchema = z.object({ paraphrased: z.string(), notes: z.array(z.string()).default([]) });

export async function paraphraseText(opts: {
  text: string;
  mode: ParaphraseMode;
  intensity: Intensity;
  preserve: PreserveKey[];
  language: Language;
}) {
  guardLength(opts.text);
  const { system, prompt } = P.paraphrasePrompt(opts);
  const temperature = { low: 0.3, medium: 0.6, high: 0.85 }[opts.intensity];
  const res = await generateStructured({ feature: "paraphrase", system, prompt, schema: paraphraseSchema, temperature });
  const integrity = checkIntegrity(opts.text, res.data.paraphrased, { quotes: opts.preserve.includes("quotes") });
  return { ...res.data, integrity, model: res.model, tokens: res.tokens };
}

/* ---------- Rewrite ---------- */
export const rewriteSchema = z.object({
  revised: z.string(),
  alternatives: z.array(z.string()).default([]),
  explanations: z.array(z.object({ change: z.string(), reason: z.string() })).default([]),
});

export async function rewriteSentence(opts: { text: string; goals: RewriteGoal[]; language: Language }) {
  guardLength(opts.text, 6000);
  const { system, prompt } = P.rewritePrompt(opts);
  const res = await generateStructured({ feature: "rewrite", system, prompt, schema: rewriteSchema, temperature: 0.6 });
  const integrity = checkIntegrity(opts.text, res.data.revised);
  return { ...res.data, integrity, model: res.model, tokens: res.tokens };
}

export async function improveAcademicWriting(text: string, language: Language = "auto") {
  return rewriteSentence({ text, goals: ["academic_tone", "structure", "readability"], language });
}

/* ---------- Grammar ---------- */
export const grammarSchema = z.object({
  detectedLanguage: z.enum(["id", "en"]).catch("id"),
  corrected: z.string(),
  corrections: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        type: z.enum(["spelling", "grammar", "punctuation", "word_choice", "capitalization", "clarity"]).catch("grammar"),
        explanation: z.string(),
      }),
    )
    .default([]),
  suggestions: z.array(z.string()).default([]),
});

export async function checkGrammar(opts: { text: string; language: Language }) {
  guardLength(opts.text);
  const { system, prompt } = P.grammarPrompt(opts);
  const res = await generateStructured({ feature: "grammar", system, prompt, schema: grammarSchema, temperature: 0.1 });
  const integrity = checkIntegrity(opts.text, res.data.corrected);
  return { ...res.data, integrity, model: res.model, tokens: res.tokens };
}

/* ---------- Document analysis ---------- */
export const analysisSchema = z.object({
  language: z.enum(["id", "en"]).catch("id"),
  summary: z.string(),
  detectedSections: z.array(z.string()).default([]),
  issues: z
    .array(
      z.object({
        category: z.enum(["structure", "consistency", "citation", "language", "methodology"]).catch("structure"),
        description: z.string(),
      }),
    )
    .default([]),
});

export async function analyzeDocument(text: string) {
  // Long documents: analyze the beginning + end so structure and references are both visible.
  const t = text.length > 30000 ? `${text.slice(0, 22000)}\n\n[…]\n\n${text.slice(-8000)}` : text;
  const { system, prompt } = P.analyzeDocumentPrompt(t);
  const res = await generateStructured({ feature: "analyze_document", system, prompt, schema: analysisSchema, temperature: 0.2 });
  return { ...res.data, truncated: text.length > 30000, model: res.model, tokens: res.tokens };
}

/* ---------- Formatting guidelines ---------- */
const num = z.number().nullable().catch(null);
export const guidelinesSchema = z.object({
  universityName: z.string().nullable().catch(null),
  marginsCm: z.object({ top: num, bottom: num, left: num, right: num }).nullable().catch(null),
  orientation: z.enum(["portrait", "landscape"]).nullable().catch(null),
  fontFamily: z.enum(["Times New Roman", "Arial"]).nullable().catch(null),
  fontSize: num,
  lineSpacing: num,
  firstLineIndentCm: num,
  chapterNumberStyle: z.enum(["roman", "arabic"]).nullable().catch(null),
  chapterFontSize: num,
  pageNumberPosition: z.enum(["bottom-center", "bottom-right", "top-right"]).nullable().catch(null),
  frontMatterRoman: z.boolean().nullable().catch(null),
  figureLabel: z.string().nullable().catch(null),
  tableLabel: z.string().nullable().catch(null),
  referencesTitle: z.string().nullable().catch(null),
  referenceLineSpacing: num,
  requiredSections: z.array(z.string()).default([]),
  otherRules: z.array(z.string()).default([]),
});
export type ExtractedGuidelines = z.infer<typeof guidelinesSchema>;

const SPACINGS = [1, 1.15, 1.5, 2] as const;
const nearestSpacing = (v: number) => SPACINGS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/** Map extracted rules onto a full FormattingConfig, starting from a base profile. Pure; exported for tests. */
export function guidelinesToConfig(g: ExtractedGuidelines, base: FormattingConfig): { config: FormattingConfig; applied: string[] } {
  const c = structuredClone(base);
  const applied: string[] = [];
  const m = g.marginsCm;
  if (m) {
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const v = m[side];
      if (v != null && v > 0 && v < 10) {
        c.page.margins[side] = v;
        applied.push(`Margin ${side}: ${v} cm`);
      }
    }
  }
  if (g.orientation) (c.page.orientation = g.orientation), applied.push(`Orientasi: ${g.orientation}`);
  if (g.fontFamily) (c.font.family = g.fontFamily), applied.push(`Font: ${g.fontFamily}`);
  if (g.fontSize && g.fontSize >= 8 && g.fontSize <= 16) (c.font.size = g.fontSize), applied.push(`Ukuran font: ${g.fontSize} pt`);
  if (g.lineSpacing) (c.paragraph.lineSpacing = nearestSpacing(g.lineSpacing)), applied.push(`Spasi: ${c.paragraph.lineSpacing}`);
  if (g.firstLineIndentCm != null && g.firstLineIndentCm >= 0 && g.firstLineIndentCm < 5)
    (c.paragraph.firstLineIndentCm = g.firstLineIndentCm), applied.push(`Indentasi: ${g.firstLineIndentCm} cm`);
  if (g.chapterNumberStyle) (c.headings.chapterNumberStyle = g.chapterNumberStyle), applied.push(`Penomoran bab: ${g.chapterNumberStyle}`);
  if (g.chapterFontSize && g.chapterFontSize >= 10 && g.chapterFontSize <= 18)
    (c.headings.chapterFontSize = g.chapterFontSize), applied.push(`Ukuran judul bab: ${g.chapterFontSize} pt`);
  if (g.pageNumberPosition) (c.pagination.position = g.pageNumberPosition), applied.push(`Nomor halaman: ${g.pageNumberPosition}`);
  if (g.frontMatterRoman != null) {
    c.pagination.frontMatter = g.frontMatterRoman ? "lowerRoman" : "none";
    applied.push(`Halaman awal romawi: ${g.frontMatterRoman ? "ya" : "tidak"}`);
  }
  if (g.figureLabel) (c.captions.figureLabel = g.figureLabel.slice(0, 20)), applied.push(`Label gambar: ${g.figureLabel}`);
  if (g.tableLabel) (c.captions.tableLabel = g.tableLabel.slice(0, 20)), applied.push(`Label tabel: ${g.tableLabel}`);
  if (g.referencesTitle) (c.references.title = g.referencesTitle.slice(0, 60)), applied.push(`Judul daftar pustaka: ${g.referencesTitle}`);
  if (g.referenceLineSpacing) c.references.lineSpacing = nearestSpacing(g.referenceLineSpacing);
  const req = g.requiredSections.filter((s): s is (typeof SECTION_KEYS)[number] => (SECTION_KEYS as readonly string[]).includes(s));
  if (req.length) (c.requiredSections = req), applied.push(`Bagian wajib: ${req.length}`);
  if (g.otherRules.length) c.notes = g.otherRules.join("\n").slice(0, 4000);
  return { config: normalizeConfig(c), applied };
}

export async function analyzeFormattingGuidelines(text: string, base: FormattingConfig) {
  const t = text.length > 60000 ? text.slice(0, 60000) : text;
  const { system, prompt } = P.formattingGuidelinesPrompt(t);
  const res = await generateStructured({ feature: "analyze_guidelines", system, prompt, schema: guidelinesSchema, temperature: 0 });
  const { config, applied } = guidelinesToConfig(res.data, base);
  return { extracted: res.data, config, applied, truncated: text.length > 60000, model: res.model, tokens: res.tokens };
}
