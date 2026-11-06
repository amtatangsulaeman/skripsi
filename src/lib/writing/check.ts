// Writing quality diagnostics for academic prose (Indonesian + English).
// Adapted from the "Writing Quality Check" in "academic-research-skills" (Cheng-I Wu, CC BY-NC 4.0).
// Design boundary (kept from the source): this improves clarity and precision. It is NOT a humanizer
// and does not try to fool AI detectors. Every finding is a non-blocking prompt for judgement,
// not a ban, quota or score. Pure and deterministic.

export type WritingCategory = "vague_term" | "throat_clearing" | "meta_commentary" | "nonstandard" | "overclaim" | "long_sentence" | "long_paragraph" | "repetition" | "acronym" | "synonym_cycling";

export type WritingFinding = {
  category: WritingCategory;
  excerpt: string; // the matched words or the start of the sentence/paragraph
  context: string; // surrounding sentence (trimmed)
  message: string;
  suggestion: string;
  index: number; // char offset
};

export type WritingReport = {
  findings: WritingFinding[];
  counts: Partial<Record<WritingCategory, number>>;
  stats: { words: number; sentences: number; paragraphs: number; avgSentenceWords: number; longSentences: number };
  language: "id" | "en";
};

export const CATEGORY_LABEL: Record<WritingCategory, string> = {
  vague_term: "Kata kabur/berlebihan",
  throat_clearing: "Pembuka bertele-tele",
  meta_commentary: "Komentar meta",
  nonstandard: "Tidak baku (EYD/KBBI)",
  overclaim: "Klaim terlalu kuat",
  long_sentence: "Kalimat terlalu panjang",
  long_paragraph: "Paragraf terlalu panjang",
  repetition: "Pembuka kalimat berulang",
  acronym: "Singkatan belum didefinisikan",
  synonym_cycling: "Istilah berganti-ganti",
};

type Rule = { re: RegExp; category: WritingCategory; message: string; suggestion: string };

const w = (s: string) => new RegExp(`(?<![\\p{L}])(?:${s})(?![\\p{L}])`, "giu");

// Indonesian rules — tuned for skripsi prose. Exceptions are handled by context (e.g. "signifikan" next to statistics).
const ID_RULES: Rule[] = [
  { re: w("sangat krusial|amat krusial|sangat penting sekali|sangat esensial"), category: "vague_term", message: "Penegasan berlebihan.", suggestion: 'Cukup "penting"/"krusial", atau tunjukkan alasannya dengan data.' },
  { re: w("holistik|komprehensif|multidimensional|multifaset"), category: "vague_term", message: "Klaim cakupan yang perlu dibuktikan.", suggestion: "Jelaskan konkret apa saja yang dicakup, atau ganti dengan kata yang lebih tepat." },
  { re: w("lanskap|ranah|tonggak|fondasi kokoh|paradigma baru|era disrupsi"), category: "vague_term", message: "Metafora/klise yang kabur dalam tulisan ilmiah.", suggestion: 'Pakai istilah yang langsung, mis. "bidang", "konteks", "dasar".' },
  { re: w("efektif dan efisien|optimal dan maksimal"), category: "vague_term", message: "Pasangan kata klise tanpa ukuran.", suggestion: "Sebutkan indikator efektivitas/efisiensi yang dimaksud." },
  { re: w("di era globalisasi(?: ini)?|di era modern(?: ini)?|seiring (?:dengan )?perkembangan zaman|dewasa ini|di zaman sekarang"), category: "throat_clearing", message: "Pembuka klise yang tidak menambah informasi.", suggestion: "Mulai langsung dari masalah penelitian, idealnya dengan data atau fakta." },
  { re: w("tidak dapat dipungkiri(?: bahwa)?|tak dapat dipungkiri(?: bahwa)?|perlu diketahui bahwa|perlu dicatat bahwa|penting untuk dicatat bahwa|sebagaimana kita ketahui(?: bersama)?|seperti yang kita ketahui"), category: "throat_clearing", message: "Frasa pengantar yang bisa dihapus.", suggestion: "Hapus frasa ini dan langsung nyatakan isinya." },
  { re: w("pada bab ini akan dibahas|pada sub ?bab ini akan dijelaskan|berikut ini akan dijelaskan|selanjutnya akan dibahas|bagian ini akan menguraikan"), category: "meta_commentary", message: "Kalimat yang menjelaskan apa yang akan ditulis, bukan isinya.", suggestion: "Langsung uraikan isinya. (Pengantar singkat di awal bab tetap boleh bila diminta pedoman.)" },
  { re: w("di mana(?= [a-z])"), category: "nonstandard", message: '"di mana" sebagai kata penghubung (terjemahan "where/which") tidak baku.', suggestion: 'Ganti dengan "yang", "tempat", atau pecah kalimat. "Di mana" hanya untuk menanyakan tempat.' },
  { re: w("dikarenakan"), category: "nonstandard", message: '"dikarenakan" tidak baku.', suggestion: 'Gunakan "karena" atau "disebabkan oleh".' },
  { re: w("merubah|dirubah|perubahan-perubahan"), category: "nonstandard", message: "Bentuk tidak baku.", suggestion: '"mengubah"/"diubah"; "perubahan" sudah bisa bermakna jamak.' },
  { re: w("resiko|analisa|aktifitas|efektifitas|kwalitas|kwantitas|praktek|sistim|obyek|subyek|nasehat|apotik|jadual|ijin|himbauan"), category: "nonstandard", message: "Ejaan tidak baku (KBBI).", suggestion: "risiko, analisis, aktivitas, efektivitas, kualitas, kuantitas, praktik, sistem, objek, subjek, nasihat, apotek, jadwal, izin, imbauan." },
  { re: w("daripada(?= (?:itu|hal|pada|yang))"), category: "nonstandard", message: '"daripada" hanya untuk membandingkan.', suggestion: 'Ganti dengan "dari" bila bukan perbandingan.' },
  { re: w("membuktikan bahwa|terbukti secara pasti|sudah pasti|selalu menyebabkan|tidak pernah|semua perusahaan|seluruh masyarakat"), category: "overclaim", message: "Klaim mutlak yang jarang bisa didukung satu penelitian.", suggestion: 'Batasi klaim: "menunjukkan", "mengindikasikan", "pada sampel penelitian ini".' },
];

const EN_RULES: Rule[] = [
  { re: w("delve|tapestry|testament|realm|embark|cornerstone|synergy|cutting-edge|groundbreaking|showcase|streamline"), category: "vague_term", message: "Overused or non-academic term.", suggestion: "Is this the most precise word here? e.g. examine, foundation, recent, novel, demonstrate." },
  { re: w("pivotal|crucial|multifaceted|intricate|nuanced|holistic|leverage|foster|underscore"), category: "vague_term", message: "Vague emphasis word.", suggestion: "Prefer a precise verb/adjective, or show why with evidence." },
  { re: w("it is important to note that|it is worth mentioning that|it should be noted that|it goes without saying that|in today's rapidly evolving|in the realm of|when it comes to|at the end of the day|with that being said"), category: "throat_clearing", message: "Throat-clearing opener.", suggestion: "Delete it and state the point directly." },
  { re: w("this section will discuss|the following paragraph examines|we now turn our attention to"), category: "meta_commentary", message: "Describes the text instead of doing it.", suggestion: "Just discuss it. (Roadmap sentences in the introduction are fine.)" },
  { re: w("proves that|always causes|never|all companies|undoubtedly"), category: "overclaim", message: "Absolute claim.", suggestion: 'Bound the claim: "suggests", "indicates", "in this sample".' },
];

// Common acronyms that need no definition in Indonesian/English theses.
const KNOWN_ACRONYMS = new Set(
  "BAB UU PT CV TBK NKRI RI DKI USA UK UN PBB DNA PhD SPSS PLS SEM ANOVA OLS VIF SD SMP SMA SMK S1 S2 S3 MA SKS IPK ID KTP NPWP NIK PDF DOCX URL DOI ISBN ISSN APA EYD KBBI PUEBI AI IT ICT HP TV HR".split(" "),
);

function sentencesOf(text: string): { s: string; index: number }[] {
  const out: { s: string; index: number }[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|\n|$)/g;
  for (const m of text.matchAll(re)) {
    const s = m[0].trim();
    if (s.length > 1) out.push({ s, index: m.index ?? 0 });
  }
  return out;
}

const wordCount = (s: string) => (s.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []).length;

function contextAt(text: string, index: number, len: number) {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1, text.lastIndexOf(". ", index) + 2);
  const endDot = text.indexOf(". ", index + len);
  const endNl = text.indexOf("\n", index + len);
  const end = Math.min(endDot < 0 ? text.length : endDot + 1, endNl < 0 ? text.length : endNl);
  const ctx = text.slice(start, end).trim();
  return ctx.length > 260 ? `${ctx.slice(0, 257)}…` : ctx;
}

export function detectLanguage(text: string): "id" | "en" {
  const id = (text.match(/\b(yang|dan|dengan|untuk|dalam|tidak|adalah|pada|dari|ini)\b/gi) ?? []).length;
  const en = (text.match(/\b(the|and|with|for|in|not|is|of|this|that)\b/gi) ?? []).length;
  return en > id * 1.3 ? "en" : "id";
}

/** Strip the reference list so bibliography entries are not diagnosed as prose. */
function proseOnly(text: string) {
  const m = text.match(/^\s*(daftar\s+pustaka|referensi|references|bibliography)\s*$/im);
  return m && m.index !== undefined && m.index > text.length * 0.3 ? text.slice(0, m.index) : text;
}

export function checkWriting(input: string, opts: { maxSentenceWords?: number; maxParagraphWords?: number } = {}): WritingReport {
  const text = proseOnly(input);
  const language = detectLanguage(text);
  const maxSentence = opts.maxSentenceWords ?? (language === "id" ? 40 : 35);
  const maxParagraph = opts.maxParagraphWords ?? 220;
  const findings: WritingFinding[] = [];

  // 1. Phrase rules
  for (const rule of language === "id" ? ID_RULES : EN_RULES) {
    for (const m of text.matchAll(rule.re)) {
      const ctx = contextAt(text, m.index ?? 0, m[0].length);
      // "signifikan"-style exceptions: skip overclaim/vague hits inside obviously statistical or quoted sentences.
      if (rule.category === "overclaim" && /(p\s*[<>=]|sig\.|α|alpha|signifikan(si)? \d)/i.test(ctx)) continue;
      if (/^".*"$/.test(ctx)) continue;
      findings.push({ category: rule.category, excerpt: m[0], context: ctx, message: rule.message, suggestion: rule.suggestion, index: m.index ?? 0 });
    }
  }

  // 2. Long sentences
  const sentences = sentencesOf(text);
  let totalWords = 0;
  let longCount = 0;
  for (const { s, index } of sentences) {
    const n = wordCount(s);
    totalWords += n;
    if (n > maxSentence && !/^\(?\s*[A-ZÀ-Ý][\p{L}-]+,\s*[A-Z]\./u.test(s)) {
      longCount++;
      findings.push({
        category: "long_sentence",
        excerpt: `${s.split(/\s+/).slice(0, 10).join(" ")}…`,
        context: s.length > 260 ? `${s.slice(0, 257)}…` : s,
        message: `Kalimat ${n} kata (lebih dari ${maxSentence}).`,
        suggestion: "Pertimbangkan memecahnya di batas makna yang jelas. Kalimat panjang tetap boleh bila mudah diikuti.",
        index,
      });
    }
  }

  // 3. Long paragraphs + repeated sentence openers
  const paragraphs = text.split(/\n\s*\n|\n(?=\s{2,}|\t)/).map((p) => p.trim()).filter((p) => wordCount(p) > 0);
  let cursor = 0;
  for (const p of paragraphs) {
    const index = Math.max(0, text.indexOf(p.slice(0, 40), cursor));
    cursor = index;
    const n = wordCount(p);
    if (n > maxParagraph) {
      findings.push({ category: "long_paragraph", excerpt: `${p.split(/\s+/).slice(0, 10).join(" ")}…`, context: `${p.slice(0, 200)}…`, message: `Paragraf ${n} kata.`, suggestion: "Satu paragraf idealnya membahas satu gagasan pokok. Pecah bila ada lebih dari satu gagasan.", index });
    }
    const openers = sentencesOf(p).map((x) => x.s.split(/\s+/).slice(0, 2).join(" ").toLowerCase());
    for (let i = 2; i < openers.length; i++) {
      if (openers[i] && openers[i] === openers[i - 1] && openers[i] === openers[i - 2]) {
        findings.push({ category: "repetition", excerpt: openers[i]!, context: `${p.slice(0, 200)}…`, message: `Tiga kalimat berturut-turut diawali "${openers[i]}".`, suggestion: "Variasikan susunan kalimat atau gabungkan kalimat yang berkaitan.", index });
        break;
      }
    }
  }

  // 4. Acronyms not defined at first use: "Sistem Informasi Akuntansi (SIA)" defines SIA.
  const defined = new Map<string, number>(); // acronym → offset of its definition
  for (const m of text.matchAll(/\(([A-Z][A-Za-z0-9&]{1,9}(?:[ -][A-Z0-9]{1,6})?)(?:[,;)])/g)) {
    for (const tok of m[1]!.split(/[ -]/)) if (!defined.has(tok)) defined.set(tok, m.index ?? 0);
  }
  const reported = new Set<string>();
  const ROMAN = /^(?:I{1,3}|IV|VI{0,3}|IX|X{1,3})$/;
  for (const m of text.matchAll(/(?<![\p{L}(/.%-])([A-Z]{2,5}[0-9]?)(?![\p{L}/-]|\.\p{L})/gu)) {
    const a = m[1]!;
    const at = m.index ?? 0;
    if (KNOWN_ACRONYMS.has(a) || reported.has(a) || ROMAN.test(a)) continue;
    // Skip headings and other all-caps lines ("BAB II KAJIAN PUSTAKA"), and URLs.
    const lineStart = text.lastIndexOf("\n", at) + 1;
    const lineEnd = text.indexOf("\n", at);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const letters = line.replace(/[^\p{L}]/gu, "");
    if (letters.length && (letters.replace(/[^\p{Lu}]/gu, "").length / letters.length) > 0.6) continue;
    if (/https?:\/\/\S*$/.test(text.slice(Math.max(0, at - 80), at))) continue;
    // "Ikatan Akuntan Indonesia … (IAI, 2024)": the spelled-out name earlier counts as a definition.
    const initials = new RegExp(a.split("").map((ch) => `${ch}\\p{L}+`).join("\\s+"), "u");
    const spelledBefore = initials.test(text.slice(0, at));
    const defAt = defined.get(a);
    const definedBefore = (defAt !== undefined && defAt <= at) || spelledBefore;
    if (!definedBefore) {
      reported.add(a);
      findings.push({
        category: "acronym",
        excerpt: a,
        context: contextAt(text, at, a.length),
        message: defAt !== undefined ? `"${a}" dipakai sebelum didefinisikan.` : `"${a}" tidak didefinisikan saat pertama muncul.`,
        suggestion: `Tulis kepanjangannya saat pertama muncul, mis. "Kepanjangan Lengkap (${a})", lalu pakai singkatannya.`,
        index: at,
      });
    }
  }

  // 5. Synonym cycling for a few common construct families (consistent terminology is a virtue).
  const families = language === "id" ? [["responden", "partisipan", "subjek penelitian", "narasumber"], ["perusahaan", "entitas", "organisasi", "badan usaha"]] : [["participants", "respondents", "subjects", "learners"]];
  for (const fam of families) {
    const used = fam.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(text));
    if (used.length >= 3) {
      findings.push({
        category: "synonym_cycling",
        excerpt: used.join(" / "),
        context: "",
        message: `Beberapa istilah dipakai untuk konsep yang mungkin sama: ${used.join(", ")}.`,
        suggestion: "Bila maksudnya sama, pakai satu istilah secara konsisten. Bila berbeda, definisikan perbedaannya.",
        index: text.search(new RegExp(`\\b${used[0]}\\b`, "i")),
      });
    }
  }

  findings.sort((a, b) => a.index - b.index);
  const counts: WritingReport["counts"] = {};
  for (const f of findings) counts[f.category] = (counts[f.category] ?? 0) + 1;
  return {
    findings,
    counts,
    stats: { words: totalWords, sentences: sentences.length, paragraphs: paragraphs.length, avgSentenceWords: sentences.length ? Math.round(totalWords / sentences.length) : 0, longSentences: longCount },
    language,
  };
}
