import "server-only";
import { z } from "zod";
import { generateStructured } from "./client";
import { AiError } from "./errors";
import { makeAnchorChecker, type AnchorStatus } from "./anchors";
import * as R from "./research-prompts";

export const MAX_REVIEW_CHARS = 120_000;

/* ---------- Review panel ---------- */

const verdict = z.enum(["EXCEEDS", "MEETS", "PARTLY_MEETS", "DOES_NOT_MEET", "NOT_ASSESSED"]).catch("NOT_ASSESSED");
const severity = z.enum(["critical", "major", "minor"]).catch("minor");

const reviewerSchema = z.object({
  role: z.enum(["methodology", "substance"]).catch("methodology"),
  summary: z.string().default(""),
  judgements: z.array(z.object({ criterion: z.string(), verdict, evidence: z.string().default(""), rationale: z.string().default(""), uncertainty: z.string().default("") })).default([]),
  strengths: z.array(z.object({ point: z.string(), evidence: z.string().default("") })).default([]),
  weaknesses: z.array(z.object({ severity, issue: z.string(), evidence: z.string().default(""), why: z.string().default(""), suggestion: z.string().default("") })).default([]),
  questions: z.array(z.string()).default([]),
});
const panelSchema = z.object({ reviews: z.array(reviewerSchema).min(1) });

const daSchema = z.object({
  strongestCounterArgument: z.string().default(""),
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "major", "minor", "observation"]).catch("minor"),
        dimension: z.string().default("core_thesis"),
        issue: z.string(),
        evidence: z.string().default(""),
        suggestion: z.string().default(""),
      }),
    )
    .default([]),
  alternativeExplanations: z.array(z.string()).default([]),
  unexaminedPremise: z.string().nullable().catch(null),
  defenseQuestions: z.array(z.string()).default([]),
});

const synthesisSchema = z.object({
  decision: z.enum(["ready", "minor_revision", "major_revision", "not_ready"]).catch("major_revision"),
  rationale: z.string().default(""),
  verified: z.array(z.string()).default([]),
  requiredRevisions: z.array(z.object({ priority: z.number().catch(9), item: z.string(), sources: z.array(z.string()).default([]) })).default([]),
  optionalSuggestions: z.array(z.string()).default([]),
  disagreements: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
});

export type Anchored<T> = T & { anchor: AnchorStatus | "absence" };
export type ReviewerReport = Omit<z.infer<typeof reviewerSchema>, "strengths" | "weaknesses" | "judgements"> & {
  judgements: Anchored<z.infer<typeof reviewerSchema>["judgements"][number]>[];
  strengths: Anchored<z.infer<typeof reviewerSchema>["strengths"][number]>[];
  weaknesses: Anchored<z.infer<typeof reviewerSchema>["weaknesses"][number]>[];
};
export type DevilsAdvocateReport = Omit<z.infer<typeof daSchema>, "issues"> & { issues: Anchored<z.infer<typeof daSchema>["issues"][number]>[] };
export type ReviewResult = {
  context: R.ReviewContext;
  reviewers: ReviewerReport[];
  devilsAdvocate: DevilsAdvocateReport;
  synthesis: z.infer<typeof synthesisSchema>;
  anchorStats: { found: number; partial: number; notFound: number; absence: number };
  truncated: boolean;
  chars: number;
  model: string;
  tokens: number;
};

const ABSENCE = /^\s*TIDAK ADA\s*:/i;

export async function runReviewPanel(rawText: string, ctx: R.ReviewContext): Promise<ReviewResult> {
  const clean = rawText.trim();
  if (clean.length < 500) throw new AiError("too_long", "Teks terlalu pendek untuk direview (minimal sekitar 500 karakter, idealnya satu bab utuh).", 400);
  const truncated = clean.length > MAX_REVIEW_CHARS;
  const text = truncated ? clean.slice(0, MAX_REVIEW_CHARS) : clean;

  // Independent seats run in parallel; the devil's advocate has its own call so it cannot soften to match.
  const panelP = R.reviewPanelPrompt(text, ctx);
  const daP = R.devilsAdvocatePrompt(text, ctx);
  const [panel, da] = await Promise.all([
    generateStructured({ feature: "review_panel", ...panelP, schema: panelSchema, temperature: 0.3, timeoutMs: 120_000 }),
    generateStructured({ feature: "review_devils_advocate", ...daP, schema: daSchema, temperature: 0.4, timeoutMs: 120_000 }),
  ]);

  // Evidence anchors: check every quote against the manuscript.
  const check = makeAnchorChecker(text);
  const stats = { found: 0, partial: 0, notFound: 0, absence: 0 };
  const anchor = <T extends { evidence: string }>(item: T): Anchored<T> => {
    let a: AnchorStatus | "absence";
    if (ABSENCE.test(item.evidence)) a = "absence";
    else if (!item.evidence.trim()) a = "not_found";
    else a = check(item.evidence);
    stats[a === "not_found" ? "notFound" : a]++;
    return { ...item, anchor: a };
  };

  const reviewers: ReviewerReport[] = panel.data.reviews.slice(0, 2).map((r) => ({
    ...r,
    judgements: r.judgements.map(anchor),
    strengths: r.strengths.map(anchor),
    weaknesses: r.weaknesses.map(anchor),
  }));
  const devilsAdvocate: DevilsAdvocateReport = { ...da.data, issues: da.data.issues.map(anchor) };

  // The chair only sees findings with real or absence anchors, so unverifiable quotes cannot drive the decision.
  const usable = <T extends { anchor: string }>(xs: T[]) => xs.filter((x) => x.anchor !== "not_found");
  const forChair = JSON.stringify({
    methodology_and_substance: reviewers.map((r) => ({
      role: r.role,
      summary: r.summary,
      judgements: r.judgements.map(({ criterion, verdict: v, rationale }) => ({ criterion, verdict: v, rationale })),
      strengths: usable(r.strengths).map((s) => s.point),
      weaknesses: usable(r.weaknesses).map(({ severity: sv, issue, suggestion }) => ({ severity: sv, issue, suggestion })),
    })),
    devils_advocate: {
      strongestCounterArgument: devilsAdvocate.strongestCounterArgument,
      issues: usable(devilsAdvocate.issues).map(({ severity: sv, issue, suggestion }) => ({ severity: sv, issue, suggestion })),
    },
  });
  const synth = await generateStructured({ feature: "review_synthesis", ...R.editorialSynthesisPrompt(forChair, ctx), schema: synthesisSchema, temperature: 0.2, timeoutMs: 90_000 });

  return {
    context: ctx,
    reviewers,
    devilsAdvocate,
    synthesis: { ...synth.data, requiredRevisions: [...synth.data.requiredRevisions].sort((a, b) => a.priority - b.priority) },
    anchorStats: stats,
    truncated,
    chars: text.length,
    model: panel.model,
    tokens: panel.tokens + da.tokens + synth.tokens,
  };
}

/* ---------- Mentor ---------- */

export const MENTOR_STAGES = ["readiness", "thesis", "bab1", "bab2", "bab3", "bab4", "bab5", "stress_test", "outline"] as const;

const outlineSchema = z.object({
  title: z.string().default(""),
  problemStatement: z.string().default(""),
  chapters: z.array(z.object({ label: z.string(), title: z.string().default(""), purpose: z.string().default(""), subsections: z.array(z.string()).default([]), openQuestions: z.array(z.string()).default([]) })).default([]),
});
const mentorSchema = z.object({
  reply: z.string(),
  stage: z.enum(MENTOR_STAGES).catch("readiness"),
  insights: z.array(z.string()).default([]),
  outline: outlineSchema.nullable().catch(null),
});
export type MentorOutline = z.infer<typeof outlineSchema>;

export async function mentorTurn(opts: { field: string; topic: string; messages: R.MentorMessage[]; requestOutline: boolean }) {
  // Keep the most recent part of long conversations within budget.
  let messages = opts.messages.slice(-40);
  while (messages.reduce((n, m) => n + m.text.length, 0) > 40_000 && messages.length > 4) messages = messages.slice(2);
  const { system, prompt } = R.mentorPrompt({ ...opts, messages });
  const res = await generateStructured({ feature: "mentor", system, prompt, schema: mentorSchema, temperature: 0.5 });
  return { ...res.data, model: res.model, tokens: res.tokens };
}
