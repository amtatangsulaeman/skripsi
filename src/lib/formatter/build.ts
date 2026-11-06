import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LineRuleType,
  NumberFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  StyleLevel,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from "docx";
import type { DocStats, FBlock, Run, Section, StructuredDoc } from "./model";
import { runsText } from "./model";
import { chapterLabel } from "./detect";
import { imageSize, imageTypeFromMime } from "./image-size";
import type { FormattingConfig } from "./profile";

const TWIP_PER_CM = 566.93;
const cm = (v: number) => Math.round(v * TWIP_PER_CM);
const line = (spacing: number) => ({ line: Math.round(240 * spacing), lineRule: LineRuleType.AUTO });

const FRONT_KEYS = new Set(["approval", "declaration", "abstract", "acknowledgments", "toc", "lof", "lot"]);
const FIG_STYLE = "FigureCaption";
const TAB_STYLE = "TableCaption";

export type BuildResult = { buffer: Buffer; emitted: DocStats; unsupportedImages: number };

export async function buildDocx(doc: StructuredDoc, config: FormattingConfig, meta: { title: string }): Promise<BuildResult> {
  const font = config.font.family;
  const size = config.font.size * 2; // half-points
  const emitted: DocStats = { words: 0, tables: 0, images: 0, citations: 0, paragraphs: 0 };
  let unsupportedImages = 0;
  const contentWidthCm =
    (config.page.orientation === "portrait" ? 21 : 29.7) - config.page.margins.left - config.page.margins.right;
  const maxImgPx = Math.round((contentWidthCm / 2.54) * 96);

  const countText = (t: string) => {
    if (!t.trim()) return;
    emitted.words += t.trim().split(/\s+/).length;
  };

  const toRuns = (runs: Run[], extra: { bold?: boolean; size?: number } = {}) =>
    runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: extra.bold ?? r.bold,
          italics: r.italic,
          underline: r.underline ? {} : undefined,
          superScript: r.sup,
          subScript: r.sub,
          break: r.br ? 1 : undefined,
          size: extra.size,
        }),
    );

  const bodySpacing = {
    ...line(config.paragraph.lineSpacing),
    before: config.paragraph.spacingBeforePt * 20,
    after: config.paragraph.spacingAfterPt * 20,
  };
  const align = config.paragraph.alignment === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;

  const sectionHeading = (title: string, pageBreak: boolean) => (countText(title),
    new Paragraph({ style: "Heading1", pageBreakBefore: pageBreak, children: [new TextRun(config.headings.chapterTitleUppercase ? title.toUpperCase() : title)] }));

  function renderBlock(b: FBlock, ctx: { center?: boolean }): (Paragraph | Table)[] {
    if (b.type === "image") {
      const type = imageTypeFromMime(b.contentType);
      const data = Buffer.from(b.base64, "base64");
      if (!type) {
        unsupportedImages++;
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `[Gambar format ${b.contentType} tidak dapat dikonversi — sisipkan ulang dari dokumen asli]`, italics: true, color: "C00000" })],
          }),
        ];
      }
      const dim = imageSize(data, type) ?? { width: 480, height: 320 };
      const scale = Math.min(1, maxImgPx / dim.width);
      emitted.images++;
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 60 },
          keepNext: true,
          children: [new ImageRun({ type, data, transformation: { width: Math.round(dim.width * scale), height: Math.round(dim.height * scale) } })],
        }),
      ];
    }

    if (b.type === "table") {
      emitted.tables++;
      const rows = b.rows.map(
        (r, ri) =>
          new TableRow({
            // Only set when true: docx emits <w:tblHeader w:val="false"/> otherwise, which some readers treat as a header row.
            tableHeader: ri === 0 && r.cells.some((c) => c.header) ? true : undefined,
            children: r.cells.map((c) => {
              c.paragraphs.forEach((p) => countText(runsText(p)));
              return new TableCell({
                columnSpan: c.colSpan,
                rowSpan: c.rowSpan,
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: (c.paragraphs.length ? c.paragraphs : [[]]).map(
                  (p) => new Paragraph({ spacing: line(1), children: toRuns(p, { bold: c.header ? true : undefined, size: Math.max(16, size - 2) }) }),
                ),
              });
            }),
          }),
      );
      const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows,
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }

    const role = b.role;
    const text = runsText(b.runs);
    emitted.paragraphs++;

    if (role.kind === "subheading") {
      countText(runsText(role.title) + (role.number ? ` ${role.number}` : ""));
      const style = role.level === 2 ? "Heading2" : role.level === 3 ? "Heading3" : "Heading4";
      const prefix = role.number ? `${role.number}${/^[A-Z]$/.test(role.number) ? "." : ""} ` : "";
      return [new Paragraph({ style, children: [new TextRun(prefix), ...toRuns(role.title, { bold: config.headings.subheadingBold ? true : undefined })] })];
    }
    if (role.kind === "caption") {
      const label = role.captionType === "figure" ? config.captions.figureLabel : config.captions.tableLabel;
      countText(`${label} ${role.number} ${runsText(role.title)}`);
      return [
        new Paragraph({
          style: role.captionType === "figure" ? FIG_STYLE : TAB_STYLE,
          keepNext: role.captionType === "table",
          children: [new TextRun({ text: `${label} ${role.number} `, bold: true }), ...toRuns(role.title)],
        }),
      ];
    }
    countText(text);
    if (role.kind === "reference") {
      return [
        new Paragraph({
          alignment: align,
          indent: { left: cm(config.references.hangingIndentCm), hanging: cm(config.references.hangingIndentCm) },
          spacing: { ...line(config.references.lineSpacing), after: config.references.spacingAfterPt * 20 },
          children: toRuns(b.runs),
        }),
      ];
    }
    if (role.kind === "listItem") {
      const left = 0.75 * (role.level + 1);
      return [
        new Paragraph({
          alignment: align,
          indent: { left: cm(left), hanging: cm(0.75) },
          spacing: bodySpacing,
          children: role.marker ? [new TextRun(`${role.marker}\t`), ...toRuns(b.runs)] : toRuns(b.runs),
          tabStops: [{ type: "left", position: cm(left) }],
        }),
      ];
    }
    return [
      new Paragraph({
        alignment: ctx.center ? AlignmentType.CENTER : align,
        indent: ctx.center ? undefined : { firstLine: cm(config.paragraph.firstLineIndentCm) },
        spacing: ctx.center ? { ...line(1.15), after: 120 } : bodySpacing,
        children: toRuns(b.runs),
      }),
    ];
  }

  // ---- Page setup & numbering ----
  const pageProps = (format?: (typeof NumberFormat)[keyof typeof NumberFormat]) => ({
    page: {
      size: { width: 11906, height: 16838, orientation: config.page.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
      margin: { top: cm(config.page.margins.top), bottom: cm(config.page.margins.bottom), left: cm(config.page.margins.left), right: cm(config.page.margins.right), header: cm(1.25), footer: cm(1.25) },
      ...(format ? { pageNumbers: { start: 1, formatType: format } } : {}),
    },
  });

  const numberParagraph = (alignment: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new Paragraph({ alignment, children: [new TextRun({ children: [PageNumber.CURRENT] })] });

  const headersFooters = (numbered: boolean) => {
    const pos = config.pagination.position;
    const headerChildren: Paragraph[] = [];
    const footerChildren: Paragraph[] = [];
    if (config.headerText) headerChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: config.headerText, size: size - 4 })] }));
    if (numbered && pos === "top-right") headerChildren.push(numberParagraph(AlignmentType.RIGHT));
    if (numbered && pos !== "top-right") footerChildren.push(numberParagraph(pos === "bottom-center" ? AlignmentType.CENTER : AlignmentType.RIGHT));
    if (config.footerText) footerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: config.footerText, size: size - 4 })] }));
    return {
      headers: { default: new Header({ children: headerChildren }) },
      footers: { default: new Footer({ children: footerChildren }) },
    };
  };

  // ---- Assemble sections ----
  const cover = doc.sections.filter((s) => s.key === "cover");
  const front = doc.sections.filter((s) => FRONT_KEYS.has(s.key));
  const body = doc.sections.filter((s) => s.key !== "cover" && !FRONT_KEYS.has(s.key));

  // Generated lists are inserted (once) even if the source had no manual TOC.
  const frontOrder = ["approval", "declaration", "abstract", "acknowledgments", "toc", "lof", "lot"];
  const ensure = (key: Section["key"], on: boolean, title: string) => {
    if (on && !front.some((s) => s.key === key)) front.push({ key, title, blocks: [], generated: true });
  };
  ensure("toc", config.toc.include, "DAFTAR ISI");
  ensure("lof", config.toc.includeListOfFigures && doc.sections.some((s) => s.blocks.some((b) => b.type === "paragraph" && b.role.kind === "caption" && b.role.captionType === "figure")), "DAFTAR GAMBAR");
  ensure("lot", config.toc.includeListOfTables && doc.sections.some((s) => s.blocks.some((b) => b.type === "paragraph" && b.role.kind === "caption" && b.role.captionType === "table")), "DAFTAR TABEL");
  front.sort((a, b) => frontOrder.indexOf(a.key) - frontOrder.indexOf(b.key));

  const docSections: ISectionOptions[] = [];

  if (cover.length) {
    docSections.push({
      properties: pageProps(),
      children: cover.flatMap((s) => s.blocks.flatMap((b) => renderBlock(b, { center: true }))),
    });
  }

  if (front.length) {
    const children: (Paragraph | Table | TableOfContents)[] = [];
    front.forEach((s, idx) => {
      children.push(sectionHeading(s.title, idx > 0));
      if (s.key === "toc") children.push(new TableOfContents("Daftar Isi", { hyperlink: true, headingStyleRange: "1-3" }));
      else if (s.key === "lof") children.push(new TableOfContents("Daftar Gambar", { hyperlink: true, stylesWithLevels: [new StyleLevel(FIG_STYLE, 1)] }));
      else if (s.key === "lot") children.push(new TableOfContents("Daftar Tabel", { hyperlink: true, stylesWithLevels: [new StyleLevel(TAB_STYLE, 1)] }));
      else children.push(...s.blocks.flatMap((b) => renderBlock(b, {})));
    });
    const numbered = config.pagination.frontMatter === "lowerRoman";
    docSections.push({ properties: pageProps(numbered ? NumberFormat.LOWER_ROMAN : undefined), ...headersFooters(numbered), children });
  }

  const bodyChildren: (Paragraph | Table)[] = [];
  body.forEach((s, idx) => {
    const pageBreak = idx > 0 && (config.headings.chapterPageBreak || s.chapterNumber === undefined);
    if (s.chapterNumber !== undefined) {
      const title = config.headings.chapterTitleUppercase ? s.title.toUpperCase() : s.title;
      countText(`${chapterLabel(s.chapterNumber, config)} ${title}`);
      bodyChildren.push(
        new Paragraph({
          style: "Heading1",
          pageBreakBefore: pageBreak,
          children: [new TextRun(chapterLabel(s.chapterNumber, config)), ...(title ? [new TextRun({ text: title, break: 1 })] : [])],
        }),
      );
    } else {
      const title = s.key === "references" ? config.references.title : s.title;
      bodyChildren.push(sectionHeading(title, pageBreak));
    }
    for (const b of s.blocks) bodyChildren.push(...renderBlock(b, {}));
  });
  if (bodyChildren.length) {
    docSections.push({ properties: pageProps(NumberFormat.DECIMAL), ...headersFooters(true), children: bodyChildren });
  }

  const heading = (id: string, name: string, sz: number, outline: number, alignment: (typeof AlignmentType)[keyof typeof AlignmentType], bold = true) => ({
    id,
    name,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: { bold, size: sz * 2, font },
    paragraph: { alignment, outlineLevel: outline, keepNext: true, keepLines: true, spacing: { ...line(config.paragraph.lineSpacing), before: outline === 0 ? 0 : 240, after: outline === 0 ? 360 : 120 } },
  });

  const document = new Document({
    creator: "ThesisMate",
    title: meta.title,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing: line(config.paragraph.lineSpacing) } },
      },
      paragraphStyles: [
        heading("Heading1", "Heading 1", config.headings.chapterFontSize, 0, config.headings.chapterAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT),
        heading("Heading2", "Heading 2", config.headings.subheadingFontSize, 1, AlignmentType.LEFT, config.headings.subheadingBold),
        heading("Heading3", "Heading 3", config.headings.subheadingFontSize, 2, AlignmentType.LEFT, config.headings.subheadingBold),
        heading("Heading4", "Heading 4", config.headings.subheadingFontSize, 3, AlignmentType.LEFT, config.headings.subheadingBold),
        { id: FIG_STYLE, name: FIG_STYLE, basedOn: "Normal", next: "Normal", run: { font, size }, paragraph: { alignment: AlignmentType.CENTER, spacing: { ...line(1), before: 60, after: 240 } } },
        { id: TAB_STYLE, name: TAB_STYLE, basedOn: "Normal", next: "Normal", run: { font, size }, paragraph: { alignment: AlignmentType.CENTER, spacing: { ...line(1), before: 240, after: 120 } } },
      ],
    },
    sections: docSections.length ? docSections : [{ properties: pageProps(), children: [new Paragraph("")] }],
  });

  const buffer = await Packer.toBuffer(document);
  return { buffer, emitted, unsupportedImages };
}

/** Compare what went in with what came out. Any loss is reported as an error before export. */
export function verifyPreservation(source: DocStats, emitted: DocStats, doc: StructuredDoc, unsupportedImages: number) {
  const problems: string[] = [];
  // Words removed by design (manual TOC/LOF/LOT lines, PDF page-number lines) are listed in `changes`.
  const minWords = Math.floor((source.words - doc.droppedWords) * 0.995);
  if (emitted.words < minWords) {
    problems.push(`Jumlah kata berkurang: ${source.words} → ${emitted.words}.`);
  }
  if (emitted.tables < source.tables) problems.push(`Jumlah tabel berkurang: ${source.tables} → ${emitted.tables}.`);
  if (emitted.images + unsupportedImages < source.images) problems.push(`Jumlah gambar berkurang: ${source.images} → ${emitted.images}.`);
  if (unsupportedImages) problems.push(`${unsupportedImages} gambar berformat khusus (mis. EMF/WMF) diganti penanda merah — sisipkan ulang secara manual.`);
  return problems;
}
