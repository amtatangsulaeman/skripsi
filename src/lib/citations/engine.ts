// Citation ↔ reference-list cross-check (author–date styles: APA 7 and the Indonesian variants used in skripsi).
// Adapted from the citation-compliance method in "academic-research-skills" (Cheng-I Wu, CC BY-NC 4.0):
// zero orphans both ways, author/year consistency, and APA format checks. Pure and deterministic — no AI,
// so it can never invent a source. It only reports what is visible in the text.

export type InTextCitation = {
  raw: string; // as written, e.g. "(Sugiyono, 2017:136)"
  authors: string[]; // surnames / organisation names as written
  surnameKey: string; // normalized first author
  year: string; // "2017", "2017a", "n.d."
  etAl: boolean;
  narrative: boolean; // Author (Year) vs (Author, Year)
  page: string | null;
  index: number; // character offset in the text
};

export type ReferenceEntry = {
  raw: string;
  surnameKey: string;
  firstAuthor: string;
  acronym: string; // "ikatanakuntanindonesia" → "iai", so "(IAI, 2024)" matches an organisation entry
  year: string | null;
  authorCount: number;
  line: number; // 1-based position inside the reference list
};

export type IssueLevel = "error" | "warning" | "info";
export type CitationIssue = {
  level: IssueLevel;
  kind:
    | "missing_reference"
    | "uncited_reference"
    | "year_mismatch"
    | "et_al"
    | "ampersand"
    | "ordering"
    | "duplicate_reference"
    | "reference_format"
    | "doi_format"
    | "multi_order"
    | "page_format"
    | "no_reference_list";
  message: string;
  excerpt?: string;
  suggestion?: string;
};

export type CitationReport = {
  citations: InTextCitation[];
  references: ReferenceEntry[];
  matrix: { key: string; label: string; year: string; inTextCount: number; inReferences: boolean; status: "ok" | "missing_reference" | "uncited" | "year_mismatch" }[];
  issues: CitationIssue[];
  stats: { citations: number; uniqueSources: number; references: number; matched: number; recentShare: number | null; oldShare: number | null };
  referenceHeading: string | null;
};

const REF_HEADING = /^\s*(daftar\s+pustaka|daftar\s+referensi|referensi|kepustakaan|bibliografi|references|bibliography|works\s+cited)\s*$/im;
const END_HEADING = /^\s*(lampiran|appendix|appendices|daftar\s+riwayat\s+hidup|riwayat\s+hidup|biodata)\b.*$/im;
const ET_AL = /\s+(et\s*al\.?|dkk\.?|dan\s+kawan-kawan)$/i;
const YEAR = /(\d{4}[a-z]?|n\.d\.|t\.t\.|tanpa\s+tahun)/i;

/** Lower-case, strip diacritics, keep letters only — "Sugiyono" and "SUGIYONO," compare equal. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Sentence openers that the narrative pattern can swallow: "Pertama, Bawono dan Handika (2023)".
const LEAD_WORDS = new Set(
  "menurut dalam penelitian studi hasil sedangkan namun selain itu pertama kedua ketiga keempat kelima keenam selanjutnya kemudian oleh karena sementara adapun berdasarkan sebagaimana seperti sejalan dengan senada menurutnya according to in as".split(" "),
);
function stripLeadWords(s: string): string {
  let out = s.trim();
  for (;;) {
    const m = out.match(/^([\p{L}]+)[ 	]*,?[ 	]*/u);
    if (!m || !LEAD_WORDS.has(m[1]!.toLowerCase()) || m[0].length >= out.length) return out;
    out = out.slice(m[0].length);
  }
}

function normYear(y: string): string {
  const t = y.toLowerCase().replace(/\s+/g, " ").replace(/^(\d{4})[–-]\d{4}/, "$1");
  return /^(n\.d\.|t\.t\.|tanpa tahun)$/.test(t) ? "n.d." : t;
}

/** Split the document into body and reference list (last matching heading wins, so a TOC entry doesn't count). */
export function splitReferences(text: string): { body: string; refs: string; heading: string | null } {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (REF_HEADING.test(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start < 0) return { body: text, refs: "", heading: null };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (END_HEADING.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return { body: lines.slice(0, start).join("\n"), refs: lines.slice(start + 1, end).join("\n"), heading: lines[start]!.trim() };
}

function surnameOf(author: string): string {
  const a = author.replace(ET_AL, "").trim();
  return a;
}

function splitAuthors(s: string): string[] {
  return s
    .replace(ET_AL, "")
    .split(/\s*(?:&|\band\b|\bdan\b|,)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Find author–date citations in body text. */
export function extractCitations(body: string): InTextCitation[] {
  const out: InTextCitation[] = [];
  // Names never cross a line break ("Populasi Penelitian⏎Sugiyono (2017)" must not become one author).
  const name = "[A-ZÀ-Ý][\\p{L}'’.-]+(?:[ \\t]+[A-ZÀ-Ý][\\p{L}'’.-]+){0,3}";
  const authorsPart = `${name}(?:[ \\t]*(?:,|&|and|dan)[ \\t]*${name})*(?:[ \\t]+(?:et[ \\t]*al\\.?|dkk\\.?))?`;
  const yearPart = "(?:\\d{4}(?:[–-]\\d{4})?[a-z]?|n\\.d\\.|t\\.t\\.)";
  const pagePart = "(?:\\s*[:,]\\s*(?:(?:hal|hlm|p|pp)\\.?\\s*)?\\d+(?:\\s*[-–]\\s*\\d+)?)?";

  // Parenthetical groups: "(Sugiyono, 2017:136; Arens dkk., 2014)"
  const paren = /\(([^()]{4,400})\)/g;
  for (const m of body.matchAll(paren)) {
    const inner = m[1]!;
    if (!/\d{4}|n\.d\.|t\.t\./.test(inner)) continue;
    const parts = inner.split(/\s*;\s*/);
    let offset = 0;
    for (const part of parts) {
      const one = new RegExp(`^(?:(?:lihat|see|dalam|in|cf\\.)\\s+)?(${authorsPart})\\s*,?\\s*(${yearPart}(?:\\s*,\\s*${yearPart})*)(${pagePart})\\s*$`, "u").exec(part.trim());
      if (one) {
        const authors = splitAuthors(one[1]!);
        for (const y of one[2]!.split(/\s*,\s*/)) {
          out.push({
            raw: `(${part.trim()})`,
            authors,
            surnameKey: normalizeName(surnameOf(authors[0] ?? "")),
            year: normYear(y),
            etAl: ET_AL.test(one[1]!) || /et\s*al|dkk/i.test(one[1]!),
            narrative: false,
            page: one[3]?.replace(/^[\s:,]+/, "") || null,
            index: (m.index ?? 0) + 1 + offset,
          });
        }
      }
      offset += part.length + 1;
    }
  }

  // Narrative: "Sugiyono (2017:136)", "Arens dkk. (2014)", "Hall dan Singleton (2007)"
  const narr = new RegExp(`(${authorsPart})\\s*\\((${yearPart})(${pagePart})\\)`, "gu");
  for (const m of body.matchAll(narr)) {
    const authorsRaw = stripLeadWords(m[1]!);
    const authors = splitAuthors(authorsRaw);
    const first = authors[0] ?? "";
    if (!first || /^(Tabel|Gambar|Table|Figure|Bab|BAB|Pasal|Lampiran|Nomor|No|Tahun|UU)$/i.test(first)) continue;
    out.push({
      raw: `${authorsRaw} (${m[2]}${m[3] ?? ""})`,
      authors,
      surnameKey: normalizeName(surnameOf(first)),
      year: normYear(m[2]!),
      etAl: /et\s*al|dkk/i.test(authorsRaw),
      narrative: true,
      page: m[3]?.replace(/^[\s:,]+/, "") || null,
      index: m.index ?? 0,
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Split the reference list into entries. Handles one-entry-per-paragraph and wrapped lines. */
export function extractReferences(refs: string): ReferenceEntry[] {
  const lines = refs
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+$/.test(l));
  const entries: string[] = [];
  for (const l of lines) {
    // New entry when the line starts like "Surname, X." / "Surname. (2017)" / "Organisation. 2019." / "[1]"
    const startsEntry = /^(\[\d+\]|\d+\.\s)/.test(l) || /^[A-ZÀ-Ý][\p{L}'’-]+(?:\s[A-ZÀ-Ý][\p{L}'’-]+)*\s*[,.]/u.test(l);
    const prev = entries[entries.length - 1];
    const prevComplete = !prev || /(\.|\d{4}\)?\.?|\/[^\s]*)$/.test(prev) || YEAR.test(prev);
    if (startsEntry && prevComplete) entries.push(l);
    else if (prev) entries[entries.length - 1] = `${prev} ${l}`;
    else entries.push(l);
  }
  return entries.map((raw, i) => {
    const clean = raw.replace(/^(\[\d+\]|\d+\.)\s*/, "");
    const yearMatch = clean.match(/\(?\s*(\d{4}[a-z]?|n\.d\.|t\.t\.)\s*\)?/i);
    const before = yearMatch ? clean.slice(0, yearMatch.index) : clean.split(".")[0] ?? clean;
    const firstAuthor = (before.split(/,|\.\s|&|\bdan\b/)[0] ?? "").trim();
    // Count name tokens, ignoring initials ("Az Zahra, A. A., & Putra, I. N. W. A." → 2 authors).
    const authorCount = Math.max(
      1,
      before
        .split(/\s*(?:,|&|\bdan\b|\band\b)\s*/)
        .map((t) => t.trim().replace(/[.(]+$/, "").trim())
        .filter((t) => t && !/^([A-Z]\.?\s*-?)+$/.test(t) && !/^(dkk|et al)\.?$/i.test(t)).length,
    );
    const words = firstAuthor.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w));
    const acronym = words.length >= 2 ? normalizeName(words.map((w) => w[0]).join("")) : "";
    return { raw, surnameKey: normalizeName(firstAuthor), firstAuthor, acronym, year: yearMatch ? normYear(yearMatch[1]!) : null, authorCount, line: i + 1 };
  });
}

/** Reference ↔ citation author match: same surname, a prefix of it, or the organisation's acronym. */
function refMatches(ref: ReferenceEntry, citeKey: string) {
  return sameSurname(ref.surnameKey, citeKey) || (!!ref.acronym && ref.acronym === citeKey);
}

function sameSurname(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
}

export function checkCitations(text: string, opts: { now?: Date } = {}): CitationReport {
  const { body, refs, heading } = splitReferences(text);
  const citations = extractCitations(body);
  const references = extractReferences(refs);
  const issues: CitationIssue[] = [];
  const year = (opts.now ?? new Date()).getFullYear();

  if (!heading) {
    issues.push({
      level: "error",
      kind: "no_reference_list",
      message: 'Judul "DAFTAR PUSTAKA" (atau "Referensi"/"References") tidak ditemukan sebagai baris tersendiri, jadi sitasi tidak bisa dicocokkan dengan daftar pustaka.',
      suggestion: "Pastikan judul daftar pustaka berdiri di barisnya sendiri, lalu periksa ulang.",
    });
  }

  // ---- Matrix: (first author, year) ----
  type Row = CitationReport["matrix"][number];
  const rows = new Map<string, Row>();
  for (const c of citations) {
    const key = `${c.surnameKey}|${c.year}`;
    const r = rows.get(key) ?? { key, label: c.authors[0] ?? c.raw, year: c.year, inTextCount: 0, inReferences: false, status: "ok" as Row["status"] };
    r.inTextCount++;
    rows.set(key, r);
  }
  const usedRefs = new Set<number>();
  for (const r of rows.values()) {
    const [sk] = r.key.split("|");
    const exact = references.findIndex((ref) => refMatches(ref, sk!) && ref.year === r.year);
    if (exact >= 0) {
      r.inReferences = true;
      usedRefs.add(exact);
      continue;
    }
    if (!heading) continue;
    const sameAuthor = references.findIndex((ref) => refMatches(ref, sk!));
    if (sameAuthor >= 0) {
      r.status = "year_mismatch";
      usedRefs.add(sameAuthor);
      issues.push({
        level: "error",
        kind: "year_mismatch",
        message: `Tahun berbeda: di teks "${r.label}, ${r.year}", di daftar pustaka ${references[sameAuthor]!.year ?? "tanpa tahun"}.`,
        excerpt: references[sameAuthor]!.raw.slice(0, 200),
        suggestion: "Samakan tahun di teks dan di daftar pustaka (cek tahun terbit edisi yang dipakai).",
      });
    } else {
      r.status = "missing_reference";
      issues.push({
        level: "error",
        kind: "missing_reference",
        message: `"${r.label} (${r.year})" dikutip ${r.inTextCount}× di teks tetapi tidak ada di daftar pustaka.`,
        suggestion: "Tambahkan entrinya ke daftar pustaka. Kalau ini kutipan dari sumber lain (kutipan sekunder), tulis \"(Penulis Asli, Tahun, dalam Sumber, Tahun)\" dan cantumkan sumber yang Anda baca.",
      });
    }
  }
  const matrix: Row[] = [...rows.values()];
  references.forEach((ref, i) => {
    if (usedRefs.has(i)) return;
    // Cited with a different year counts as used above; anything left was never cited.
    const citedAnyYear = citations.some((c) => refMatches(ref, c.surnameKey));
    if (citedAnyYear) return;
    matrix.push({ key: `${ref.surnameKey}|${ref.year}`, label: ref.firstAuthor || ref.raw.slice(0, 40), year: ref.year ?? "—", inTextCount: 0, inReferences: true, status: "uncited" });
    issues.push({
      level: "warning",
      kind: "uncited_reference",
      message: `Entri daftar pustaka tidak pernah dikutip di teks: ${ref.firstAuthor || "(tanpa nama)"} (${ref.year ?? "tanpa tahun"}).`,
      excerpt: ref.raw.slice(0, 200),
      suggestion: "Kutip sumber ini di bagian yang relevan, atau hapus dari daftar pustaka.",
    });
  });

  // ---- In-text format (APA 7) ----
  const seenEtAl = new Set<string>();
  for (const c of citations) {
    if (!c.narrative && / and /i.test(c.raw)) {
      issues.push({ level: "info", kind: "ampersand", message: `Sitasi dalam kurung memakai "and": ${c.raw}`, suggestion: 'APA 7: gunakan "&" di dalam kurung, "dan"/"and" di luar kurung.' });
    }
    if (c.narrative && /&/.test(c.raw)) {
      issues.push({ level: "info", kind: "ampersand", message: `Sitasi naratif memakai "&": ${c.raw}`, suggestion: 'APA 7: di luar kurung tulis "dan" (atau "and"), bukan "&".' });
    }
    const ref = references.find((r) => refMatches(r, c.surnameKey) && r.year === c.year);
    if (ref && ref.authorCount >= 3 && !c.etAl && c.authors.length >= 3 && !seenEtAl.has(c.surnameKey + c.year)) {
      seenEtAl.add(c.surnameKey + c.year);
      issues.push({ level: "info", kind: "et_al", message: `Sumber dengan 3 penulis atau lebih ditulis lengkap di teks: ${c.raw}`, suggestion: `APA 7: langsung pakai "${c.authors[0]} dkk." (atau "et al.") sejak sitasi pertama.` });
    }
    if (c.page && /^(hal|hlm)\b/i.test(c.page)) {
      issues.push({ level: "info", kind: "page_format", message: `Format halaman: ${c.raw}`, suggestion: 'APA 7 menulis halaman sebagai "(Penulis, Tahun, hlm. 45)" atau "p. 45". Ikuti pedoman kampus bila berbeda (mis. "Tahun:45").' });
    }
  }
  for (const m of body.matchAll(/\(([^()]*\d{4}[^()]*;[^()]*\d{4}[^()]*)\)/g)) {
    const names = m[1]!.split(/\s*;\s*/).map((p) => normalizeName(p.split(/[ ,]/)[0] ?? ""));
    const sorted = [...names].sort();
    if (names.join() !== sorted.join()) {
      issues.push({ level: "info", kind: "multi_order", message: `Urutan beberapa sumber dalam satu kurung belum alfabetis: (${m[1]})`, suggestion: "APA 7: urutkan menurut nama penulis pertama, dipisah titik koma." });
    }
  }

  // ---- Reference list ----
  const seen = new Map<string, number>();
  references.forEach((ref, i) => {
    const norm = ref.raw.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(norm)) issues.push({ level: "warning", kind: "duplicate_reference", message: `Entri ganda di daftar pustaka (no. ${seen.get(norm)! + 1} dan ${i + 1}).`, excerpt: ref.raw.slice(0, 200) });
    else seen.set(norm, i);
    if (!ref.year) issues.push({ level: "warning", kind: "reference_format", message: "Entri tanpa tahun terbit.", excerpt: ref.raw.slice(0, 200), suggestion: 'Tambahkan tahun, atau "(t.t.)"/"(n.d.)" bila memang tidak ada.' });
    if (/\bdkk\.?|et\s*al\.?/i.test(ref.raw.slice(0, 120))) {
      issues.push({ level: "warning", kind: "reference_format", message: `Daftar pustaka memakai "dkk."/"et al." pada entri ${ref.firstAuthor}.`, excerpt: ref.raw.slice(0, 200), suggestion: "APA 7: di daftar pustaka tulis semua penulis (sampai 20 nama); \"dkk.\" hanya untuk sitasi di teks." });
    }
    if (/(dx\.doi\.org|doi:\s*10\.)/i.test(ref.raw)) {
      issues.push({ level: "info", kind: "doi_format", message: "Format DOI lama.", excerpt: ref.raw.slice(0, 200), suggestion: "Tulis DOI sebagai tautan: https://doi.org/10.xxxx/xxxxx" });
    }
    if (/https?:\/\/\S+\.$/.test(ref.raw)) {
      issues.push({ level: "info", kind: "doi_format", message: "Ada titik setelah DOI/URL di akhir entri.", excerpt: ref.raw.slice(-120), suggestion: "APA 7: jangan beri titik setelah DOI atau URL." });
    }
  });
  for (let i = 1; i < references.length; i++) {
    const a = references[i - 1]!.surnameKey;
    const b = references[i]!.surnameKey;
    if (a && b && a.localeCompare(b) > 0) {
      issues.push({
        level: "warning",
        kind: "ordering",
        message: `Urutan belum alfabetis: "${references[i - 1]!.firstAuthor}" ditulis sebelum "${references[i]!.firstAuthor}".`,
        suggestion: "Urutkan daftar pustaka menurut nama belakang penulis pertama (A–Z).",
      });
    }
  }

  const years = references.map((r) => Number.parseInt(r.year ?? "", 10)).filter((y) => Number.isFinite(y));
  const unique = new Set(citations.map((c) => `${c.surnameKey}|${c.year}`)).size;
  return {
    citations,
    references,
    matrix: matrix.sort((x, y) => (x.status === "ok" ? 1 : 0) - (y.status === "ok" ? 1 : 0) || x.label.localeCompare(y.label)),
    issues,
    stats: {
      citations: citations.length,
      uniqueSources: unique,
      references: references.length,
      matched: matrix.filter((r) => r.status === "ok" && r.inTextCount > 0).length,
      recentShare: years.length ? years.filter((y) => year - y <= 5).length / years.length : null,
      oldShare: years.length ? years.filter((y) => year - y > 10).length / years.length : null,
    },
    referenceHeading: heading,
  };
}
