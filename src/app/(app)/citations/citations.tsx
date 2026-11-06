"use client";

import { useState } from "react";
import { BookCheck, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { Panel } from "@/components/tools/shared";
import { SourcePicker, sourcePayload, sourceReady, type DocOption, type SourceValue } from "@/components/tools/source-picker";
import { errorMessage, postJson } from "@/lib/client-api";
import type { CitationIssue, CitationReport } from "@/lib/citations/engine";

const LEVEL = {
  error: { label: "Harus diperbaiki", icon: CircleAlert, iconClass: "text-danger" },
  warning: { label: "Perlu dicek", icon: TriangleAlert, iconClass: "text-warning" },
  info: { label: "Format APA 7", icon: Info, iconClass: "text-primary" },
};

const STATUS: Record<CitationReport["matrix"][number]["status"], { label: string; tone: "success" | "danger" | "warning" }> = {
  ok: { label: "Cocok", tone: "success" },
  missing_reference: { label: "Tidak ada di daftar pustaka", tone: "danger" },
  year_mismatch: { label: "Tahun berbeda", tone: "danger" },
  uncited: { label: "Tidak dikutip", tone: "warning" },
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function CitationChecker({ documents, initialDocId }: { documents: DocOption[]; initialDocId: string }) {
  const [source, setSource] = useState<SourceValue>({ mode: documents.length ? "document" : "text", documentId: initialDocId, text: "" });
  const [report, setReport] = useState<CitationReport | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!sourceReady(source)) return toast.error("Pilih dokumen atau tempel teks lengkap beserta Daftar Pustaka.");
    setLoading(true);
    try {
      const res = await postJson<{ title: string; report: CitationReport }>("/api/research/citations", sourcePayload(source));
      setReport(res.report);
      setTitle(res.title);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const grouped = (["error", "warning", "info"] as const).map((level) => ({ level, items: report?.issues.filter((i) => i.level === level) ?? [] }));

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Sumber">
        <SourcePicker documents={documents} value={source} onChange={setSource} maxChars={400_000} placeholder="Tempel seluruh isi skripsi, termasuk bagian DAFTAR PUSTAKA di akhir…" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={run} loading={loading}>
            <BookCheck /> Periksa sitasi
          </Button>
          <p className="text-xs text-muted-foreground">Yang dibaca: sitasi gaya penulis–tahun, mis. (Sugiyono, 2017:136), Arens dkk. (2014), (IAI, 2024).</p>
        </div>
      </Panel>

      {!report ? (
        <EmptyState icon={<BookCheck />} title="Belum diperiksa">
          Hasilnya: sitasi yang tidak ada di daftar pustaka, entri yang tidak pernah dikutip, tahun yang berbeda, dan catatan format APA 7.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sitasi di teks" value={report.stats.citations} hint={`${report.stats.uniqueSources} sumber berbeda`} />
            <Stat label="Entri daftar pustaka" value={report.stats.references} hint={report.referenceHeading ? `di bawah "${report.referenceHeading}"` : "judul tidak ditemukan"} />
            <Stat label="Cocok dua arah" value={report.stats.matched} hint={`${report.issues.filter((i) => i.level === "error").length} masalah utama`} />
            <Stat label="Sumber 5 tahun terakhir" value={pct(report.stats.recentShare)} hint={`> 10 tahun: ${pct(report.stats.oldShare)}`} />
          </div>

          {report.issues.length === 0 ? (
            <Alert tone="success">Tidak ada masalah yang terdeteksi pada {title || "dokumen ini"}. Tetap cek manual hal yang tidak bisa dibaca dari teks biasa, seperti huruf miring judul buku/jurnal.</Alert>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {grouped.map(({ level, items }) => (
                <IssueColumn key={level} level={level} items={items} />
              ))}
            </div>
          )}

          <Panel title={`Matriks sitasi ↔ daftar pustaka (${report.matrix.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Penulis</th>
                    <th className="py-2 pr-3 font-medium">Tahun</th>
                    <th className="py-2 pr-3 text-right font-medium">Dikutip</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.matrix.map((r) => (
                    <tr key={r.key + r.status}>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.year}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.inTextCount}×</td>
                      <td className="py-2">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="text-xs text-muted-foreground">
            Pemeriksaan ini membaca teks biasa, jadi huruf miring, indentasi gantung, dan apakah DOI benar-benar bisa dibuka tidak ikut dicek. Metode diadaptasi dari citation compliance di academic-research-skills (Cheng-I Wu, CC BY-NC 4.0).
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function IssueColumn({ level, items }: { level: CitationIssue["level"]; items: CitationIssue[] }) {
  const meta = LEVEL[level];
  const Icon = meta.icon;
  return (
    <Panel title={`${meta.label} (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i, k) => (
            <li key={k} className="text-sm">
              <div className="flex gap-2">
                <Icon className={`mt-0.5 size-4 shrink-0 ${meta.iconClass}`} />
                <div className="min-w-0">
                  <p>{i.message}</p>
                  {i.excerpt && <p className="mt-1 break-words rounded-md bg-surface px-2 py-1 font-mono text-xs text-muted-foreground">{i.excerpt}</p>}
                  {i.suggestion && <p className="mt-1 text-xs text-muted-foreground">{i.suggestion}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
