"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Gavel, History, MessageCircleQuestion, Quote, ShieldQuestion, Swords, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { Panel } from "@/components/tools/shared";
import { SourcePicker, sourcePayload, sourceReady, type DocOption, type SourceValue } from "@/components/tools/source-picker";
import { errorMessage, postJson } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";
import type { ReviewResult } from "@/lib/ai/research";

type HistoryItem = { id: string; title: string; decision: string; createdAt: string };
type Saved = { id: string; title: string; createdAt: string; result: ReviewResult };

const DECISION: Record<string, { label: string; tone: "success" | "primary" | "warning" | "danger" }> = {
  ready: { label: "Layak lanjut (perbaikan kecil)", tone: "success" },
  minor_revision: { label: "Revisi minor", tone: "primary" },
  major_revision: { label: "Revisi mayor", tone: "warning" },
  not_ready: { label: "Belum layak", tone: "danger" },
};
const VERDICT: Record<string, { label: string; tone: "success" | "primary" | "warning" | "danger" | "neutral" }> = {
  EXCEEDS: { label: "Melampaui", tone: "success" },
  MEETS: { label: "Memenuhi", tone: "primary" },
  PARTLY_MEETS: { label: "Sebagian", tone: "warning" },
  DOES_NOT_MEET: { label: "Belum memenuhi", tone: "danger" },
  NOT_ASSESSED: { label: "Tidak dinilai", tone: "neutral" },
};
const SEVERITY: Record<string, { label: string; tone: "danger" | "warning" | "neutral" | "primary" }> = {
  critical: { label: "Kritis", tone: "danger" },
  major: { label: "Mayor", tone: "warning" },
  minor: { label: "Minor", tone: "neutral" },
  observation: { label: "Observasi", tone: "primary" },
};
const ROLE: Record<string, string> = { methodology: "Penguji Metodologi", substance: "Penguji Substansi", devils_advocate: "Devil's Advocate" };
const DIMENSION: Record<string, string> = {
  core_thesis: "Argumen inti",
  cherry_picking: "Seleksi bukti",
  confirmation_bias: "Bias konfirmasi",
  logic_chain: "Rantai logika",
  overgeneralization: "Generalisasi berlebihan",
  alternatives: "Alternatif terabaikan",
  stakeholders: "Pihak terabaikan",
  so_what: "\"So what?\"",
};
const STEPS = ["Penguji metodologi & substansi membaca naskah…", "Devil's advocate mencari titik terlemah…", "Mengecek kutipan bukti terhadap teks Anda…", "Ketua penguji menyusun keputusan…"];

export function ReviewPanel({ documents, initialDocId, history, initial }: { documents: DocOption[]; initialDocId: string; history: HistoryItem[]; initial: Saved | null }) {
  const router = useRouter();
  const [source, setSource] = useState<SourceValue>({ mode: documents.length ? "document" : "text", documentId: initialDocId, text: "" });
  const [field, setField] = useState("");
  const [stage, setStage] = useState<"proposal" | "full">("proposal");
  const [researchType, setResearchType] = useState("auto");
  const [focus, setFocus] = useState("");
  const [saved, setSaved] = useState<Saved | null>(initial);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Opening another report from the history list changes the server-provided `initial`.
  useEffect(() => {
    if (initial) setSaved(initial);
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function run() {
    if (!sourceReady(source)) return toast.error("Pilih dokumen atau tempel teks terlebih dahulu.");
    setLoading(true);
    setElapsed(0);
    try {
      const res = await postJson<Saved>("/api/ai/review", { ...sourcePayload(source), field, stage, researchType, focus });
      setSaved(res);
      router.replace(`/review?report=${res.id}`, { scroll: false });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    try {
      await postJson(`/api/ai/review/${id}`, {}, "DELETE");
      if (saved?.id === id) setSaved(null);
      router.replace("/review", { scroll: false });
      router.refresh();
      toast.success("Laporan dihapus.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel title="Naskah yang direview">
          <SourcePicker documents={documents} value={source} onChange={setSource} maxChars={120_000} placeholder="Tempel satu bab (disarankan) atau seluruh proposal…" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rv-field">Program studi / bidang</Label>
              <Input id="rv-field" value={field} onChange={(e) => setField(e.target.value)} placeholder="mis. Akuntansi" maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rv-stage">Tahap</Label>
              <Select id="rv-stage" value={stage} onChange={(e) => setStage(e.target.value as "proposal" | "full")}>
                <option value="proposal">Proposal (BAB I–III)</option>
                <option value="full">Skripsi lengkap (BAB I–V)</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rv-type">Pendekatan</Label>
              <Select id="rv-type" value={researchType} onChange={(e) => setResearchType(e.target.value)}>
                <option value="auto">Deteksi otomatis</option>
                <option value="quantitative">Kuantitatif</option>
                <option value="qualitative">Kualitatif</option>
                <option value="mixed">Campuran</option>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="rv-focus">Catatan untuk penguji (opsional)</Label>
            <Textarea id="rv-focus" rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={600} placeholder="mis. Dosen pembimbing bilang rumusan masalah saya kurang tajam." />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={run} loading={loading}>
              <Users /> Mulai review
            </Button>
            {loading ? (
              <span className="text-sm text-muted-foreground tabular-nums">
                {STEPS[Math.min(STEPS.length - 1, Math.floor(elapsed / 25))]} ({elapsed} dtk)
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Memakai 3 permintaan Gemini, biasanya 1–3 menit.</span>
            )}
          </div>
        </Panel>

        <Panel title="Riwayat review">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="group flex items-start gap-1">
                  <Link href={`/review?report=${h.id}`} scroll={false} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 ${saved?.id === h.id ? "bg-surface-2" : ""}`}>
                    <span className="block truncate">{h.title || "Tanpa judul"}</span>
                    <span className="text-xs text-muted-foreground">
                      {DECISION[h.decision]?.label ?? h.decision} · {formatDate(h.createdAt)}
                    </span>
                  </Link>
                  <button onClick={() => remove(h.id)} className="mt-1.5 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-surface-2 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Hapus laporan">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {!saved ? (
        <EmptyState icon={<Users />} title="Belum ada hasil review">
          Hasilnya berupa keputusan panel, daftar revisi berprioritas, penilaian per kriteria, dan pertanyaan yang mungkin muncul saat sidang.
        </EmptyState>
      ) : (
        <ReviewResultView saved={saved} />
      )}
    </div>
  );
}

function AnchorBadge({ anchor }: { anchor: string }) {
  if (anchor === "found") return <Badge tone="success"><CircleCheck className="size-3" /> Kutipan terverifikasi</Badge>;
  if (anchor === "partial") return <Badge tone="warning">Kutipan mirip, cek lagi</Badge>;
  if (anchor === "absence") return <Badge>Bagian yang belum ada</Badge>;
  return <Badge tone="danger">Kutipan tidak ditemukan di teks — abaikan atau cek manual</Badge>;
}

function Evidence({ text, anchor }: { text: string; anchor: string }) {
  if (!text) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <p className="flex gap-1.5 rounded-md bg-surface px-2 py-1 text-xs leading-relaxed text-muted-foreground">
        <Quote className="mt-0.5 size-3 shrink-0" /> <span className={anchor === "not_found" ? "line-through decoration-danger/50" : ""}>{text}</span>
      </p>
      <div>
        <AnchorBadge anchor={anchor} />
      </div>
    </div>
  );
}

function ReviewResultView({ saved }: { saved: Saved }) {
  const r = saved.result;
  const s = r.synthesis;
  const decision = DECISION[s.decision] ?? DECISION.major_revision!;
  const a = r.anchorStats;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Keputusan panel — ${saved.title || "naskah"}`} actions={<span className="text-xs text-muted-foreground">{formatDate(saved.createdAt)}</span>}>
        <div className="flex flex-wrap items-center gap-2">
          <Gavel className="size-5 text-muted-foreground" />
          <Badge tone={decision.tone} className="px-2.5 py-1 text-sm">{decision.label}</Badge>
          {r.context.field && <Badge>{r.context.field}</Badge>}
          <Badge>{r.context.stage === "proposal" ? "Proposal" : "Skripsi lengkap"}</Badge>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{s.rationale}</p>
        {s.verified.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Sudah terpenuhi</p>
            <div className="mt-1 flex flex-wrap gap-1.5">{s.verified.map((v, i) => <Badge key={i} tone="success">{v}</Badge>)}</div>
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Revisi wajib (urut prioritas)</p>
            {s.requiredRevisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {s.requiredRevisions.map((rv, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">{i + 1}</span>
                    <span>
                      {rv.item}
                      {rv.sources.length > 0 && <span className="ml-1 text-xs text-muted-foreground">— {rv.sources.map((x) => ROLE[x] ?? x).join(", ")}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {s.nextSteps.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Langkah minggu ini</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">{s.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {s.optionalSuggestions.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Saran opsional</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{s.optionalSuggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {s.disagreements.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Perbedaan pendapat penguji</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{s.disagreements.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Alert tone={a.notFound > 0 ? "warning" : "neutral"} className="text-xs">
        Cek kutipan bukti: {a.found} terverifikasi, {a.partial} mirip, {a.absence} menunjuk bagian yang belum ada, {a.notFound} tidak ditemukan di teks.
        {a.notFound > 0 && " Temuan dengan kutipan yang tidak ditemukan tidak dipakai untuk keputusan panel. Cek manual sebelum dipercaya."}
        {r.truncated && ` Naskah dipotong pada ${r.chars.toLocaleString("id-ID")} karakter pertama; review per bab untuk hasil lengkap.`}
      </Alert>

      <Tabs defaultValue="methodology">
        <TabsList className="h-auto flex-wrap">
          {r.reviewers.map((rv) => (
            <TabsTrigger key={rv.role} value={rv.role}>
              <ShieldQuestion /> {ROLE[rv.role]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="da">
            <Swords /> Devil&apos;s Advocate
          </TabsTrigger>
        </TabsList>

        {r.reviewers.map((rv) => (
          <TabsContent key={rv.role} value={rv.role} className="flex flex-col gap-4">
            <Panel title="Ringkasan">
              <p className="text-sm leading-relaxed">{rv.summary}</p>
            </Panel>
            <Panel title="Penilaian per kriteria">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Kriteria</th>
                      <th className="py-2 pr-3 font-medium">Penilaian</th>
                      <th className="py-2 font-medium">Alasan &amp; bukti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border align-top">
                    {rv.judgements.map((j, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 font-medium">{j.criterion}</td>
                        <td className="py-2 pr-3"><Badge tone={VERDICT[j.verdict]?.tone ?? "neutral"}>{VERDICT[j.verdict]?.label ?? j.verdict}</Badge></td>
                        <td className="py-2">
                          <p>{j.rationale}</p>
                          {j.uncertainty && <p className="mt-1 text-xs text-muted-foreground">Ketidakpastian: {j.uncertainty}</p>}
                          {j.verdict !== "NOT_ASSESSED" && <Evidence text={j.evidence} anchor={j.anchor} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Penilaian berupa kategori per kriteria, bukan skor. Kategori tidak dijumlahkan menjadi nilai akhir.</p>
            </Panel>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Kelemahan (${rv.weaknesses.length})`}>
                {rv.weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada.</p> : (
                  <ul className="flex flex-col gap-4">
                    {rv.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex items-start gap-2">
                          <Badge tone={SEVERITY[w.severity]?.tone}>{SEVERITY[w.severity]?.label}</Badge>
                          <p className="font-medium">{w.issue}</p>
                        </div>
                        {w.why && <p className="mt-1 text-muted-foreground">{w.why}</p>}
                        <Evidence text={w.evidence} anchor={w.anchor} />
                        {w.suggestion && <p className="mt-1.5 text-sm">Saran: {w.suggestion}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title={`Kekuatan (${rv.strengths.length})`}>
                {rv.strengths.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada yang disebutkan.</p> : (
                  <ul className="flex flex-col gap-4">
                    {rv.strengths.map((st, i) => (
                      <li key={i} className="text-sm">
                        <p>{st.point}</p>
                        <Evidence text={st.evidence} anchor={st.anchor} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            {rv.questions.length > 0 && (
              <Panel title="Pertanyaan yang mungkin diajukan saat sidang">
                <ul className="flex flex-col gap-2 text-sm">
                  {rv.questions.map((q, i) => (
                    <li key={i} className="flex gap-2"><MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {q}</li>
                  ))}
                </ul>
              </Panel>
            )}
          </TabsContent>
        ))}

        <TabsContent value="da" className="flex flex-col gap-4">
          <Panel title="Argumen tandingan terkuat">
            <p className="text-sm leading-relaxed">{r.devilsAdvocate.strongestCounterArgument}</p>
            {r.devilsAdvocate.unexaminedPremise && (
              <p className="mt-3 text-sm"><span className="font-medium">Asumsi yang belum diuji:</span> {r.devilsAdvocate.unexaminedPremise}</p>
            )}
          </Panel>
          <Panel title={`Titik lemah (${r.devilsAdvocate.issues.length})`}>
            <ul className="flex flex-col gap-4">
              {r.devilsAdvocate.issues.map((x, i) => (
                <li key={i} className="text-sm">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge tone={SEVERITY[x.severity]?.tone}>{SEVERITY[x.severity]?.label}</Badge>
                    <Badge>{DIMENSION[x.dimension] ?? x.dimension}</Badge>
                    <p className="font-medium">{x.issue}</p>
                  </div>
                  <Evidence text={x.evidence} anchor={x.anchor} />
                  {x.suggestion && <p className="mt-1.5">Saran: {x.suggestion}</p>}
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            {r.devilsAdvocate.alternativeExplanations.length > 0 && (
              <Panel title="Penjelasan alternatif">
                <ul className="list-disc space-y-1 pl-5 text-sm">{r.devilsAdvocate.alternativeExplanations.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </Panel>
            )}
            {r.devilsAdvocate.defenseQuestions.length > 0 && (
              <Panel title="Pertanyaan tersulit untuk disiapkan">
                <ul className="flex flex-col gap-2 text-sm">
                  {r.devilsAdvocate.defenseQuestions.map((q, i) => (
                    <li key={i} className="flex gap-2"><MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {q}</li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <History className="mt-0.5 size-3.5 shrink-0" />
        Ini simulasi untuk latihan, bukan penilaian resmi dosen. Keputusan tetap ada pada Anda dan pembimbing. Metode diadaptasi dari academic-paper-reviewer di academic-research-skills (Cheng-I Wu, CC BY-NC 4.0).
      </p>
    </div>
  );
}
