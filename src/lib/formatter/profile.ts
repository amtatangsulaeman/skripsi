import { z } from "zod";

export const SECTION_KEYS = [
  "cover",
  "approval",
  "declaration",
  "abstract",
  "acknowledgments",
  "toc",
  "lof",
  "lot",
  "chapter1",
  "chapter2",
  "chapter3",
  "chapter4",
  "chapter5",
  "references",
  "appendices",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  cover: "Sampul (Cover)",
  approval: "Lembar Pengesahan",
  declaration: "Pernyataan Keaslian",
  abstract: "Abstrak",
  acknowledgments: "Kata Pengantar",
  toc: "Daftar Isi",
  lof: "Daftar Gambar",
  lot: "Daftar Tabel",
  chapter1: "BAB I",
  chapter2: "BAB II",
  chapter3: "BAB III",
  chapter4: "BAB IV",
  chapter5: "BAB V",
  references: "Daftar Pustaka",
  appendices: "Lampiran",
};

const cm = z.number().min(0).max(10);

export const formattingConfigSchema = z.object({
  page: z
    .object({
      size: z.literal("A4").default("A4"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      margins: z
        .object({ top: cm.default(4), bottom: cm.default(3), left: cm.default(4), right: cm.default(3) })
        .default({ top: 4, bottom: 3, left: 4, right: 3 }),
    })
    .default({ size: "A4", orientation: "portrait", margins: { top: 4, bottom: 3, left: 4, right: 3 } }),
  font: z
    .object({
      family: z.enum(["Times New Roman", "Arial"]).default("Times New Roman"),
      size: z.number().min(8).max(16).default(12),
    })
    .default({ family: "Times New Roman", size: 12 }),
  paragraph: z
    .object({
      lineSpacing: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).default(1.5),
      alignment: z.enum(["justify", "left"]).default("justify"),
      firstLineIndentCm: cm.default(1.25),
      spacingBeforePt: z.number().min(0).max(36).default(0),
      spacingAfterPt: z.number().min(0).max(36).default(0),
    })
    .default({ lineSpacing: 1.5, alignment: "justify", firstLineIndentCm: 1.25, spacingBeforePt: 0, spacingAfterPt: 0 }),
  headings: z
    .object({
      chapterNumberStyle: z.enum(["roman", "arabic"]).default("roman"),
      chapterFontSize: z.number().min(10).max(18).default(14),
      chapterAlign: z.enum(["center", "left"]).default("center"),
      chapterTitleUppercase: z.boolean().default(true),
      chapterPageBreak: z.boolean().default(true),
      subheadingNumbering: z.boolean().default(true),
      subheadingFontSize: z.number().min(10).max(16).default(12),
      subheadingBold: z.boolean().default(true),
    })
    .default({
      chapterNumberStyle: "roman",
      chapterFontSize: 14,
      chapterAlign: "center",
      chapterTitleUppercase: true,
      chapterPageBreak: true,
      subheadingNumbering: true,
      subheadingFontSize: 12,
      subheadingBold: true,
    }),
  pagination: z
    .object({
      frontMatter: z.enum(["lowerRoman", "none"]).default("lowerRoman"),
      body: z.literal("decimal").default("decimal"),
      position: z.enum(["bottom-center", "bottom-right", "top-right"]).default("bottom-center"),
    })
    .default({ frontMatter: "lowerRoman", body: "decimal", position: "bottom-center" }),
  headerText: z.string().max(200).default(""),
  footerText: z.string().max(200).default(""),
  captions: z
    .object({
      figureLabel: z.string().max(20).default("Gambar"),
      tableLabel: z.string().max(20).default("Tabel"),
      numbering: z.enum(["chapter", "sequential"]).default("chapter"),
    })
    .default({ figureLabel: "Gambar", tableLabel: "Tabel", numbering: "chapter" }),
  references: z
    .object({
      title: z.string().max(60).default("DAFTAR PUSTAKA"),
      hangingIndentCm: cm.default(1.25),
      lineSpacing: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).default(1),
      spacingAfterPt: z.number().min(0).max(36).default(12),
      sortAlphabetically: z.boolean().default(false),
    })
    .default({ title: "DAFTAR PUSTAKA", hangingIndentCm: 1.25, lineSpacing: 1, spacingAfterPt: 12, sortAlphabetically: false }),
  toc: z
    .object({
      include: z.boolean().default(true),
      includeListOfFigures: z.boolean().default(true),
      includeListOfTables: z.boolean().default(true),
    })
    .default({ include: true, includeListOfFigures: true, includeListOfTables: true }),
  requiredSections: z
    .array(z.enum(SECTION_KEYS))
    .default(["cover", "abstract", "toc", "chapter1", "chapter2", "chapter3", "chapter4", "chapter5", "references"]),
  notes: z.string().max(4000).default(""),
});

export type FormattingConfig = z.infer<typeof formattingConfigSchema>;

export const DEFAULT_FORMATTING: FormattingConfig = formattingConfigSchema.parse({});

/** Deep-merge a partial (e.g. AI-extracted) config over defaults, then validate. Invalid parts fall back to defaults. */
export function normalizeConfig(input: unknown): FormattingConfig {
  const parsed = formattingConfigSchema.safeParse(input ?? {});
  if (parsed.success) return parsed.data;
  // Drop invalid top-level keys one by one so one bad value does not discard the whole profile.
  const obj = (typeof input === "object" && input ? { ...(input as Record<string, unknown>) } : {}) as Record<string, unknown>;
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete obj[key];
  }
  const retry = formattingConfigSchema.safeParse(obj);
  return retry.success ? retry.data : DEFAULT_FORMATTING;
}

/** Built-in starting profiles (seeded once; fully editable afterwards). */
export const BUILTIN_PROFILES: { universityName: string; configuration: FormattingConfig }[] = [
  {
    universityName: "Umum — Pedoman skripsi Indonesia (4-3-3-3)",
    configuration: DEFAULT_FORMATTING,
  },
  {
    // Approximated from a sample proposal that the campus accepted (Universitas Terbuka, FEB Akuntansi).
    // Measured from the PDF; verify against the official guideline before final submission.
    universityName: "Universitas Terbuka — Proposal/Metode Penelitian (contoh)",
    configuration: normalizeConfig({
      page: { size: "A4", orientation: "portrait", margins: { top: 3, bottom: 2.5, left: 3.5, right: 2.5 } },
      font: { family: "Times New Roman", size: 12 },
      paragraph: { lineSpacing: 1.15, alignment: "justify", firstLineIndentCm: 1, spacingBeforePt: 0, spacingAfterPt: 6 },
      headings: {
        chapterNumberStyle: "roman",
        chapterFontSize: 12,
        chapterAlign: "center",
        chapterTitleUppercase: true,
        chapterPageBreak: true,
        subheadingNumbering: true,
        subheadingFontSize: 12,
        subheadingBold: true,
      },
      pagination: { frontMatter: "none", body: "decimal", position: "bottom-center" },
      references: { title: "Daftar Pustaka", hangingIndentCm: 1.25, lineSpacing: 1, spacingAfterPt: 8, sortAlphabetically: false },
      toc: { include: false, includeListOfFigures: false, includeListOfTables: false },
      requiredSections: ["cover", "chapter1", "chapter2", "chapter3", "references"],
      notes:
        "Diturunkan dari contoh proposal yang diterima kampus (nilai 94, similarity 7%). Sampul: judul, logo UT, 'Oleh:', nama, jurusan, fakultas, universitas, kota & tahun — rata tengah. Judul bab: 'BAB I' + nama bab di baris berikutnya, rata tengah. Subbab bernomor (1.1, 1.2) tebal rata kiri; sub-poin A., B. tebal. Nomor halaman di tengah bawah.",
    }),
  },
];
