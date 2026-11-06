import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { storageDriver, storageUsage } from "@/lib/docs/storage";
import { ensureBuiltinProfiles } from "@/lib/formatter/pipeline";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await ensureBuiltinProfiles();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [settings, profiles, usage, storage, docCount, historyCount] = await Promise.all([
    getSettings(),
    db.formattingProfile.findMany({ select: { id: true, universityName: true }, orderBy: { createdAt: "asc" } }),
    db.usageLog.groupBy({ by: ["feature"], where: { createdAt: { gte: since } }, _sum: { tokensUsed: true }, _count: true }),
    storageDriver() === "supabase"
      ? db.document.aggregate({ where: { filePath: { not: null } }, _count: true, _sum: { sizeBytes: true } }).then((a) => ({ files: a._count, bytes: a._sum.sizeBytes ?? 0 }))
      : storageUsage(),
    db.document.count(),
    db.paraphraseHistory.count(),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Preferensi aplikasi. Kredensial dan API key hanya disimpan di file .env server, tidak pernah di sini." />
      <SettingsForm
        initial={settings}
        profiles={profiles}
        envInfo={{
          apiKeyConfigured: !!env.geminiApiKey,
          apiKeyCount: env.geminiApiKeys.length,
          fallbackModel: env.geminiFallbackModel,
          envModel: env.geminiModel,
          storageKind: storageDriver(),
          storageDir: storageDriver() === "supabase" ? `${env.supabaseBucket} (Supabase, private)` : env.storageDir,
          maxUploadMb: Math.round(env.maxUploadBytes / 1024 / 1024),
          sessionHours: env.sessionHours,
        }}
        stats={{
          files: storage.files,
          bytes: storage.bytes,
          documents: docCount,
          history: historyCount,
          usage: usage.map((u) => ({ feature: u.feature, requests: u._count, tokens: u._sum.tokensUsed ?? 0 })),
        }}
      />
    </>
  );
}
