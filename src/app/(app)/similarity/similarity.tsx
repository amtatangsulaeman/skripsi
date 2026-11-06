"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Database, Globe, Printer, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { CheckboxChip, Panel } from "@/components/tools/shared";
import { UploadButton } from "../documents/library-client";
import { errorMessage, postJson } from "@/lib/client-api";
import type { SimilarityResult } from "@/lib/similarity/engine";
import { cn, formatDate } from "@/lib/utils";

export type ReportPayload = SimilarityResult & { target: string; sourceCount: number };
type Report = ReportPayload & { reportId: string | null; title?: string; createdAt?: string };
type DocOpt = { id: string; title: string; fileType: string; kind: string };

const PALETTE = ["#fde68a", "#bfdbfe", "#fbcfe8", "#bbf7d0", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fecaca"];

export function SimilarityChecker({ documents, reports, initialDocId, initialReport }: {
  documents: DocOpt[];
  reports: { id: string; title: string; score: number; createdAt: string }[];
  initialDocId?: string;
  initialReport: Report | null;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(documents);
  const [inputMode, setInputMode] = useState<"doc" | "text">(initialDocId || documents.length ? "doc" : "text");
  const [docId, setDocId] = useState(initialDocId ?? documents[0]?.id ?? "");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [compareAll, setCompareAll] = useState(true);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [compareText, setCompareText] = useState("");
  const [minWords, setMinWords] = useState(8);
  const [excludeQuotes, setExcludeQuotes] = useState(true);
  const [excludeReferences, setExcludeReferences] = useState(true);
  const [report, setReport] = useState<Report | null>(initialReport);
  const [loading, setLoading] = useState(false);

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    report?.sources.forEach((s, i) => map.set(s.id, PALETTE[i % PALETTE.length]!));
    return (id: string) => map.get(id) ?? PALETTE[0]!;
  }, [report]);

  async function run() {
    setLoading(true);
    try {
      const res = await postJson<Report>("/api/similarity", {
        title,
        ...(inputMode === "doc" ? { documentId: docId } : { text }),
        sourceIds: compareAll ? [] : sourceIds,
        compareText: compareText || undefined,
        options: { minWords, excludeQuotes, excludeReferences },
      });
      setReport({ ...res, title: title || (inputMode === "doc" ? docs.find((d) => d.id === docId)?.title : undefined) });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteReport() {
    if (!report?.reportId || !confirm("Hapus laporan ini?")) return;
    try {
      await postJson(`/api/similarity/${report.reportId}`, {}, "DELETE");
      setReport(null);
      router.replace("/similarity");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const highlighted = useMemo(() => {
    if (!report) return null;
    const parts: React.ReactNode[] = [];
    let pos = 0;
    report.passages.forEach((p, i) => {
      if (p.start > pos) parts.push(<span key={`t${i}`}>{report.target.slice(pos, p.start)}</span>);
      parts.push(
        <mark key={`m${i}`} style={{ backgroundColor: colorOf(p.sourceId) }} className="rounded-sm text-slate-900" title={`Cocok dengan: ${p.sourceTitle}`}>
          {report.target.slice(p.start, p.end)}
        </mark>,
      );
      pos = p.end;
    });
    parts.push(<span key="end">{report.target.slice(pos)}</span>);
    return parts;
  }, [report, colorOf]);

  const candidateSources = docs.filter((d) => !(inputMode === "doc" && d.id === docId));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3 print:hidden">
        <ScopeCard icon={<Database />} title="1. Antar dokumen sendiri" status="Aktif" tone="success">
          Teks dibandingkan dengan dokumen di pustaka pribadimu dan teks pembanding yang kamu tempel. Contohnya draf lama, bab lain, atau sumber yang sudah kamu unduh.
        </ScopeCard>
        <ScopeCard icon={<Globe />} title="2. Sumber web publik" status="Tidak tersedia" tone="neutral">
          Belum ada API pencarian web yang dikonfigurasi, jadi tidak ada pencocokan dengan internet.
        </ScopeCard>
        <ScopeCard icon={<Ban />} title="3. Penyedia eksternal resmi" status="Tidak terintegrasi" tone="neutral">
          ThesisMate tidak punya akses ke Turnitin atau basis data akademik berbayar. Untuk skor resmi, gunakan layanan yang disediakan kampus.
        </ScopeCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <div className="flex flex-col gap-4 print:hidden">
          <Panel title="Teks yang dianalisis">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "doc" | "text")}>
              <TabsList>
                <TabsTrigger value="doc">Dokumen</TabsTrigger>
                <TabsTrigger value="text">Tempel teks</TabsTrigger>
              </TabsList>
              <TabsContent value="doc" className="flex flex-col gap-3">
                {docs.length ? (
                  <Select value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Dokumen">
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.kind === "formatted" ? "format" : d.fileType.toUpperCase()})
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada dokumen.</p>
                )}
                <UploadButton
                  variant="outline"
                  label="Unggah DOCX/PDF/TXT"
                  onUploaded={(d) => {
                    if (!d.content) return;
                    setDocs((p) => [{ id: d.id, title: d.title, fileType: d.fileType, kind: "upload" }, ...p]);
                    setDocId(d.id);
                  }}
                />
                <p className="text-xs text-muted-foreground">File yang diunggah disimpan secara privat di My Documents, jadi bisa dipakai lagi sebagai pembanding.</p>
              </TabsContent>
              <TabsContent value="text" className="flex flex-col gap-2">
                <Input placeholder="Judul laporan (opsional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel teks yang ingin diperiksa…" />
              </TabsContent>
            </Tabs>
          </Panel>

          <Panel title="Pembanding">
            <label className="flex items-center justify-between gap-3 text-sm">
              Semua dokumen lain ({candidateSources.length})
              <Switch checked={compareAll} onCheckedChange={setCompareAll} />
            </label>
            {!compareAll && (
              <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {candidateSources.map((d) => (
                  <CheckboxChip key={d.id} label={d.title} checked={sourceIds.includes(d.id)} onChange={(on) => setSourceIds((p) => (on ? [...p, d.id] : p.filter((x) => x !== d.id)))} />
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="compare-text">Teks pembanding tambahan (opsional)</Label>
              <Textarea id="compare-text" rows={4} value={compareText} onChange={(e) => setCompareText(e.target.value)} placeholder="Mis. paragraf dari jurnal yang kamu kutip" />
            </div>
          </Panel>

          <Panel title="Pengaturan">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Abaikan kecocokan di bawah (kata)
                <Input type="number" min={5} max={50} value={minWords} onChange={(e) => setMinWords(Math.min(50, Math.max(5, Number(e.target.value) || 8)))} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Kecualikan kutipan langsung (“…”)
                <Switch checked={excludeQuotes} onCheckedChange={setExcludeQuotes} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Kecualikan daftar pustaka
                <Switch checked={excludeReferences} onCheckedChange={setExcludeReferences} />
              </label>
              <Button onClick={run} loading={loading} disabled={inputMode === "doc" ? !docId : !text.trim()}>
                <ScanSearch /> Analisis kemiripan
              </Button>
            </div>
          </Panel>

          {reports.length > 0 && (
            <Panel title="Laporan sebelumnya">
              <ul className="flex flex-col gap-1.5">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/similarity?report=${r.id}`} className="truncate hover:text-primary">
                      {r.title || "Laporan"}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.score.toFixed(1)}% · {formatDate(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel
          title="Laporan similarity"
          actions={
            report && (
              <div className="flex gap-1.5 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer /> Cetak / PDF
                </Button>
                {report.reportId && (
                  <Button variant="ghost" size="sm" onClick={deleteReport} aria-label="Hapus laporan">
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          }
        >
          {!report ? (
            <EmptyState icon={<ScanSearch />} title="Belum ada analisis">
              Pilih teks dan pembanding, lalu jalankan analisis.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Kemiripan dengan dokumen sendiri</p>
                  <p className={cn("text-4xl font-semibold tabular-nums", report.score >= 25 ? "text-danger" : report.score >= 10 ? "text-warning" : "text-success")}>
                    {report.score.toFixed(1)}%
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>
                    {report.matchedWords.toLocaleString("id-ID")} dari {report.totalWords.toLocaleString("id-ID")} kata cocok · {report.sourceCount} pembanding
                  </p>
                  <p>
                    Kecocokan minimum {report.options.minWords} kata
                    {report.options.excludeQuotes && " · kutipan dikecualikan"}
                    {report.options.excludeReferences && " · daftar pustaka dikecualikan"}
                    {report.excludedWords > 0 && ` (${report.excludedWords.toLocaleString("id-ID")} kata)`}
                  </p>
                  {report.title && (
                    <p>
                      {report.title}
                      {report.createdAt && ` · ${formatDate(report.createdAt)}`}
                    </p>
                  )}
                </div>
              </div>

              <Alert>
                <strong>Cakupan analisis: internal.</strong> Skor ini hanya menghitung kecocokan teks dengan dokumen di pustaka pribadimu dan teks pembanding yang kamu tempel. Skor ini <em>tidak</em> mewakili kemiripan dengan internet, jurnal, atau repositori Turnitin.
              </Alert>

              {report.sources.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Sumber kecocokan</h3>
                  <ul className="flex flex-col gap-1.5">
                    {report.sources.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 text-sm">
                        <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(s.id) }} />
                        {s.id === "pasted" ? <span className="flex-1 truncate">{s.title}</span> : (
                          <Link href={`/documents/${s.id}`} className="flex-1 truncate hover:text-primary">{s.title}</Link>
                        )}
                        <span className="tabular-nums text-muted-foreground">{s.matchedWords} kata</span>
                        <Badge>{s.percent.toFixed(1)}%</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-medium">Teks dengan sorotan</h3>
                <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm leading-relaxed print:max-h-none">{highlighted}</div>
              </div>

              {report.passages.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Bagian yang cocok ({report.passages.length})</h3>
                  <ol className="flex flex-col gap-2">
                    {report.passages.slice(0, 100).map((p, i) => (
                      <li key={i} className="rounded-lg border border-border p-3 text-sm">
                        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="size-2.5 rounded-sm" style={{ backgroundColor: colorOf(p.sourceId) }} />
                          {p.sourceTitle} · {p.words} kata
                        </div>
                        <p>{p.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-medium">Kalimat berulang di dalam teks yang sama</h3>
                {report.repeated.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada kalimat yang diulang.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {report.repeated.map((r, i) => (
                      <li key={i} className="text-sm">
                        <Badge tone="warning">{r.count}×</Badge> {r.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ScopeCard({ icon, title, status, tone, children }: { icon: React.ReactNode; title: string; status: string; tone: "success" | "neutral"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "success" ? "border-success/30 bg-success-soft/50" : "border-border bg-surface")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4">
          {icon} {title}
        </span>
        <Badge tone={tone === "success" ? "success" : "neutral"}>{status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
