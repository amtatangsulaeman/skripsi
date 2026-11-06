"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Eye, FileCog, FileUp, Info, Save, Trash2, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, Input, Label, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { Panel } from "@/components/tools/shared";
import { UploadButton } from "../documents/library-client";
import { ApiClientError, errorMessage, getJson, postForm, postJson, uploadDirect } from "@/lib/client-api";
import { DEFAULT_FORMATTING, type FormattingConfig } from "@/lib/formatter/profile";
import type { PreviewPage } from "@/lib/formatter/preview";
import { ProfileEditor } from "./profile-editor";

type DocOption = { id: string; title: string; fileType: string };
type Profile = { id: string; universityName: string; configuration: FormattingConfig };
type Analysis = {
  pages: PreviewPage[];
  outline: { key: string; title: string; blocks: number; subheadings: string[]; generated: boolean }[];
  changes: string[];
  warnings: { level: "info" | "warning" | "error"; message: string }[];
  stats: { words: number; tables: number; images: number; citations: number; paragraphs: number };
  sourceKind: string;
};

export function Formatter({ documents, initialDocId, defaults }: {
  documents: DocOption[];
  initialDocId?: string;
  defaults: { profileId: string; font: "Times New Roman" | "Arial"; fontSize: number; lineSpacing: 1.5 | 2 };
}) {
  const [docs, setDocs] = useState(documents);
  const [docId, setDocId] = useState(initialDocId && documents.some((d) => d.id === initialDocId) ? initialDocId : documents[0]?.id ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [config, setConfig] = useState<FormattingConfig>(DEFAULT_FORMATTING);
  const [profileName, setProfileName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<"" | "analyze" | "export" | "save" | "guidelines">("");
  const [problems, setProblems] = useState<string[] | null>(null);
  const [result, setResult] = useState<{ id: string; title: string } | null>(null);
  const [applied, setApplied] = useState<string[] | null>(null);
  const guideRef = useRef<HTMLInputElement>(null);

  async function loadProfiles(selectId?: string) {
    try {
      const { profiles } = await getJson<{ profiles: Profile[] }>("/api/profiles");
      setProfiles(profiles);
      const pick = profiles.find((p) => p.id === (selectId ?? defaults.profileId)) ?? profiles[0];
      if (pick) selectProfile(pick);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectProfile(p: Profile) {
    setProfileId(p.id);
    setProfileName(p.universityName);
    setConfig(p.configuration);
    setDirty(false);
    setAnalysis(null);
  }

  function updateConfig(c: FormattingConfig) {
    setConfig(c);
    setDirty(true);
  }

  function newProfile() {
    setProfileId("");
    setProfileName("Profil baru");
    setConfig({
      ...DEFAULT_FORMATTING,
      font: { family: defaults.font, size: defaults.fontSize },
      paragraph: { ...DEFAULT_FORMATTING.paragraph, lineSpacing: defaults.lineSpacing },
    });
    setDirty(true);
  }

  async function saveProfile(asNew: boolean) {
    if (!profileName.trim()) return toast.error("Beri nama profil (mis. nama universitas).");
    setBusy("save");
    try {
      if (profileId && !asNew) {
        await postJson(`/api/profiles/${profileId}`, { universityName: profileName, configuration: config }, "PATCH");
        await loadProfiles(profileId);
      } else {
        const { profile } = await postJson<{ profile: { id: string } }>("/api/profiles", { universityName: profileName, configuration: config });
        await loadProfiles(profile.id);
      }
      toast.success("Profil format disimpan.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function deleteProfile() {
    if (!profileId || !confirm(`Hapus profil "${profileName}"?`)) return;
    try {
      await postJson(`/api/profiles/${profileId}`, {}, "DELETE");
      toast.success("Profil dihapus.");
      await loadProfiles();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function analyzeGuidelines(file: File | undefined) {
    if (!file) return;
    setBusy("guidelines");
    try {
      type Res = { config: FormattingConfig; applied: string[]; extracted: { universityName: string | null }; truncated: boolean };
      const ref = await uploadDirect(file);
      let res: Res;
      if (ref) {
        res = await postJson<Res>("/api/profiles/analyze-guidelines", { upload: ref, base: JSON.stringify(config) });
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("base", JSON.stringify(config));
        res = await postForm<Res>("/api/profiles/analyze-guidelines", form);
      }
      setConfig(res.config);
      setDirty(true);
      setProfileId("");
      setProfileName(res.extracted.universityName ? `${res.extracted.universityName} (dari pedoman)` : `Pedoman — ${file.name}`);
      setApplied(res.applied);
      if (res.truncated) toast.info("Pedoman sangat panjang: hanya bagian awal yang dianalisis.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
      if (guideRef.current) guideRef.current.value = "";
    }
  }

  async function analyze() {
    if (!docId) return toast.error("Pilih dokumen terlebih dahulu.");
    setBusy("analyze");
    setResult(null);
    try {
      setAnalysis(await postJson<Analysis>("/api/formatter/analyze", { documentId: docId, config }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function exportDocx(acknowledgeProblems = false) {
    setBusy("export");
    try {
      const res = await postJson<{ document: { id: string; title: string }; problems: string[] }>("/api/formatter/export", {
        documentId: docId,
        config,
        profileName,
        acknowledgeProblems,
      });
      setProblems(null);
      setResult(res.document);
      toast.success("DOCX terformat berhasil dibuat. Dokumen asli tidak diubah.");
      window.location.href = `/api/documents/${res.document.id}/file`;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) {
        setProblems(Array.isArray(e.data.problems) ? (e.data.problems as string[]) : [e.message]);
      } else toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  const errors = analysis?.warnings.filter((w) => w.level === "error") ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-4">
        <Panel title="1. Dokumen skripsi">
          {docs.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">Belum ada dokumen DOCX/PDF di pustaka.</p>
          ) : (
            <Select value={docId} onChange={(e) => (setDocId(e.target.value), setAnalysis(null), setResult(null))} aria-label="Pilih dokumen">
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.fileType.toUpperCase()})
                </option>
              ))}
            </Select>
          )}
          <div className="mt-3 flex items-center gap-2">
            <UploadButton
              variant="outline"
              label="Unggah DOCX/PDF"
              onUploaded={(d) => {
                if (d.fileType === "txt") return;
                setDocs((prev) => [{ id: d.id, title: d.title, fileType: d.fileType }, ...prev]);
                setDocId(d.id);
                setAnalysis(null);
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">DOCX disarankan, karena tabel, gambar, dan cetak tebal/miring ikut dipertahankan.</p>
        </Panel>

        <Panel
          title="2. Profil format"
          actions={
            <Button variant="ghost" size="sm" onClick={newProfile}>
              Baru
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Select value={profileId} onChange={(e) => { const p = profiles.find((x) => x.id === e.target.value); if (p) selectProfile(p); }} aria-label="Pilih profil">
              {!profileId && <option value="">{profileName || "Profil belum disimpan"}</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.universityName}
                </option>
              ))}
            </Select>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-name">Nama profil / universitas</Label>
              <Input id="profile-name" value={profileName} onChange={(e) => (setProfileName(e.target.value), setDirty(true))} maxLength={200} />
            </div>
            <input ref={guideRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => analyzeGuidelines(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => guideRef.current?.click()} loading={busy === "guidelines"}>
              <Wand2 /> Analisis pedoman kampus (PDF/DOCX)
            </Button>
            {applied && (
              <Alert tone="primary">
                <p className="mb-1 font-medium">Aturan yang terbaca dari pedoman ({applied.length}):</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">{applied.map((a) => <li key={a}>{a}</li>)}</ul>
                <p className="mt-2 text-xs">Aturan yang tidak tertulis eksplisit di pedoman tetap memakai nilai sebelumnya. Periksa lalu simpan profilnya.</p>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => saveProfile(false)} loading={busy === "save"} disabled={!dirty}>
                <Save /> {profileId ? "Simpan" : "Simpan profil"}
              </Button>
              {profileId && (
                <Button size="sm" variant="outline" onClick={() => saveProfile(true)}>
                  Simpan sebagai baru
                </Button>
              )}
              {profileId && (
                <Button size="sm" variant="ghost" onClick={deleteProfile} aria-label="Hapus profil">
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-5 max-h-[55dvh] overflow-y-auto pr-1">
            <ProfileEditor value={config} onChange={updateConfig} />
          </div>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Panel
          title="3. Pratinjau & validasi"
          actions={
            <>
              <Button size="sm" variant="outline" onClick={analyze} loading={busy === "analyze"} disabled={!docId}>
                <Eye /> {analysis ? "Perbarui pratinjau" : "Analisis & pratinjau"}
              </Button>
              <Button size="sm" onClick={() => exportDocx(false)} loading={busy === "export"} disabled={!analysis || errors.length > 0}>
                <Download /> Ekspor DOCX
              </Button>
            </>
          }
        >
          {!analysis ? (
            <EmptyState icon={<FileCog />} title="Belum ada pratinjau">
              Pilih dokumen dan profil, lalu klik <strong>Analisis & pratinjau</strong>. Struktur, perubahan, dan peringatan akan muncul di sini sebelum ekspor.
            </EmptyState>
          ) : (
            <Tabs defaultValue="check">
              <TabsList>
                <TabsTrigger value="check">Validasi</TabsTrigger>
                <TabsTrigger value="changes">Perubahan ({analysis.changes.length})</TabsTrigger>
                <TabsTrigger value="outline">Struktur</TabsTrigger>
                <TabsTrigger value="preview">Pratinjau</TabsTrigger>
              </TabsList>

              <TabsContent value="check" className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ["Kata", analysis.stats.words],
                    ["Paragraf", analysis.stats.paragraphs],
                    ["Tabel", analysis.stats.tables],
                    ["Gambar", analysis.stats.images],
                    ["Sitasi", analysis.stats.citations],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface p-3">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="text-lg font-semibold tabular-nums">{Number(v).toLocaleString("id-ID")}</p>
                    </div>
                  ))}
                </div>
                {analysis.warnings.length === 0 ? (
                  <Alert tone="success" className="flex items-center gap-2">
                    <CheckCircle2 className="size-4" /> Struktur lengkap sesuai profil. Tidak ada peringatan.
                  </Alert>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {analysis.warnings.map((w, i) => (
                      <li key={i} className={`flex gap-2 rounded-lg p-3 text-sm ${w.level === "error" ? "bg-danger-soft text-danger" : w.level === "warning" ? "bg-warning-soft text-warning" : "bg-surface"}`}>
                        {w.level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : w.level === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
                        <span className="text-foreground">{w.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Sebelum ekspor, jumlah kata, tabel, dan gambar hasil format dicocokkan dengan dokumen asli. Kalau ada yang berkurang, ekspor dihentikan dan kamu akan diberi tahu. Daftar isi, gambar, dan tabel berupa field Word: saat dokumen dibuka, pilih <em>Yes</em> untuk memperbarui field (atau klik kanan → Update Field).
                </p>
              </TabsContent>

              <TabsContent value="changes">
                {analysis.changes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada perubahan struktur. Yang diterapkan hanya gaya profil: font, spasi, margin, dan penomoran halaman.</p>
                ) : (
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">{analysis.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Gaya profil juga diterapkan ke seluruh dokumen: {config.font.family} {config.font.size} pt, spasi {config.paragraph.lineSpacing}, margin {config.page.margins.top}/{config.page.margins.bottom}/{config.page.margins.left}/{config.page.margins.right} cm.</p>
              </TabsContent>

              <TabsContent value="outline">
                <ol className="flex flex-col gap-2">
                  {analysis.outline.map((s, i) => (
                    <li key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{s.title}</span>
                        <span className="flex gap-1.5">
                          {s.generated && <Badge tone="primary">otomatis</Badge>}
                          <Badge>{s.blocks} blok</Badge>
                        </span>
                      </div>
                      {s.subheadings.length > 0 && (
                        <ul className="mt-2 space-y-0.5 pl-3 text-xs text-muted-foreground">{s.subheadings.map((h, k) => <li key={k}>{h}</li>)}</ul>
                      )}
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="preview">
                <div className="flex flex-col items-center gap-6 rounded-lg bg-surface-2 p-4 sm:p-6">
                  {analysis.pages.map((p) => (
                    <div key={p.key} className="w-full max-w-[42rem]">
                      <p className="mb-1.5 text-xs text-muted-foreground">{p.label}</p>
                      <article
                        className="tm-page overflow-hidden"
                        style={{
                          fontFamily: `"${config.font.family}", ${config.font.family === "Arial" ? "sans-serif" : "serif"}`,
                          fontSize: `${config.font.size}pt`,
                          padding: `${config.page.margins.top * 0.6}cm ${config.page.margins.right * 0.6}cm ${config.page.margins.bottom * 0.6}cm ${config.page.margins.left * 0.6}cm`,
                          minHeight: "20rem",
                        }}
                        dangerouslySetInnerHTML={{ __html: p.html }}
                      />
                      <p className="mt-1 text-center text-[11px] text-muted-foreground">
                        Nomor halaman: {p.pageNumberStyle === "roman" ? "romawi (i, ii…)" : p.pageNumberStyle === "arabic" ? "arab (1, 2…)" : "tanpa nomor"}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
          {result && (
            <Alert tone="success" className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span>Tersimpan sebagai dokumen baru: {result.title}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/documents/${result.id}/file`}>
                    <Download /> Unduh lagi
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/documents/${result.id}`}>Buka</Link>
                </Button>
              </span>
            </Alert>
          )}
        </Panel>
      </div>

      <Dialog open={!!problems} onOpenChange={(o) => !o && setProblems(null)}>
        <DialogContent title="Periksa keutuhan konten" description="Ekspor dihentikan karena hasilnya tidak sama persis dengan dokumen asli.">
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">{problems?.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setProblems(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => exportDocx(true)} loading={busy === "export"}>
              <FileUp /> Tetap ekspor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
