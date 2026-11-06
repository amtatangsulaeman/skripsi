import "server-only";
import { db } from "./db";
import { env } from "./env";
import { DEFAULT_SETTINGS, settingsSchema, type AppSettings } from "./settings-schema";
import { safeJsonParse } from "./utils";

export async function getSettings(): Promise<AppSettings> {
  const row = await db.setting.findUnique({ where: { id: 1 } });
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...safeJsonParse(row?.data, {}) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  const data = JSON.stringify(next);
  await db.setting.upsert({ where: { id: 1 }, create: { id: 1, data }, update: { data } });
  return next;
}

export async function getActiveModel(): Promise<string> {
  const s = await getSettings();
  return s.geminiModel || env.geminiModel;
}
