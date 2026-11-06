import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { documentOptions } from "@/lib/research/doc-options";
import { safeJsonParse } from "@/lib/utils";
import type { ReviewResult } from "@/lib/ai/research";
import { ReviewPanel } from "./review";

export const metadata: Metadata = { title: "Review Panel" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ doc?: string; report?: string }> }) {
  const { doc, report } = await searchParams;
  const [documents, history, saved] = await Promise.all([
    documentOptions(),
    db.reviewReport.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { id: true, title: true, decision: true, createdAt: true } }),
    report ? db.reviewReport.findUnique({ where: { id: report } }) : null,
  ]);
  return (
    <>
      <PageHeader
        title="Review Panel"
        description="Bab atau skripsi Anda direview oleh tiga penguji simulasi (metodologi, substansi, devil's advocate) lalu dirangkum oleh ketua penguji. Setiap temuan disertai kutipan dari teks Anda yang dicek ulang."
      />
      <ReviewPanel
        documents={documents}
        initialDocId={doc ?? ""}
        history={history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() }))}
        initial={saved ? { id: saved.id, title: saved.title, createdAt: saved.createdAt.toISOString(), result: safeJsonParse(saved.data, null as unknown as ReviewResult) } : null}
      />
    </>
  );
}
