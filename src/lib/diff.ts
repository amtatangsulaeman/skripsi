// Word-level diff (LCS) used to highlight changes between original and revised text.

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

/** Split into words, whitespace and punctuation so highlighting keeps original spacing. */
export function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

const MAX_CELLS = 25_000_000;

export function diffWords(a: string, b: string): DiffPart[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  if (n === 0 && m === 0) return [];
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    // Too large for a full LCS table: degrade gracefully to a paragraph-level comparison.
    return diffParagraphs(a, b);
  }

  // dp[i][j] = LCS length of A[i..] and B[j..], stored in a flat typed array.
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]!);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      push("removed", A[i++]!);
    } else {
      push("added", B[j++]!);
    }
  }
  while (i < n) push("removed", A[i++]!);
  while (j < m) push("added", B[j++]!);
  return absorbWhitespace(parts);
}

/** Whitespace-only change islands between edits are folded into "same" for cleaner display. */
function absorbWhitespace(parts: DiffPart[]): DiffPart[] {
  return parts.filter((p) => !(p.type !== "same" && p.text.trim() === "" && p.text.length > 0 && p.type === "removed"));
}

function diffParagraphs(a: string, b: string): DiffPart[] {
  const pa = a.split(/\n{2,}/);
  const pb = b.split(/\n{2,}/);
  const out: DiffPart[] = [];
  const len = Math.max(pa.length, pb.length);
  for (let k = 0; k < len; k++) {
    const x = pa[k];
    const y = pb[k];
    const sep = k < len - 1 ? "\n\n" : "";
    if (x === y && x !== undefined) out.push({ type: "same", text: x + sep });
    else {
      if (x) out.push({ type: "removed", text: x + sep });
      if (y) out.push({ type: "added", text: y + sep });
    }
  }
  return out;
}

/** Share of words in `b` that differ from `a` (0–100). */
export function changeRatio(parts: DiffPart[]): number {
  let changed = 0;
  let total = 0;
  for (const p of parts) {
    const words = p.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    if (p.type !== "removed") total += words;
    if (p.type === "added") changed += words;
  }
  return total ? Math.round((changed / total) * 100) : 0;
}
