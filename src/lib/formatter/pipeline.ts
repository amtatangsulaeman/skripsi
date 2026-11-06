import "server-only";
import mammoth from "mammoth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { readStoredFile } from "@/lib/docs/storage";
import { safeJsonParse } from "@/lib/utils";
import { detectStructure } from "./detect";
import { htmlToBlocks, textToBlocks } from "./parse";
import { BUILTIN_PROFILES, normalizeConfig, type FormattingConfig } from "./profile";

/** Load a document from the library and turn it into the structured model. */
export async function loadStructured(documentId: string, config: FormattingConfig) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new HttpError(404, "Dokumen tidak ditemukan.");
  if (doc.fileType === "docx" && doc.filePath) {
    const buf = await readStoredFile(doc.filePath);
    const { value: html } = await mammoth.convertToHtml(
      { buffer: buf },
      {
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.readAsBase64String()}` })),
      },
    );
    return { doc, structured: detectStructure(htmlToBlocks(html), config, "docx") };
  }
  if (!doc.content.trim()) throw new HttpError(422, "Dokumen tidak memiliki teks yang bisa diformat.");
  return { doc, structured: detectStructure(textToBlocks(doc.content), config, doc.fileType === "pdf" ? "pdf" : "txt") };
}

/** Make sure the built-in profiles exist (first run). */
export async function ensureBuiltinProfiles() {
  if ((await db.formattingProfile.count()) > 0) return;
  await db.formattingProfile.createMany({
    data: BUILTIN_PROFILES.map((p) => ({ universityName: p.universityName, configuration: JSON.stringify(p.configuration) })),
  });
}

export async function getProfileConfig(id: string): Promise<FormattingConfig> {
  const p = await db.formattingProfile.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "Profil format tidak ditemukan.");
  return normalizeConfig(safeJsonParse(p.configuration, {}));
}
