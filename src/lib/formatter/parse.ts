// DOCX (via mammoth HTML) or plain text → flat list of content blocks.
import { parse, HTMLElement, TextNode, type Node } from "node-html-parser";
import type { Block, ListInfo, Run, TableBlock, TableCellData } from "./model";

type Fmt = Omit<Run, "text" | "br">;

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Collect inline runs; images inside a paragraph are split out as separate blocks. */
function collectInline(node: Node, fmt: Fmt, runs: Run[], images: Block[], pendingBreak: { v: boolean }) {
  if (node instanceof TextNode) {
    const text = decode(node.rawText);
    if (text) {
      runs.push({ text, ...fmt, ...(pendingBreak.v ? { br: true } : {}) });
      pendingBreak.v = false;
    }
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName?.toLowerCase();
  if (tag === "br") {
    pendingBreak.v = true;
    return;
  }
  if (tag === "img") {
    const src = node.getAttribute("src") ?? "";
    const m = src.match(/^data:([^;]+);base64,(.*)$/);
    if (m) images.push({ type: "image", contentType: m[1]!, base64: m[2]!, alt: node.getAttribute("alt") ?? undefined });
    return;
  }
  const next: Fmt = { ...fmt };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "sup") next.sup = true;
  if (tag === "sub") next.sub = true;
  for (const child of node.childNodes) collectInline(child, next, runs, images, pendingBreak);
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && !r.br && last.bold === r.bold && last.italic === r.italic && last.underline === r.underline && last.sup === r.sup && last.sub === r.sub) {
      last.text += r.text;
    } else out.push({ ...r });
  }
  // Trim outer whitespace.
  if (out[0]) out[0].text = out[0].text.replace(/^\s+/, "");
  const end = out[out.length - 1];
  if (end) end.text = end.text.replace(/\s+$/, "");
  return out.filter((r, i) => r.text !== "" || r.br || i === 0);
}

function paragraphFrom(el: HTMLElement, extra: { headingLevel?: number; list?: ListInfo } = {}): Block[] {
  const runs: Run[] = [];
  const images: Block[] = [];
  collectInline(el, {}, runs, images, { v: false });
  const merged = mergeRuns(runs);
  const blocks: Block[] = [];
  if (merged.some((r) => r.text.trim())) blocks.push({ type: "paragraph", runs: merged, ...extra });
  else if (!images.length) blocks.push({ type: "paragraph", runs: [], ...extra }); // keep empties; detection reports them
  return [...blocks, ...images];
}

function parseTable(el: HTMLElement): TableBlock {
  const rows: TableBlock["rows"] = [];
  for (const tr of el.querySelectorAll("tr")) {
    // Skip rows that belong to a nested table.
    if (tr.closest("table") !== el) continue;
    const cells: TableCellData[] = [];
    for (const cell of tr.childNodes) {
      if (!(cell instanceof HTMLElement)) continue;
      const tag = cell.tagName.toLowerCase();
      if (tag !== "td" && tag !== "th") continue;
      const paras: Run[][] = [];
      const ps = cell.querySelectorAll("p");
      const sources = ps.length ? ps : [cell];
      for (const p of sources) {
        const runs: Run[] = [];
        collectInline(p, {}, runs, [], { v: false });
        paras.push(mergeRuns(runs));
      }
      cells.push({
        paragraphs: paras.length ? paras : [[]],
        colSpan: Number(cell.getAttribute("colspan")) || undefined,
        rowSpan: Number(cell.getAttribute("rowspan")) || undefined,
        header: tag === "th" || undefined,
      });
    }
    if (cells.length) rows.push({ cells });
  }
  return { type: "table", rows };
}

function walkList(el: HTMLElement, level: number, out: Block[]) {
  const ordered = el.tagName.toLowerCase() === "ol";
  let index = 0;
  for (const li of el.childNodes) {
    if (!(li instanceof HTMLElement) || li.tagName.toLowerCase() !== "li") continue;
    index++;
    // The li's own inline content (excluding nested lists) is one paragraph.
    const clone = li.clone() as HTMLElement;
    for (const nested of clone.querySelectorAll("ol, ul")) nested.remove();
    out.push(...paragraphFrom(clone, { list: { ordered, level, index } }));
    for (const child of li.childNodes) {
      if (child instanceof HTMLElement && /^(ol|ul)$/i.test(child.tagName)) walkList(child, level + 1, out);
    }
  }
}

export function htmlToBlocks(html: string): Block[] {
  const root = parse(html);
  const out: Block[] = [];
  for (const node of root.childNodes) {
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) out.push(...paragraphFrom(node, { headingLevel: Number(tag[1]) }));
    else if (tag === "p") out.push(...paragraphFrom(node));
    else if (tag === "table") out.push(parseTable(node));
    else if (tag === "ol" || tag === "ul") walkList(node, 0, out);
    else out.push(...paragraphFrom(node));
  }
  return out;
}

/** Plain text (from PDF/TXT) → paragraphs. Formatting, tables and images are not recoverable from text. */
export function textToBlocks(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .map((p) => ({ type: "paragraph" as const, runs: p ? [{ text: p }] : [] }));
}
