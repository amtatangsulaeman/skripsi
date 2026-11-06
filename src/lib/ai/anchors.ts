// Evidence anchors: every review finding quotes the manuscript, and we check that quote against the
// actual text so a reviewer cannot "find" something that isn't there. Pure; exported for tests.

export type AnchorStatus = "found" | "partial" | "not_found";

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}%.,;:'"()/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** found = the quote appears (ignoring case/spacing); partial = a long run of its words does; not_found otherwise. */
export function verifyQuote(source: string, quote: string, normalizedSource?: string): AnchorStatus {
  const q = norm(quote).replace(/^["'.…]+|["'.…]+$/g, "").replace(/\s*…\s*/g, " ");
  if (q.length < 4) return "not_found";
  const src = normalizedSource ?? norm(source);
  if (src.includes(q)) return "found";
  // Ellipsis-joined fragments: every fragment must appear.
  const frags = norm(quote).split(/\s*(?:\.\.\.|…)\s*/).filter((f) => f.length >= 8);
  if (frags.length > 1 && frags.every((f) => src.includes(f))) return "found";
  const words = q.split(" ");
  const window = Math.min(8, Math.max(4, Math.floor(words.length / 2)));
  for (let i = 0; i + window <= words.length; i++) {
    if (src.includes(words.slice(i, i + window).join(" "))) return "partial";
  }
  return "not_found";
}

export function makeAnchorChecker(source: string) {
  const src = norm(source);
  return (quote: string) => verifyQuote(source, quote, src);
}
