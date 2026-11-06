import "server-only";
import mammoth from "mammoth";

export type FileKind = "docx" | "pdf" | "txt";

export const MIME: Record<FileKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

/** Identify the real file type from its bytes (never trust the extension or client MIME alone). */
export function sniffFileKind(buf: Buffer, filename: string): FileKind | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return ext === "pdf" ? "pdf" : null;
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // DOCX is a ZIP containing word/document.xml
    return ext === "docx" && buf.includes(Buffer.from("word/")) ? "docx" : null;
  }
  if (ext === "txt") {
    const sample = buf.subarray(0, 8192);
    if (sample.includes(0)) return null; // binary
    return "txt";
  }
  return null;
}

export async function extractText(buf: Buffer, kind: FileKind): Promise<string> {
  switch (kind) {
    case "docx": {
      const res = await mammoth.extractRawText({ buffer: buf });
      return tidy(res.value);
    }
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: false });
      return tidy(rejoinPdfLines((text as string[]).join("\n\n")));
    }
    case "txt":
      return tidy(buf.toString("utf8").replace(/^﻿/, ""));
  }
}

export async function docxToHtml(buf: Buffer): Promise<string> {
  const res = await mammoth.convertToHtml(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const b64 = await image.readAsBase64String();
        return { src: `data:${image.contentType};base64,${b64}` };
      }),
    },
  );
  return res.value;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * PDF text comes back one visual line at a time. Re-join wrapped lines into paragraphs:
 * a line break is kept only after sentence-ending punctuation, short lines (headings) or list markers.
 */
export function rejoinPdfLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const prev = out[out.length - 1];
    if (!line) {
      if (prev !== "") out.push("");
      continue;
    }
    const startsBlock = /^(\d+(\.\d+)*\.?|[a-z]\)|[a-zA-Z]\.|[•●▪-])\s/.test(line) || /^BAB\s+([IVX]+|\d+)/i.test(line);
    const prevEndsBlock = prev === undefined || prev === "" || /[.:;?!”"]$/.test(prev) || prev.length < 60;
    if (prev !== undefined && prev !== "" && !startsBlock && !prevEndsBlock) {
      out[out.length - 1] = prev.endsWith("-") ? prev.slice(0, -1) + line : `${prev} ${line}`;
    } else {
      if (prev !== undefined && prev !== "") out.push("");
      out.push(line);
    }
  }
  return out.join("\n");
}
