"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Download, Eye, FileCog, History, Pencil, RotateCcw, Save, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { PlainEditor } from "@/components/tools/plain-editor";
import { errorMessage, postJson } from "@/lib/client-api";
import { formatDate, truncate } from "@/lib/utils";

type Doc = { id: string; title: string; fileType: string; kind: string; content: string; hasFile: boolean };
type Analysis = {
  language: string;
  summary: string;
  detectedSections: string[];
  issues: { category: string; description: string }[];
  truncated: boolean;
};

const FEATURE: Record<string, string> = { paraphrase: "Parafrasa", rewrite: "Rewrite", grammar: "Grammar" };
const ISSUE: Record<string, string> = { structure: "Struktur", consistency: "Konsistensi", citation: "Sitasi", language: "Bahasa", methodology: "Metodologi" };

export function DocumentWorkspace(props: {
  initialTab: string;
  doc: Doc;
  previewHtml: string | null;
  versions: { id: string; note: string; createdAt: string; content: string }[];
  history: { id: string; feature: string; mode: string; createdAt: string; original: string; result: string }[];
  reports: { id: string; title: string; score: number; createdAt: string }[];
  outputs: { id: string; title: string; createdAt: string }[];
}) {
  const { doc } = props;
  const router = useRouter();
  const [text, setText] = useState(doc.content);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const dirty = text !== doc.content;

  async function save(content = text, note?: string) {
    setSaving(true);
    try {
      await postJson(`/api/documents/${doc.id}`, { content, versionNote: note }, "PATCH");
      toast.success("Tersimpan. Versi sebelumnya disimpan di Riwayat.");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    try {
      setAnalysis(await postJson<Analysis>(`/api/documents/${doc.id}/analyze`, {}));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {doc.hasFile && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/documents/${doc.id}/file`}>
              <Download /> Unduh file asli
            </a>
          </Button>
        )}
        {(doc.fileType === "docx" || doc.fileType === "pdf") && doc.kind !== "formatted" && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/formatter?doc=${doc.id}`}>
              <FileCog /> Format skripsi
            </Link>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/similarity?doc=${doc.id}`}>
            <ScanSearch /> Cek similarity
          </Link>
        </Button>
      </div>

      <Tabs defaultValue={props.initialTab}>
        <TabsList>
          <TabsTrigger value="preview">
            <Eye /> Pratinjau
          </TabsTrigger>
          <TabsTrigger value="edit">
            <Pencil /> Teks
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Riwayat
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <Brain /> Analisis AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          {doc.fileType === "pdf" && doc.hasFile ? (
            <iframe src={`/api/documents/${doc.id}/file?inline=1`} title={doc.title} className="h-[80dvh] w-full rounded-xl border border-border" />
          ) : props.previewHtml ? (
            <div className="tm-page tm-prose mx-auto max-w-3xl rounded-lg px-10 py-12 font-serif text-[15px]" dangerouslySetInnerHTML={{ __html: props.previewHtml }} />
          ) : doc.content ? (
            <div className="tm-page mx-auto max-w-3xl whitespace-pre-wrap rounded-lg px-10 py-12 font-serif text-[15px] leading-relaxed">{doc.content}</div>
          ) : (
            <EmptyState title="Tidak ada teks yang bisa ditampilkan" />
          )}
        </TabsContent>

        <TabsContent value="edit" className="flex flex-col gap-3">
          {doc.hasFile && (
            <Alert>
              Kamu mengedit <strong>teks hasil ekstraksi</strong> (dipakai oleh Similarity & alat AI). File {doc.fileType.toUpperCase()} aslinya tidak diubah.
            </Alert>
          )}
          <PlainEditor value={text} onChange={setText} />
          <div className="flex items-center justify-end gap-2">
            {dirty && <span className="text-xs text-muted-foreground">Ada perubahan belum disimpan</span>}
            <Button variant="outline" onClick={() => setText(doc.content)} disabled={!dirty}>
              Batalkan
            </Button>
            <Button onClick={() => save()} loading={saving} disabled={!dirty}>
              <Save /> Simpan
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border p-4">
            <h3 className="mb-3 text-sm font-medium">Versi teks</h3>
            {props.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada versi sebelumnya.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {props.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{v.note || "Versi"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(v.createdAt)} · {truncate(v.content, 60)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => save(v.content, "Sebelum memulihkan versi lama")} loading={saving}>
                      <RotateCcw /> Pulihkan
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-4">
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Hasil format (DOCX)</h3>
              {props.outputs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {props.outputs.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/documents/${o.id}`} className="truncate hover:text-primary">{o.title}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Laporan similarity</h3>
              {props.reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {props.reports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/similarity?report=${r.id}`} className="truncate hover:text-primary">{r.title || "Laporan"}</Link>
                      <span className="shrink-0 tabular-nums">{r.score.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-medium">Riwayat AI</h3>
              {props.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {props.history.map((h) => (
                    <li key={h.id} className="py-2 text-sm">
                      <Badge tone="primary">{FEATURE[h.feature] ?? h.feature}</Badge>{" "}
                      <span className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</span>
                      <p className="mt-1 text-muted-foreground">{truncate(h.result, 120)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="analysis" className="flex flex-col gap-4">
          <Alert>
            Gemini membaca teks dokumen dan memberi ringkasan serta catatan struktur, konsistensi, dan sitasi. Hasil AI bisa keliru, jadi periksa lagi sebelum menerapkannya.
          </Alert>
          <Button onClick={analyze} loading={analyzing} className="self-start" disabled={!doc.content}>
            <Brain /> {analysis ? "Analisis ulang" : "Analisis dokumen"}
          </Button>
          {analysis && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-border p-4">
                <h3 className="mb-2 text-sm font-medium">Ringkasan</h3>
                <p className="text-sm leading-relaxed">{analysis.summary}</p>
                {analysis.truncated && <p className="mt-2 text-xs text-muted-foreground">Dokumen panjang: yang dianalisis hanya bagian awal dan akhirnya.</p>}
                <h3 className="mb-2 mt-4 text-sm font-medium">Bagian terdeteksi</h3>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.detectedSections.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-border p-4">
                <h3 className="mb-2 text-sm font-medium">Catatan ({analysis.issues.length})</h3>
                <ul className="flex flex-col gap-2">
                  {analysis.issues.map((i, k) => (
                    <li key={k} className="text-sm">
                      <Badge tone="warning">{ISSUE[i.category] ?? i.category}</Badge> {i.description}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
