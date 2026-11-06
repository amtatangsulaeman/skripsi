// Deterministic text-similarity engine (no AI, no external database).
// Word n-gram shingling finds passages of the target that also occur in the provided sources.
// The score is the share of target words covered by such passages — it is never estimated or invented.

export type SourceDoc = { id: string; title: string; text: string };

export type SimilarityOptions = {
  /** Minimum contiguous matching words for a passage to count (Turnitin-style "exclude small matches"). */
  minWords: number;
  excludeQuotes: boolean;
  excludeReferences: boolean;
};

export const DEFAULT_SIM_OPTIONS: SimilarityOptions = { minWords: 8, excludeQuotes: true, excludeReferences: true };

export type MatchedPassage = {
  /** Character range in the analysed target text. */
  start: number;
  end: number;
  words: number;
  text: string;
  sourceId: string;
  sourceTitle: string;
  /** Matching excerpt from the source. */
  sourceExcerpt: string;
};

export type SimilarityResult = {
  score: number; // 0–100, one decimal
  totalWords: number;
  matchedWords: number;
  excludedWords: number;
  passages: MatchedPassage[];
  sources: { id: string; title: string; matchedWords: number; percent: number }[];
  repeated: { text: string; count: number }[];
  options: SimilarityOptions;
};

type Tok = { norm: string; start: number; end: number };

const N = 5; // shingle size; passages shorter than minWords are discarded afterwards

export function tokenizeWords(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)) {
    out.push({ norm: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Character ranges that should be ignored (direct quotations, reference list). */
export function excludedRanges(text: string, opts: SimilarityOptions): [number, number][] {
  const ranges: [number, number][] = [];
  if (opts.excludeQuotes) {
    for (const m of text.matchAll(/[“"]([^”"]{10,}?)[”"]/g)) ranges.push([m.index!, m.index! + m[0].length]);
  }
  if (opts.excludeReferences) {
    const ref = text.search(/^\s*(daftar pustaka|daftar referensi|references|bibliography|bibliografi)\s*$/im);
    if (ref >= 0) ranges.push([ref, text.length]);
  }
  return ranges;
}

const inRanges = (pos: number, ranges: [number, number][]) => ranges.some(([a, b]) => pos >= a && pos < b);

function hashShingle(tokens: Tok[], i: number): string {
  let s = tokens[i]!.norm;
  for (let k = 1; k < N; k++) s += " " + tokens[i + k]!.norm;
  return s;
}

export function analyzeSimilarity(target: string, sources: SourceDoc[], options: Partial<SimilarityOptions> = {}): SimilarityResult {
  const opts = { ...DEFAULT_SIM_OPTIONS, ...options };
  const minWords = Math.max(N, Math.round(opts.minWords));
  const tTokens = tokenizeWords(target);
  const excl = excludedRanges(target, opts);
  const excludedMask = tTokens.map((t) => inRanges(t.start, excl));
  const excludedWords = excludedMask.filter(Boolean).length;
  const totalWords = tTokens.length - excludedWords;

  // Index sources: shingle → list of (source index, token position).
  const index = new Map<string, { s: number; pos: number }[]>();
  const sTokens = sources.map((s) => tokenizeWords(s.text));
  sTokens.forEach((toks, s) => {
    for (let i = 0; i + N <= toks.length; i++) {
      const key = hashShingle(toks, i);
      const list = index.get(key);
      if (list) list.length < 50 && list.push({ s, pos: i });
      else index.set(key, [{ s, pos: i }]);
    }
  });

  // Greedy longest-match extension from each shingle hit.
  const covered = new Int32Array(tTokens.length).fill(-1); // source index covering each target token
  const passagesRaw: { tStart: number; tEnd: number; s: number; sStart: number; sEnd: number }[] = [];
  let i = 0;
  while (i + N <= tTokens.length) {
    if (excludedMask[i]) {
      i++;
      continue;
    }
    const hits = index.get(hashShingle(tTokens, i));
    if (!hits) {
      i++;
      continue;
    }
    let best: { len: number; s: number; pos: number } | null = null;
    for (const h of hits) {
      const st = sTokens[h.s]!;
      let len = N;
      while (i + len < tTokens.length && h.pos + len < st.length && !excludedMask[i + len] && tTokens[i + len]!.norm === st[h.pos + len]!.norm) len++;
      if (!best || len > best.len) best = { len, s: h.s, pos: h.pos };
    }
    if (best && best.len >= minWords) {
      passagesRaw.push({ tStart: i, tEnd: i + best.len, s: best.s, sStart: best.pos, sEnd: best.pos + best.len });
      for (let k = i; k < i + best.len; k++) covered[k] = best.s;
      i += best.len;
    } else i++;
  }

  const matchedWords = Array.from(covered).filter((v) => v >= 0).length;
  const perSource = new Map<number, number>();
  covered.forEach((v) => v >= 0 && perSource.set(v, (perSource.get(v) ?? 0) + 1));

  const passages: MatchedPassage[] = passagesRaw.map((p) => {
    const src = sources[p.s]!;
    const st = sTokens[p.s]!;
    const start = tTokens[p.tStart]!.start;
    const end = tTokens[p.tEnd - 1]!.end;
    return {
      start,
      end,
      words: p.tEnd - p.tStart,
      text: target.slice(start, end),
      sourceId: src.id,
      sourceTitle: src.title,
      sourceExcerpt: src.text.slice(st[p.sStart]!.start, st[p.sEnd - 1]!.end),
    };
  });

  const pct = (n: number) => (totalWords ? Math.round((n / totalWords) * 1000) / 10 : 0);

  return {
    score: pct(matchedWords),
    totalWords,
    matchedWords,
    excludedWords,
    passages,
    sources: Array.from(perSource.entries())
      .map(([s, n]) => ({ id: sources[s]!.id, title: sources[s]!.title, matchedWords: n, percent: pct(n) }))
      .sort((a, b) => b.matchedWords - a.matchedWords),
    repeated: findRepeatedSentences(target),
    options: { ...opts, minWords },
  };
}

/** Sentences (≥ 6 words) that occur more than once inside the same text. */
export function findRepeatedSentences(text: string): { text: string; count: number }[] {
  const counts = new Map<string, { text: string; count: number }>();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const raw of sentences) {
    const s = raw.trim();
    const norm = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    if (norm.split(" ").length < 6) continue;
    const e = counts.get(norm);
    if (e) e.count++;
    else counts.set(norm, { text: s, count: 1 });
  }
  return Array.from(counts.values()).filter((e) => e.count > 1).sort((a, b) => b.count - a.count);
}
