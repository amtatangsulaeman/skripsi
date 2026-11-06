// Structure detection: classify blocks into thesis sections, assign roles (subheadings, captions,
// list items, references) and renumber. Every structural change is recorded — nothing is silently removed.
import { extractProtected } from "@/lib/ai/integrity";
import type { Block, DocStats, FBlock, ParagraphBlock, Role, Run, Section, StructuredDoc } from "./model";
import { runsText } from "./model";
import { SECTION_LABELS, type FormattingConfig, type SectionKey } from "./profile";

const SECTION_PATTERNS: [SectionKey, RegExp][] = [
  ["approval", /^(lembar|halaman)\s+(pengesahan|persetujuan)\b|^approval\s+(page|sheet)$/i],
  ["declaration", /^((lembar|halaman)\s+)?pernyataan(\s+(keaslian|orisinalitas|bebas plagiat)(\s+\S+){0,3})?$|^(statement|declaration)\s+of\s+(originality|authorship)$/i],
  ["abstract", /^(abstrak|abstract|intisari)$/i],
  ["acknowledgments", /^(kata pengantar|prakata|ucapan terima kasih|acknowledge?ments?|preface)$/i],
  ["toc", /^(daftar isi|table of contents|contents)$/i],
  ["lof", /^(daftar gambar|list of figures)$/i],
  ["lot", /^(daftar tabel|list of tables)$/i],
  ["references", /^(daftar pustaka|daftar referensi|referensi|references|bibliography|bibliografi|kepustakaan)$/i],
  ["appendices", /^(lampiran|appendix|appendices)(\s*[-–:]?\s*([A-Z0-9]{1,3}\b.*)?)?$/i],
];

const CHAPTER_RE = /^(?:BAB|CHAPTER)\s+([IVXLC]+|\d{1,2})\b[.:]?\s*(.*)$/i;
const NUMBERED_SUB_RE = /^(\d{1,2})\.(\d{1,2})((?:\.\d{1,2}){0,2})\.?\s+(\S.{0,150})$/;
const LETTER_SUB_RE = /^([A-Z])\.\s+(\S.{1,120})$/;
const CAPTION_RE = /^(gambar|figure|grafik|bagan|tabel|table)\s+(\d+(?:[.\-]\d+)*)?\.?\s*[:.\-–]?\s*(.*)$/i;
const LIST_LIKE_RE = /^(\d{1,2}[.)]|[a-z][.)]|[ivx]{1,4}[.)]|[•●▪◦-])\s+/;

export function romanToInt(s: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const v = map[up[i]!] ?? 0;
    const next = map[up[i + 1]!] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

export function intToRoman(n: number): string {
  const table: [number, string][] = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v);
  return out;
}

const textOf = (b: Block) => (b.type === "paragraph" ? runsText(b.runs).trim() : "");
const normHeading = (t: string) => t.replace(/[.:]+$/, "").replace(/\s+/g, " ").trim();
const isAllBold = (b: ParagraphBlock) => b.runs.filter((r) => r.text.trim()).every((r) => r.bold);
const countWordsIn = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function isHeadingCandidate(b: Block): b is ParagraphBlock {
  if (b.type !== "paragraph" || b.list) return false;
  const t = textOf(b);
  return t.length > 0 && t.length <= 90;
}

export function matchSection(text: string): SectionKey | null {
  const t = normHeading(text);
  for (const [key, re] of SECTION_PATTERNS) if (re.test(t)) return key;
  return null;
}

export function blocksStats(blocks: Block[]): DocStats {
  let words = 0, tables = 0, images = 0, citations = 0, paragraphs = 0;
  for (const b of blocks) {
    if (b.type === "paragraph") {
      const t = textOf(b);
      if (!t) continue;
      paragraphs++;
      words += countWordsIn(t);
      citations += extractProtected(t).citations.length;
    } else if (b.type === "table") {
      tables++;
      for (const r of b.rows) for (const c of r.cells) for (const p of c.paragraphs) words += countWordsIn(runsText(p));
    } else images++;
  }
  return { words, tables, images, citations, paragraphs };
}

function stripPrefix(runs: Run[], prefixLength: number): Run[] {
  let remaining = prefixLength;
  const out: Run[] = [];
  for (const r of runs) {
    if (remaining <= 0) {
      out.push(r);
      continue;
    }
    if (r.text.length <= remaining) {
      remaining -= r.text.length;
      continue;
    }
    out.push({ ...r, text: r.text.slice(remaining) });
    remaining = 0;
  }
  if (out[0]) out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, "") };
  return out;
}

export function detectStructure(blocks: Block[], config: FormattingConfig, sourceKind: StructuredDoc["sourceKind"]): StructuredDoc {
  const changes: string[] = [];
  const warnings: StructuredDoc["warnings"] = [];
  const sourceStats = blocksStats(blocks);
  const sections: Section[] = [];
  let current: Section | null = null;
  let emptyDropped = 0;
  let pageNumbersDropped = 0;
  let droppedWords = 0;

  const open = (s: Section) => {
    sections.push(s);
    current = s;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === "paragraph") {
      const t = textOf(b);
      if (!t) {
        emptyDropped++;
        continue;
      }
      if (sourceKind !== "docx" && /^\d{1,3}$/.test(t)) {
        pageNumbersDropped++;
        droppedWords++;
        continue;
      }
      if (isHeadingCandidate(b)) {
        const ch = normHeading(t).match(CHAPTER_RE);
        if (ch) {
          const num = /^\d+$/.test(ch[1]!) ? Number(ch[1]) : romanToInt(ch[1]!);
          let title = (ch[2] ?? "").trim();
          if (!title) {
            const next = blocks[i + 1];
            if (next && isHeadingCandidate(next) && !matchSection(textOf(next)) && !NUMBERED_SUB_RE.test(textOf(next))) {
              title = textOf(next);
              i++;
            }
          }
          const key = num >= 1 && num <= 5 ? (`chapter${num}` as SectionKey) : "chapter";
          open({ key, title: normHeading(title), chapterNumber: num, blocks: [] });
          continue;
        }
        const sec = matchSection(t);
        if (sec) {
          open({ key: sec, title: normHeading(t), blocks: [], generated: sec === "toc" || sec === "lof" || sec === "lot" });
          continue;
        }
        // Word "Heading 1" whose "BAB I" label comes from automatic list numbering (not present in the text).
        if (b.headingLevel === 1) {
          const prev = sections.filter((s) => s.chapterNumber !== undefined).at(-1)?.chapterNumber ?? 0;
          const num = prev + 1;
          open({ key: num <= 5 ? (`chapter${num}` as SectionKey) : "chapter", title: normHeading(t), chapterNumber: num, blocks: [] });
          changes.push(`Judul "${normHeading(t)}" (gaya Heading 1) dianggap sebagai ${chapterLabel(num, config)}.`);
          continue;
        }
      }
    }
    if (!current) open({ key: "cover", title: "Sampul", blocks: [] });
    const sec = current as unknown as Section;
    sec.blocks.push(toFBlock(b, sec));
  }

  if (emptyDropped) changes.push(`${emptyDropped} paragraf kosong (spasi manual) dihapus; jarak antarparagraf kini diatur oleh profil.`);
  if (pageNumbersDropped) changes.push(`${pageNumbersDropped} baris nomor halaman hasil ekstraksi PDF dihapus; nomor halaman dibuat ulang otomatis.`);

  // ---- Per-section post-processing ----
  for (const s of sections) {
    if (s.generated) {
      const lines = s.blocks.length;
      droppedWords += blocksStats(s.blocks).words;
      s.blocks = [];
      changes.push(`${SECTION_LABELS[s.key as SectionKey]} manual (${lines} baris) diganti dengan daftar otomatis Word (field).`);
    }
    if (s.key === "references") {
      for (const b of s.blocks) if (b.type === "paragraph") b.role = { kind: "reference" };
      if (config.references.sortAlphabetically) {
        s.blocks.sort((a, b) => (a.type === "paragraph" && b.type === "paragraph" ? runsText(a.runs).localeCompare(runsText(b.runs), "id") : 0));
        changes.push("Daftar pustaka diurutkan secara alfabetis.");
      }
    }
  }

  // ---- Numbered lists interrupted by body paragraphs ----
  // Word keeps one numbering across "1. Wawancara ⏎ paragraph ⏎ 2. Observasi", but mammoth emits each item
  // as its own list, so every item would restart at 1. Continue the count unless a new list is introduced
  // (the paragraph before it ends with ":") or a heading/caption/table intervenes.
  let listsContinued = 0;
  for (const s of sections) listsContinued += continueInterruptedLists(s.blocks);
  if (listsContinued) changes.push(`${listsContinued} butir daftar bernomor yang terpotong paragraf dinomori lanjut (mis. 1, 2, 3 — bukan 1, 1, 1).`);

  // ---- Chapters: subheading & caption numbering ----
  const chapters = sections.filter((s) => s.chapterNumber !== undefined);
  let seqFigure = 0;
  let seqTable = 0;
  for (const s of chapters) {
    const n = s.chapterNumber!;
    const counters = [0, 0, 0];
    const outline: number[] = []; // source depths of the currently open subheadings
    let fig = 0;
    let tab = 0;
    for (let k = 0; k < s.blocks.length; k++) {
      const b = s.blocks[k]!;
      if (b.type === "table" && !hasCaptionNear(s.blocks, k, "table")) {
        warnings.push({ level: "warning", message: `Tabel tanpa judul/caption di ${chapterLabel(n, config)} — tambahkan "Tabel ${n}.x Judul" di atas tabel.` });
      }
      if (b.type === "image" && !hasCaptionNear(s.blocks, k, "figure")) {
        warnings.push({ level: "warning", message: `Gambar tanpa keterangan di ${chapterLabel(n, config)} — tambahkan "Gambar ${n}.x Keterangan" di bawah gambar.` });
      }
      if (b.type !== "paragraph") continue;
      const role = b.role;
      if (role.kind === "subheading") {
        let depth = role.level - 2; // 0 for x.y, 1 for x.y.z
        if (role.number && /^[A-Z]$/.test(role.number)) continue; // lettered sub-points keep their letter
        if (config.headings.subheadingNumbering) {
          // Never skip a level: a "Heading 3" / nested-list heading with no parent subheading would otherwise
          // be numbered 1.0.1. The outline stack maps the source levels onto consecutive levels, so siblings
          // stay siblings (1.1.1 + 1.1.2 directly under BAB I become 1.1 + 1.2).
          while (outline.length && outline[outline.length - 1]! >= depth) outline.pop();
          const effective = Math.min(outline.length, counters.length - 1);
          outline.push(depth);
          if (effective !== depth) {
            depth = effective;
            role.level = (depth + 2) as 2 | 3 | 4;
          }
          counters[depth]!++;
          for (let d = depth + 1; d < counters.length; d++) counters[d] = 0;
          const fresh = [n, ...counters.slice(0, depth + 1)].join(".");
          if (role.number && role.number !== fresh) changes.push(`Subbab "${role.number} ${runsText(role.title)}" dinomori ulang menjadi ${fresh}.`);
          role.number = fresh;
        }
      } else if (role.kind === "caption") {
        const isFig = role.captionType === "figure";
        const seq = isFig ? ++fig : ++tab;
        const global = isFig ? ++seqFigure : ++seqTable;
        const fresh = config.captions.numbering === "chapter" ? `${n}.${seq}` : String(global);
        if (role.number && role.number !== fresh) {
          changes.push(`${isFig ? config.captions.figureLabel : config.captions.tableLabel} ${role.number} dinomori ulang menjadi ${fresh}.`);
        }
        role.number = fresh;
      }
    }
  }

  // ---- Validation ----
  const present = new Set(sections.map((s) => s.key));
  if (config.toc.include) for (const k of ["toc"] as const) present.add(k);
  if (config.toc.includeListOfFigures) present.add("lof");
  if (config.toc.includeListOfTables) present.add("lot");
  for (const req of config.requiredSections) {
    if (!present.has(req)) warnings.push({ level: "warning", message: `Bagian wajib tidak ditemukan: ${SECTION_LABELS[req]}.` });
  }
  const nums = chapters.map((c) => c.chapterNumber!);
  nums.forEach((v, idx) => {
    if (idx > 0 && v !== nums[idx - 1]! + 1) warnings.push({ level: "warning", message: `Urutan bab tidak berurutan: ${chapterLabel(nums[idx - 1]!, config)} diikuti ${chapterLabel(v, config)}.` });
  });
  if (!chapters.length) {
    warnings.push({ level: "error", message: 'Tidak ada judul bab yang terdeteksi (format "BAB I" / "BAB 1"). Seluruh isi akan diperlakukan sebagai satu bagian.' });
  }
  for (const c of chapters) if (!c.title) warnings.push({ level: "warning", message: `${chapterLabel(c.chapterNumber!, config)} tidak memiliki judul bab.` });
  if (sourceKind === "pdf") {
    warnings.push({ level: "info", message: "Sumber berupa PDF: hanya teks yang bisa dipulihkan (tanpa tabel, gambar, cetak tebal/miring). Untuk hasil terbaik unggah versi DOCX." });
  }
  if (sections.some((s) => s.blocks.some((b) => b.type === "paragraph" && b.list))) {
    changes.push("Penomoran daftar (list) Word dibuat ulang: level 1 = 1, 2, 3…; level 2 = a, b, c…. Periksa daftar yang aslinya memakai huruf.");
  }

  return { sections, changes, warnings: dedupe(warnings), sourceStats, droppedWords, sourceKind };
}

function dedupe<T extends { message: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)));
}

export function chapterLabel(n: number, config: FormattingConfig) {
  return `BAB ${config.headings.chapterNumberStyle === "roman" ? intToRoman(n) : n}`;
}

/** Renumber level-0 ordered list items that restart at 1 after only body paragraphs. Returns how many changed. */
export function continueInterruptedLists(blocks: FBlock[]): number {
  let changed = 0;
  let last = 0; // number of the last level-0 item in the current run
  let offset = 0; // added to the source index for the current list segment
  let prevWasList = false;
  let colon = false; // the body paragraph before this segment introduces a new list
  for (const b of blocks) {
    if (b.type !== "paragraph") {
      last = offset = 0;
      prevWasList = colon = false;
      continue;
    }
    const role = b.role;
    if (role.kind === "listItem" && b.list?.ordered && b.list.level === 0) {
      if (!prevWasList) offset = b.list.index === 1 && last > 0 && !colon ? last : 0;
      const n = b.list.index + offset;
      if (offset) {
        role.marker = `${n}.`;
        changed++;
      }
      last = n;
      prevWasList = true;
      colon = false;
    } else if (role.kind === "listItem" && b.list) {
      prevWasList = true; // nested item: same list continues
    } else if (role.kind === "body") {
      prevWasList = false;
      colon = /:\s*$/.test(runsText(b.runs));
    } else {
      last = offset = 0;
      prevWasList = colon = false;
    }
  }
  return changed;
}

function hasCaptionNear(blocks: FBlock[], k: number, type: "figure" | "table") {
  for (const j of [k - 1, k + 1, k - 2, k + 2]) {
    const b = blocks[j];
    if (b && b.type === "paragraph" && b.role.kind === "caption" && b.role.captionType === type) return true;
  }
  return false;
}

function toFBlock(b: Block, section: Section): FBlock {
  if (b.type === "table") return { ...b, role: { kind: "table" } };
  if (b.type === "image") return { ...b, role: { kind: "image" } };
  return { ...b, role: classifyParagraph(b, section) };
}

function classifyParagraph(b: ParagraphBlock, section: Section): Role {
  const t = runsText(b.runs).trim();
  const inChapter = section.chapterNumber !== undefined;

  const cap = t.length < 250 ? t.match(CAPTION_RE) : null;
  if (cap && cap[2] && !/[.!?]\s+\S/.test(cap[3] ?? "")) {
    const type = /^(tabel|table)$/i.test(cap[1]!) ? "table" : "figure";
    const prefixLen = t.length - (cap[3] ?? "").length;
    return { kind: "caption", captionType: type, number: cap[2] ?? "", title: stripPrefix(b.runs, prefixLen) };
  }

  if (inChapter) {
    const sub = t.match(NUMBERED_SUB_RE);
    if (sub && !/[.;:,]$/.test(t) && t.length < 160) {
      const level = (2 + (sub[3] ? sub[3].split(".").length - 1 : 0)) as 2 | 3 | 4;
      return { kind: "subheading", level: Math.min(level, 4) as 2 | 3 | 4, number: `${sub[1]}.${sub[2]}${sub[3] ?? ""}`, title: stripPrefix(b.runs, t.length - sub[4]!.length) };
    }
    const letter = t.match(LETTER_SUB_RE);
    if (letter && isAllBold(b) && !/[.;:]$/.test(t)) {
      return { kind: "subheading", level: 3, number: letter[1]!, title: stripPrefix(b.runs, t.length - letter[2]!.length) };
    }
    // Word-styled headings or numbered-list headings without typed numbers.
    if ((b.headingLevel && b.headingLevel >= 2) || (b.list && isAllBold(b) && t.length < 100 && !/[.;:]$/.test(t))) {
      const level = (b.headingLevel ? Math.min(Math.max(b.headingLevel, 2), 4) : 2 + Math.min(b.list!.level, 1)) as 2 | 3 | 4;
      return { kind: "subheading", level, number: "", title: b.runs };
    }
  }

  if (b.list) {
    const marker = b.list.ordered ? (b.list.level % 2 === 0 ? `${b.list.index}.` : `${String.fromCharCode(96 + ((b.list.index - 1) % 26) + 1)}.`) : "•";
    return { kind: "listItem", marker, level: b.list.level };
  }
  const listLike = t.match(LIST_LIKE_RE);
  if (listLike) return { kind: "listItem", marker: "", level: 0 };
  return { kind: "body" };
}
