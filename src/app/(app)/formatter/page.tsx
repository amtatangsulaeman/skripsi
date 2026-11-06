import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/primitives";
import { Formatter } from "./formatter";

export const metadata: Metadata = { title: "Thesis Formatter" };

export default async function FormatterPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const [{ doc }, settings, documents] = await Promise.all([
    searchParams,
    getSettings(),
    db.document.findMany({
      where: { fileType: { in: ["docx", "pdf"] }, kind: { not: "formatted" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, fileType: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Thesis Formatter"
        description="Terapkan format pedoman kampus secara otomatis. Dokumen asli tetap utuh, dan hasilnya disimpan sebagai DOCX baru."
      />
      <Formatter
        documents={documents}
        initialDocId={doc}
        defaults={{ profileId: settings.defaultProfileId, font: settings.defaultFont, fontSize: settings.defaultFontSize, lineSpacing: settings.defaultLineSpacing }}
      />
    </>
  );
}
