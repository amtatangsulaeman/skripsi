// Deterministic safeguards applied to every AI rewrite: the model must not drop or invent
// citations, numbers, URLs/DOIs or direct quotations. Results are shown to the user as warnings.

export type ProtectedTokens = {
  citations: string[];
  numbers: string[];
  links: string[];
  quotes: string[];
};

const CITATION_PAREN = /\(([^()]*?\b(?:19|20)\d{2}[a-z]?(?::\s?\d+(?:[-–]\d+)?)?[^()]*?)\)/g; // (Author, 2020) (Sugiyono, 2017:136)
const CITATION_NARRATIVE = /\b([A-Z][\p{L}'-]+(?:\s(?:et al\.|dkk\.?|&|dan)\s?[A-Z]?[\p{L}'-]*)?)\s\((?:19|20)\d{2}[a-z]?(?::\d+)?\)/gu; // Arens (2008)
const CITATION_NUMERIC = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g; // [1], [2-4]
const LINK = /\b(?:https?:\/\/\S+|doi:\s?\S+|10\.\d{4,9}\/\S+)/gi;
const NUMBER = /(?<![\p{L}\d])\d+(?:[.,]\d+)*%?(?![\p{L}\d])/gu;
const QUOTE = /[“"]([^”"]{12,})[”"]/g;

function uniq(a: string[]) {
  return Array.from(new Set(a.map((s) => s.trim()).filter(Boolean)));
}

function norm(s: string) {
  return s.replace(/\s+/g, " ").replace(/[“”]/g, '"').trim().toLowerCase();
}

export function extractProtected(text: string): ProtectedTokens {
  const citations = [
    ...Array.from(text.matchAll(CITATION_PAREN), (m) => m[0]),
    ...Array.from(text.matchAll(CITATION_NARRATIVE), (m) => m[0]),
    ...Array.from(text.matchAll(CITATION_NUMERIC), (m) => m[0]),
  ];
  return {
    citations: uniq(citations),
    numbers: uniq(Array.from(text.matchAll(NUMBER), (m) => m[0])),
    links: uniq(Array.from(text.matchAll(LINK), (m) => m[0].replace(/[).,;]+$/, ""))),
    quotes: uniq(Array.from(text.matchAll(QUOTE), (m) => m[1] ?? "")),
  };
}

export type IntegrityReport = {
  missing: { kind: keyof ProtectedTokens; value: string }[];
  added: { kind: "citations" | "links" | "numbers"; value: string }[];
  ok: boolean;
};

const yearOf = (s: string) => s.match(/(?:19|20)\d{2}/)?.[0];

/** Compare protected tokens between the original and the AI output. */
export function checkIntegrity(original: string, output: string, opts: { quotes?: boolean } = {}): IntegrityReport {
  const a = extractProtected(original);
  const b = extractProtected(output);
  const outNorm = norm(output);
  const missing: IntegrityReport["missing"] = [];
  const added: IntegrityReport["added"] = [];

  for (const c of a.citations) {
    // Accept reformatted citations as long as the author surname and year are both still present.
    const year = yearOf(c);
    const surname = c.replace(/[()[\]]/g, "").match(/\p{Lu}[\p{L}'-]+/u)?.[0];
    const present =
      outNorm.includes(norm(c)) || (year && surname ? outNorm.includes(year) && outNorm.includes(surname.toLowerCase()) : false);
    if (!present) missing.push({ kind: "citations", value: c });
  }
  for (const n of a.numbers) if (!b.numbers.includes(n)) missing.push({ kind: "numbers", value: n });
  for (const l of a.links) if (!outNorm.includes(norm(l))) missing.push({ kind: "links", value: l });
  if (opts.quotes !== false) {
    for (const q of a.quotes) if (!outNorm.includes(norm(q))) missing.push({ kind: "quotes", value: q });
  }

  const origNorm = norm(original);
  for (const c of b.citations) {
    const year = yearOf(c);
    if (!origNorm.includes(norm(c)) && !(year && origNorm.includes(year))) added.push({ kind: "citations", value: c });
  }
  for (const l of b.links) if (!origNorm.includes(norm(l))) added.push({ kind: "links", value: l });
  for (const n of b.numbers) if (!a.numbers.includes(n) && !/^[1-9]$/.test(n)) added.push({ kind: "numbers", value: n });

  return { missing, added, ok: missing.length === 0 && added.length === 0 };
}
