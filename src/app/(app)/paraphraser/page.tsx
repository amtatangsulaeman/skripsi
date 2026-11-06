import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { Paraphraser } from "./paraphraser";

export const metadata: Metadata = { title: "AI Paraphraser" };

export default async function ParaphraserPage({ searchParams }: { searchParams: Promise<{ history?: string }> }) {
  const [settings, { history }] = await Promise.all([getSettings(), searchParams]);
  const h = history ? await db.paraphraseHistory.findUnique({ where: { id: history } }) : null;
  return (
    <>
      <PageHeader
        title="AI Paraphraser"
        description="Tingkatkan kualitas tulisan akademik tanpa mengubah makna, istilah teknis, angka, maupun sitasi."
      />
      <Paraphraser
        defaultMode={settings.defaultParaphraseMode}
        defaultLanguage={settings.defaultLanguage}
        initialText={h?.originalText}
        documentId={h?.documentId ?? undefined}
      />
    </>
  );
}
