import { z } from "zod";
import { PARAPHRASE_MODE_VALUES } from "./options";

export const settingsSchema = z.object({
  /** Empty string = use GEMINI_MODEL from the environment. */
  geminiModel: z.string().trim().max(80).regex(/^[a-zA-Z0-9.\-_]*$/, "Nama model tidak valid").default(""),
  defaultParaphraseMode: z.enum(PARAPHRASE_MODE_VALUES).default("standard"),
  defaultFont: z.enum(["Times New Roman", "Arial"]).default("Times New Roman"),
  defaultFontSize: z.number().min(8).max(16).default(12),
  defaultLineSpacing: z.union([z.literal(1.5), z.literal(2)]).default(1.5),
  defaultProfileId: z.string().default(""),
  defaultLanguage: z.enum(["id", "en"]).default("id"),
  theme: z.enum(["light", "dark"]).default("light"),
  saveHistory: z.boolean().default(true),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});
