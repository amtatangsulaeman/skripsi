"use client";

import { useMemo, useState } from "react";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { Panel } from "@/components/tools/shared";
import { SourcePicker, sourcePayload, sourceReady, type DocOption, type SourceValue } from "@/components/tools/source-picker";
import { errorMessage, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, type WritingCategory, type WritingReport } from "@/lib/writing/check";

export function WritingChecker({ documents, initialDocId }: { documents: DocOption[]; initialDocId: string }) {
  const [source, setSource] = useState<SourceValue>({ mode: documents.length ? "document" : "text", documentId: initialDocId, text: "" });
  const [report, setReport] = useState<WritingReport | null>(null);
  const [filter, setFilter] = useState<WritingCategory | "all">("all");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!sourceReady(source)) return toast.error("Pilih dokumen atau tempel teks terlebih dahulu.");
    setLoading(true);
    try {
      const res = await postJson<{ report: WritingReport }>("/api/research/writing", sourcePayload(source));
      setReport(res.report);
      setFilter("all");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const shown = useMemo(() => (report ? report.findings.filter((f) => filter === "all" || f.category === filter) : []), [report, filter]);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Sumber">
        <SourcePicker documents={documents} value={source} onChange={setSource} maxChars={400_000} placeholder="Tempel satu bab atau seluruh skripsi…" />
        <div className="mt-3">
          <Button onClick={run} loading={loading}>
            <FileSearch /> Periksa tulisan
          </Button>
        </div>
      </Panel>

      {!report ? (
        <EmptyState icon={<FileSearch />} title="Belum diperiksa">
          Setiap temuan adalah bahan pertimbangan, bukan larangan. Pertahankan kata atau kalimat yang memang paling tepat untuk maksud Anda.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{report.stats.words.toLocaleString("id-ID")} kata</Badge>
            <Badge>{report.stats.sentences.toLocaleString("id-ID")} kalimat</Badge>
            <Badge>rata-rata {report.stats.avgSentenceWords} kata/kalimat</Badge>
            <Badge>{report.stats.paragraphs} paragraf</Badge>
            <Badge tone="primary">{report.language === "id" ? "Bahasa Indonesia" : "English"}</Badge>
          </div>

          {report.findings.length === 0 ? (
            <Alert tone="success">Tidak ada pola yang perlu ditinjau. Tetap baca ulang untuk alur argumen, yang tidak bisa dinilai otomatis.</Alert>
          ) : (
            <Panel title={`Temuan (${report.findings.length})`}>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`Semua (${report.findings.length})`} />
                {(Object.keys(report.counts) as WritingCategory[]).map((c) => (
                  <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} label={`${CATEGORY_LABEL[c]} (${report.counts[c]})`} />
                ))}
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {shown.map((f, i) => (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{CATEGORY_LABEL[f.category]}</Badge>
                      <span className="rounded-sm bg-warning-soft px-1 text-sm font-medium text-warning">{f.excerpt}</span>
                    </div>
                    <p className="mt-1.5 text-sm">{f.message}</p>
                    {f.context && <p className="mt-1 rounded-md bg-surface px-2 py-1 text-xs leading-relaxed text-muted-foreground">{f.context}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Saran: {f.suggestion}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <p className="text-xs text-muted-foreground">
            Alat ini membantu tulisan lebih jelas dan tepat, bukan untuk mengelabui detektor AI. Diadaptasi dari Writing Quality Check di academic-research-skills (Cheng-I Wu, CC BY-NC 4.0).
          </p>
        </>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors", active ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-2")}
    >
      {label}
    </button>
  );
}
