// Renders the structured, formatted document as HTML that mimics the DOCX output (for on-screen preview).
import type { FBlock, Run, StructuredDoc } from "./model";
import { runsText } from "./model";
import { chapterLabel } from "./detect";
import type { FormattingConfig } from "./profile";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runsHtml(runs: Run[]) {
  return runs
    .map((r) => {
      let h = esc(r.text);
      if (r.bold) h = `<b>${h}</b>`;
      if (r.italic) h = `<i>${h}</i>`;
      if (r.underline) h = `<u>${h}</u>`;
      if (r.sup) h = `<sup>${h}</sup>`;
      if (r.sub) h = `<sub>${h}</sub>`;
      return (r.br ? "<br>" : "") + h;
    })
    .join("");
}

const FRONT = ["approval", "declaration", "abstract", "acknowledgments", "toc", "lof", "lot"];

export type PreviewPage = { key: string; label: string; html: string; pageNumberStyle: "none" | "roman" | "arabic" };

export function renderPreview(doc: StructuredDoc, config: FormattingConfig): PreviewPage[] {
  const p = config.paragraph;
  const ls = p.lineSpacing * 1.15; // CSS line-height approximation of Word "multiple" spacing
  const bodyStyle = `text-align:${p.alignment};text-indent:${p.firstLineIndentCm}cm;line-height:${ls};margin:${p.spacingBeforePt}pt 0 ${p.spacingAfterPt}pt`;
  const h1Style = `text-align:${config.headings.chapterAlign};font-weight:bold;font-size:${config.headings.chapterFontSize}pt;margin:0 0 18pt;line-height:${ls}`;
  const subStyle = `font-weight:${config.headings.subheadingBold ? "bold" : "normal"};font-size:${config.headings.subheadingFontSize}pt;margin:12pt 0 6pt;line-height:${ls}`;
  const caseOf = (t: string) => (config.headings.chapterTitleUppercase ? t.toUpperCase() : t);

  const block = (b: FBlock, center = false): string => {
    if (b.type === "image") return `<img src="data:${esc(b.contentType)};base64,${b.base64}" alt="${esc(b.alt ?? "")}">`;
    if (b.type === "table") {
      const rows = b.rows
        .map(
          (r) =>
            `<tr>${r.cells
              .map((c) => {
                const tag = c.header ? "th" : "td";
                const span = `${c.colSpan ? ` colspan="${c.colSpan}"` : ""}${c.rowSpan ? ` rowspan="${c.rowSpan}"` : ""}`;
                return `<${tag}${span}>${c.paragraphs.map(runsHtml).join("<br>")}</${tag}>`;
              })
              .join("")}</tr>`,
        )
        .join("");
      return `<table>${rows}</table>`;
    }
    const role = b.role;
    switch (role.kind) {
      case "subheading": {
        const indent = role.level === 2 ? 0 : role.level === 3 ? 0.5 : 1;
        const num = role.number ? `${esc(role.number)}${/^[A-Z]$/.test(role.number) ? "." : ""} ` : "";
        return `<p data-changed="heading" style="${subStyle};margin-left:${indent}cm">${num}${runsHtml(role.title)}</p>`;
      }
      case "caption": {
        const label = role.captionType === "figure" ? config.captions.figureLabel : config.captions.tableLabel;
        return `<p data-changed="caption" style="text-align:center;line-height:1.15;margin:6pt 0"><b>${esc(label)} ${esc(role.number)}</b> ${runsHtml(role.title)}</p>`;
      }
      case "reference": {
        const h = config.references.hangingIndentCm;
        return `<p style="padding-left:${h}cm;text-indent:-${h}cm;line-height:${config.references.lineSpacing * 1.15};margin:0 0 ${config.references.spacingAfterPt}pt;text-align:${p.alignment}">${runsHtml(b.runs)}</p>`;
      }
      case "listItem": {
        const left = 0.75 * (role.level + 1);
        return `<p style="padding-left:${left}cm;text-indent:-0.75cm;line-height:${ls};text-align:${p.alignment};margin:${p.spacingBeforePt}pt 0 ${p.spacingAfterPt}pt">${role.marker ? `<span style="display:inline-block;width:0.75cm;text-indent:0">${esc(role.marker)}</span>` : ""}${runsHtml(b.runs)}</p>`;
      }
      default:
        return center
          ? `<p style="text-align:center;line-height:1.3;margin:0 0 8pt">${runsHtml(b.runs)}</p>`
          : `<p style="${bodyStyle}">${runsHtml(b.runs)}</p>`;
    }
  };

  const pages: PreviewPage[] = [];
  const front = config.pagination.frontMatter === "lowerRoman" ? "roman" : "none";
  for (const s of doc.sections) {
    let html = "";
    if (s.key === "cover") {
      html = s.blocks.map((b) => block(b, true)).join("");
      pages.push({ key: "cover", label: "Sampul", html, pageNumberStyle: "none" });
      continue;
    }
    if (s.chapterNumber !== undefined) {
      html += `<p data-changed="heading" style="${h1Style}">${esc(chapterLabel(s.chapterNumber, config))}<br>${esc(caseOf(s.title))}</p>`;
    } else {
      const title = s.key === "references" ? config.references.title : s.title;
      html += `<p data-changed="heading" style="${h1Style}">${esc(caseOf(title))}</p>`;
    }
    if (s.generated) {
      html += `<p style="text-align:center;color:#6b7280;font-style:italic;font-size:10pt">[Daftar otomatis Word — terisi saat dokumen dibuka dan field diperbarui]</p>`;
    } else {
      html += s.blocks.map((b) => block(b)).join("");
    }
    const label = s.chapterNumber !== undefined ? `${chapterLabel(s.chapterNumber, config)} ${s.title}` : s.key === "references" ? config.references.title : s.title;
    pages.push({ key: `${s.key}-${pages.length}`, label, html, pageNumberStyle: FRONT.includes(s.key) ? front : "arabic" });
  }
  return pages;
}

export function outline(doc: StructuredDoc, config: FormattingConfig) {
  return doc.sections.map((s) => ({
    key: s.key,
    title: s.chapterNumber !== undefined ? `${chapterLabel(s.chapterNumber, config)} ${s.title}` : s.title,
    blocks: s.blocks.length,
    subheadings: s.blocks
      .filter((b) => b.type === "paragraph" && b.role.kind === "subheading")
      .map((b) => (b.type === "paragraph" && b.role.kind === "subheading" ? `${b.role.number} ${runsText(b.role.title)}`.trim() : "")),
    generated: !!s.generated,
  }));
}
