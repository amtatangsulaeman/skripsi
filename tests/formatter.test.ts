import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { htmlToBlocks, textToBlocks } from "@/lib/formatter/parse";
import { detectStructure, intToRoman, matchSection, romanToInt } from "@/lib/formatter/detect";
import { buildDocx, verifyPreservation } from "@/lib/formatter/build";
import { renderPreview } from "@/lib/formatter/preview";
import { BUILTIN_PROFILES, DEFAULT_FORMATTING, normalizeConfig } from "@/lib/formatter/profile";
import { guidelinesToConfig } from "@/lib/ai/service";

const UT = BUILTIN_PROFILES[1]!.configuration;

/** A small DOCX shaped like the sample proposal (cover, BAB 1 – BAB III, table, references). */
async function sampleDocx(): Promise<Buffer> {
  const p = (text: string, opts: { bold?: boolean; center?: boolean } = {}) =>
    new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : undefined, children: [new TextRun({ text, bold: opts.bold })] });
  const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] });
  const doc = new Document({
    sections: [
      {
        children: [
          p("METODE PENELITIAN", { center: true }),
          p("ANALISIS PENGELUARAN KAS DAN PENGENDALIAN INTERNAL UNTUK MEMINIMALISIR FRAUD DI PERUSAHAAN KONSTRUKSI", { center: true }),
          p("Oleh:", { center: true }),
          p("Elsa Triana Lianti", { center: true }),
          p("UNIVERSITAS TERBUKA", { center: true }),
          p("BAB 1", { bold: true }),
          p("PENDAHULUAN", { bold: true }),
          p("1.1. Latar Belakang", { bold: true }),
          p("Pengendalian internal berfungsi menjaga aset perusahaan dari kecurangan (fraud) dan memastikan ketersediaan informasi akuntansi yang valid (Hery, 2013)."),
          p(""),
          p("1.2. Rumusan masalah", { bold: true }),
          p("1. Bagaimana penerapan sistem pengendalian internal atas pengeluaran kas di perusahaan konstruksi?"),
          p("BAB II"),
          p("KAJIAN PUSTAKA"),
          p("1.1 Grand Theory", { bold: true }),
          p("A. Sistem Pengendalian Internal", { bold: true }),
          new Paragraph({ children: [new TextRun("Menurut Jason Dale pengendalian internal adalah melakukan pengendalian mengenai hal yang penting "), new TextRun({ text: "(Tuanakotta, 2019)", italics: true }), new TextRun(".")] }),
          p("2.2. Kajian Literatur", { bold: true }),
          p("Pengendalian internal sangat berperan penting dalam pencegahan fraud."),
          p("BAB III"),
          p("METODE PENELITIAN"),
          p("3.6 Operasional Variabel", { bold: true }),
          p("Kriteria pengelompokan nilai dapat dilihat pada tabel persentase sebagai berikut:"),
          new Table({
            rows: [
              new TableRow({ children: [cell("Presentase"), cell("Kriteria")] }),
              new TableRow({ children: [cell("81% - 100%"), cell("Penerapan sangat berhasil")] }),
            ],
          }),
          p("Daftar Pustaka", { bold: true }),
          p("Mulyadi. (2026). Sistem Akuntansi. Jakarta Selatan: Salemba Empat."),
          p("Hery. (2013). Auditing dan Asurans. Jakarta: Grasindo."),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe("helpers", () => {
  it("converts roman numerals both ways", () => {
    expect(romanToInt("III")).toBe(3);
    expect(romanToInt("IV")).toBe(4);
    expect(intToRoman(5)).toBe("V");
    expect(intToRoman(14)).toBe("XIV");
  });

  it("recognises Indonesian and English section titles", () => {
    expect(matchSection("DAFTAR PUSTAKA")).toBe("references");
    expect(matchSection("Daftar Pustaka")).toBe("references");
    expect(matchSection("KATA PENGANTAR")).toBe("acknowledgments");
    expect(matchSection("ABSTRACT")).toBe("abstract");
    expect(matchSection("LEMBAR PENGESAHAN")).toBe("approval");
    expect(matchSection("Lampiran 1")).toBe("appendices");
    expect(matchSection("Daftar pustaka menunjukkan bahwa penelitian ini…")).toBeNull();
  });

  it("normalizes partial / invalid profiles without throwing", () => {
    const c = normalizeConfig({ font: { family: "Comic Sans" }, page: { margins: { top: 3 } } });
    expect(c.font.family).toBe("Times New Roman");
    expect(c.page.margins.top).toBe(3);
  });

  it("maps AI-extracted guideline values only when explicitly present", () => {
    const { config, applied } = guidelinesToConfig(
      {
        universityName: "Universitas Terbuka",
        marginsCm: { top: 4, bottom: 3, left: 4, right: 3 },
        orientation: null,
        fontFamily: "Times New Roman",
        fontSize: 12,
        lineSpacing: 1.4,
        firstLineIndentCm: null,
        chapterNumberStyle: "roman",
        chapterFontSize: null,
        pageNumberPosition: "bottom-center",
        frontMatterRoman: true,
        figureLabel: null,
        tableLabel: null,
        referencesTitle: "DAFTAR PUSTAKA",
        referenceLineSpacing: null,
        requiredSections: ["cover", "chapter1", "bogus"],
        otherRules: ["Sitasi APA edisi 7"],
      },
      DEFAULT_FORMATTING,
    );
    expect(config.paragraph.lineSpacing).toBe(1.5); // nearest allowed value
    expect(config.paragraph.firstLineIndentCm).toBe(DEFAULT_FORMATTING.paragraph.firstLineIndentCm); // untouched (null)
    expect(config.requiredSections).toEqual(["cover", "chapter1"]);
    expect(config.notes).toContain("APA");
    expect(applied.length).toBeGreaterThan(5);
  });
});

describe("structure detection on plain text", () => {
  it("detects chapters with titles on the next line and renumbers wrong subheadings", () => {
    const blocks = textToBlocks(["BAB 1", "PENDAHULUAN", "1.1. Latar Belakang", "Isi latar belakang.", "BAB II", "KAJIAN PUSTAKA", "1.1 Grand Theory", "Isi teori.", "DAFTAR PUSTAKA", "Hery. (2013). Auditing."].join("\n\n"));
    const doc = detectStructure(blocks, UT, "txt");
    const keys = doc.sections.map((s) => s.key);
    expect(keys).toEqual(["chapter1", "chapter2", "references"]);
    expect(doc.sections[0]!.title).toBe("PENDAHULUAN");
    expect(doc.changes.some((c) => c.includes('"1.1 Grand Theory"') && c.includes("2.1"))).toBe(true);
  });

  it("never numbers a subheading x.0.y when its parent level is missing", () => {
    const blocks = textToBlocks(["BAB I", "PENDAHULUAN", "1.1.1 Latar Belakang", "Isi.", "1.1.2 Rumusan Masalah", "Isi.", "1.2 Tujuan", "Isi.", "1.2.1 Tujuan Umum", "Isi."].join("\n\n"));
    const doc = detectStructure(blocks, UT, "txt");
    const numbers = doc.sections[0]!.blocks.flatMap((b) => (b.type === "paragraph" && b.role.kind === "subheading" ? [b.role.number] : []));
    expect(numbers).toEqual(["1.1", "1.2", "1.3", "1.3.1"]);
    expect(numbers.some((n) => n.includes(".0"))).toBe(false);
  });

  it("continues list numbering interrupted by paragraphs, but restarts after an intro ending in ':'", () => {
    const html = [
      "<p>BAB III</p><p>METODE PENELITIAN</p>",
      "<p>Teknik pengumpulan data yang digunakan:</p>",
      "<ol><li>Wawancara</li></ol><p>Wawancara dilakukan kepada direktur.</p>",
      "<ol><li>Observasi</li></ol><p>Observasi dilakukan dengan mengamati kegiatan.</p>",
      "<ol><li>Dokumentasi</li><li>Studi pustaka</li></ol><p>Dokumen dikumpulkan.</p>",
      "<p>Tahapan analisis data adalah sebagai berikut:</p>",
      "<ol><li>Reduksi data</li></ol><p>Isi.</p><ol><li>Penyajian data</li></ol>",
    ].join("");
    const doc = detectStructure(htmlToBlocks(html), UT, "docx");
    const markers = doc.sections[0]!.blocks.flatMap((b) => (b.type === "paragraph" && b.role.kind === "listItem" ? [b.role.marker] : []));
    expect(markers).toEqual(["1.", "2.", "3.", "4.", "1.", "2."]);
    expect(doc.changes.some((c) => c.includes("dinomori lanjut"))).toBe(true);
  });

  it("warns about missing required sections and out-of-order chapters", () => {
    const blocks = textToBlocks(["BAB I", "PENDAHULUAN", "Teks.", "BAB III", "METODE", "Teks."].join("\n\n"));
    const doc = detectStructure(blocks, DEFAULT_FORMATTING, "txt");
    const msgs = doc.warnings.map((w) => w.message).join("\n");
    expect(msgs).toContain("Daftar Pustaka");
    expect(msgs).toContain("BAB I diikuti BAB III");
  });
});

describe("end-to-end DOCX formatting (sample-like proposal)", () => {
  it("parses, validates, previews and exports without losing content", async () => {
    const input = await sampleDocx();
    const { value: html } = await mammoth.convertToHtml({ buffer: input });
    const blocks = htmlToBlocks(html);
    const doc = detectStructure(blocks, UT, "docx");

    expect(doc.sections.map((s) => s.key)).toEqual(["cover", "chapter1", "chapter2", "chapter3", "references"]);
    expect(doc.sourceStats.tables).toBe(1);
    // Table without caption in BAB III is reported, not silently fixed.
    expect(doc.warnings.some((w) => w.message.includes("Tabel tanpa judul") && w.message.includes("BAB III"))).toBe(true);
    // Lettered sub-point keeps its letter; wrong "1.1" in BAB II is renumbered.
    const bab2 = doc.sections[2]!;
    const subs = bab2.blocks.flatMap((b) => (b.type === "paragraph" && b.role.kind === "subheading" ? [b.role.number] : []));
    expect(subs).toEqual(["2.1", "A", "2.2"]);
    // Italic citation run survives parsing.
    const para = bab2.blocks.find((b) => b.type === "paragraph" && b.role.kind === "body");
    expect(para && para.type === "paragraph" && para.runs.some((r) => r.italic && r.text.includes("Tuanakotta"))).toBe(true);

    const pages = renderPreview(doc, UT);
    expect(pages[0]!.label).toBe("Sampul");
    expect(pages.map((p) => p.label).join("|")).toContain("BAB II KAJIAN PUSTAKA");

    const { buffer, emitted, unsupportedImages } = await buildDocx(doc, UT, { title: "Sampel" });
    expect(verifyPreservation(doc.sourceStats, emitted, doc, unsupportedImages)).toEqual([]);
    expect(emitted.tables).toBe(1);

    // Re-read the generated DOCX: all text is present and chapter labels follow the profile.
    const { value: outText } = await mammoth.extractRawText({ buffer });
    for (const needle of ["BAB I", "PENDAHULUAN", "BAB II", "2.1 Grand Theory", "A. Sistem Pengendalian Internal", "(Hery, 2013)", "Penerapan sangat berhasil", "Salemba Empat", "Elsa Triana Lianti"]) {
      expect(outText).toContain(needle);
    }
    const { value: outHtml } = await mammoth.convertToHtml({ buffer });
    expect(outHtml).toContain("<h1>BAB I<br />PENDAHULUAN</h1>");
    expect(outHtml).toMatch(/<h2>1\.1 (<strong>)?Latar Belakang/);
    expect(outHtml).toMatch(/<h3>A\. (<strong>)?Sistem Pengendalian Internal/);
    expect(outHtml).not.toContain("<thead>"); // source table had no header row
  });
});
