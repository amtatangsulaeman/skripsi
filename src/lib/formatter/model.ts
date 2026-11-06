import type { SectionKey } from "./profile";

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** Line break before this run's text. */
  br?: boolean;
};

export type ListInfo = { ordered: boolean; level: number; index: number };

export type ParagraphBlock = {
  type: "paragraph";
  runs: Run[];
  /** Heading level from the source DOCX style (Heading 1 → 1), if any. */
  headingLevel?: number;
  list?: ListInfo;
};

export type TableCellData = { paragraphs: Run[][]; colSpan?: number; rowSpan?: number; header?: boolean };
export type TableBlock = { type: "table"; rows: { cells: TableCellData[] }[] };
export type ImageBlock = { type: "image"; contentType: string; base64: string; alt?: string };

export type Block = ParagraphBlock | TableBlock | ImageBlock;

/** Role assigned during structure detection. */
export type Role =
  | { kind: "body" }
  | { kind: "listItem"; marker: string; level: number }
  | { kind: "subheading"; level: 2 | 3 | 4; number: string; title: Run[] }
  | { kind: "caption"; captionType: "figure" | "table"; number: string; title: Run[] }
  | { kind: "reference" };

export type FBlock =
  | (ParagraphBlock & { role: Role })
  | (TableBlock & { role: { kind: "table" } })
  | (ImageBlock & { role: { kind: "image" } });

export type SectionKind = SectionKey | "chapter";

export type Section = {
  key: SectionKind;
  /** Display title (e.g. "PENDAHULUAN", "ABSTRAK"). */
  title: string;
  chapterNumber?: number;
  /** Generated sections (toc/lof/lot) have their manual content replaced by Word fields. */
  generated?: boolean;
  blocks: FBlock[];
};

export type DocStats = { words: number; tables: number; images: number; citations: number; paragraphs: number };

export type StructuredDoc = {
  sections: Section[];
  changes: string[];
  warnings: { level: "info" | "warning" | "error"; message: string }[];
  sourceStats: DocStats;
  /** Words intentionally not carried over (replaced manual TOC lines, PDF page numbers). */
  droppedWords: number;
  sourceKind: "docx" | "pdf" | "txt";
};

export const runsText = (runs: Run[]) => runs.map((r) => (r.br ? "\n" : "") + r.text).join("");
