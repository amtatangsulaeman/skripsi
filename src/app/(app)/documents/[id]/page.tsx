import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { docxToHtml } from "@/lib/docs/extract";
import { readStoredFile } from "@/lib/docs/storage";
import { Badge } from "@/components/ui/primitives";
import { countWords, formatBytes, formatDate } from "@/lib/utils";
import { DocumentWorkspace } from "./workspace";

export const metadata: Metadata = { title: "Dokumen" };

/** Remove scriptable URLs from converted DOCX HTML (it is the owner's own file, but stay defensive). */
function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/href="(?!https?:|mailto:|#)[^"]*"/gi, 'href="#"');
}

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const doc = await db.document.findUnique({ where: { id }, include: { folder: true } });
  if (!doc) notFound();

  const [versions, history, reports, outputs, source] = await Promise.all([
    db.documentVersion.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.paraphraseHistory.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.similarityReport.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.document.findMany({ where: { sourceId: id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, createdAt: true } }),
    doc.sourceId ? db.document.findUnique({ where: { id: doc.sourceId }, select: { id: true, title: true } }) : null,
  ]);

  let previewHtml: string | null = null;
  if (doc.fileType === "docx" && doc.filePath) {
    try {
      previewHtml = sanitizeHtml(await docxToHtml(await readStoredFile(doc.filePath)));
    } catch {
      previewHtml = null;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/documents" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> My Documents
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge>{doc.fileType.toUpperCase()}</Badge>
          {doc.kind === "formatted" && <Badge tone="success">Hasil format</Badge>}
          {doc.folder && <Badge tone="primary">{doc.folder.name}</Badge>}
          <span>Diperbarui {formatDate(doc.updatedAt)}</span>
          {doc.sizeBytes > 0 && <span>· {formatBytes(doc.sizeBytes)}</span>}
          <span>· {countWords(doc.content).toLocaleString("id-ID")} kata</span>
          {source && (
            <span>
              · Sumber:{" "}
              <Link className="text-primary hover:underline" href={`/documents/${source.id}`}>
                {source.title}
              </Link>
            </span>
          )}
        </div>
      </div>

      <DocumentWorkspace
        initialTab={tab === "edit" || tab === "history" || tab === "analysis" ? tab : "preview"}
        doc={{ id: doc.id, title: doc.title, fileType: doc.fileType, kind: doc.kind, content: doc.content, hasFile: !!doc.filePath }}
        previewHtml={previewHtml}
        versions={versions.map((v) => ({ id: v.id, note: v.note, createdAt: v.createdAt.toISOString(), content: v.content }))}
        history={history.map((h) => ({ id: h.id, feature: h.feature, mode: h.mode, createdAt: h.createdAt.toISOString(), original: h.originalText, result: h.paraphrasedText }))}
        reports={reports.map((r) => ({ id: r.id, title: r.title, score: r.similarityScore, createdAt: r.createdAt.toISOString() }))}
        outputs={outputs.map((o) => ({ id: o.id, title: o.title, createdAt: o.createdAt.toISOString() }))}
      />
    </div>
  );
}
