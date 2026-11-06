import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { safeJsonParse } from "@/lib/utils";
import { SimilarityChecker, type ReportPayload } from "./similarity";

export const metadata: Metadata = { title: "Similarity Checker" };

export default async function SimilarityPage({ searchParams }: { searchParams: Promise<{ report?: string; doc?: string }> }) {
  const { report, doc } = await searchParams;
  const [documents, reports, saved] = await Promise.all([
    db.document.findMany({
      where: { content: { not: "" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, fileType: true, kind: true },
    }),
    db.similarityReport.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { id: true, title: true, similarityScore: true, createdAt: true } }),
    report ? db.similarityReport.findUnique({ where: { id: report } }) : null,
  ]);

  const initialReport = saved
    ? { ...(safeJsonParse(saved.matchedPassages, {}) as ReportPayload), reportId: saved.id, title: saved.title, createdAt: saved.createdAt.toISOString() }
    : null;

  return (
    <>
      <PageHeader
        title="Similarity Checker"
        description="Analisis kemiripan teks secara deterministik terhadap dokumen milikmu sendiri. Hasilnya bukan skor Turnitin."
      />
      <SimilarityChecker
        documents={documents}
        reports={reports.map((r) => ({ id: r.id, title: r.title, score: r.similarityScore, createdAt: r.createdAt.toISOString() }))}
        initialDocId={doc}
        initialReport={initialReport}
      />
    </>
  );
}
