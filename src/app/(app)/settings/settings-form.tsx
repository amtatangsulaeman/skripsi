"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label, Select } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/radix";
import { Panel } from "@/components/tools/shared";
import { errorMessage, postJson } from "@/lib/client-api";
import { GEMINI_MODEL_SUGGESTIONS, PARAPHRASE_MODES } from "@/lib/options";
import type { AppSettings } from "@/lib/settings-schema";
import { formatBytes } from "@/lib/utils";

const FEATURE: Record<string, string> = {
  paraphrase: "Paraphraser",
  rewrite: "Rewriter",
  grammar: "Grammar",
  analyze_document: "Analisis dokumen",
  analyze_guidelines: "Analisis pedoman",
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_16rem] sm:items-center">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsForm({ initial, profiles, envInfo, stats }: {
  initial: AppSettings;
  profiles: { id: string; universityName: string }[];
  envInfo: { apiKeyConfigured: boolean; apiKeyCount: number; fallbackModel: string; envModel: string; storageKind: "supabase" | "local"; storageDir: string; maxUploadMb: number; sessionHours: number };
  stats: { files: number; bytes: number; documents: number; history: number; usage: { feature: string; requests: number; tokens: number }[] };
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    try {
      await postJson("/api/settings", s, "PATCH");
      document.documentElement.classList.toggle("dark", s.theme === "dark");
      toast.success("Pengaturan disimpan.");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function clear(what: "history" | "usage") {
    if (!confirm(what === "history" ? "Hapus semua riwayat parafrasa/rewrite/grammar?" : "Hapus semua log pemakaian token?")) return;
    try {
      const { deleted } = await postJson<{ deleted: number }>(`/api/settings?what=${what}`, {}, "DELETE");
      toast.success(`${deleted} entri dihapus.`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const totalTokens = stats.usage.reduce((a, u) => a + u.tokens, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <Panel title="AI — Google Gemini">
          <div className="divide-y divide-border">
            <Row
              label="API key"
              hint="Diatur lewat GEMINI_API_KEY, GEMINI_API_KEY_2, dst. di file .env server. Kalau satu key kena batas kuota, key berikutnya otomatis dipakai. Nilai key tidak pernah ditampilkan."
            >
              {envInfo.apiKeyConfigured ? (
                <Badge tone="success"><CheckCircle2 className="size-3" /> {envInfo.apiKeyCount} key aktif</Badge>
              ) : (
                <Badge tone="danger"><XCircle className="size-3" /> Belum diatur</Badge>
              )}
            </Row>
            <Row label="Model Gemini" hint={`Kosongkan untuk memakai GEMINI_MODEL dari .env (${envInfo.envModel}). Kuota free tier terbatas per menit dan per hari.`}>
              <Input list="model-suggestions" value={s.geminiModel} placeholder={envInfo.envModel} onChange={(e) => set("geminiModel", e.target.value.trim())} />
              <datalist id="model-suggestions">
                {GEMINI_MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </Row>
            <Row label="Model cadangan" hint="GEMINI_FALLBACK_MODEL di .env. Dipakai kalau kuota model utama habis di semua key.">
              <span className="text-sm">{envInfo.fallbackModel || <span className="text-muted-foreground">tidak diatur</span>}</span>
            </Row>
            <Row label="Mode parafrasa default">
              <Select value={s.defaultParaphraseMode} onChange={(e) => set("defaultParaphraseMode", e.target.value as AppSettings["defaultParaphraseMode"])}>
                {PARAPHRASE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Row>
            <Row label="Bahasa default" hint="Bahasa awal untuk Paraphraser, Rewriter, dan Grammar Checker.">
              <Select value={s.defaultLanguage} onChange={(e) => set("defaultLanguage", e.target.value as "id" | "en")}>
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </Select>
            </Row>
            <Row label="Simpan riwayat AI" hint="Menyimpan teks asli dan hasil parafrasa/rewrite/grammar di database lokal.">
              <Switch checked={s.saveHistory} onCheckedChange={(v) => set("saveHistory", v)} />
            </Row>
          </div>
        </Panel>

        <Panel title="Format dokumen default">
          <div className="divide-y divide-border">
            <Row label="Profil format default" hint="Profil yang langsung dipilih saat membuka Thesis Formatter.">
              <Select value={s.defaultProfileId} onChange={(e) => set("defaultProfileId", e.target.value)}>
                <option value="">(profil pertama)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.universityName}</option>)}
              </Select>
            </Row>
            <Row label="Font default" hint="Dipakai saat membuat profil format baru.">
              <Select value={s.defaultFont} onChange={(e) => set("defaultFont", e.target.value as AppSettings["defaultFont"])}>
                <option>Times New Roman</option>
                <option>Arial</option>
              </Select>
            </Row>
            <Row label="Ukuran font default">
              <Select value={s.defaultFontSize} onChange={(e) => set("defaultFontSize", Number(e.target.value))}>
                {[10, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{n} pt</option>)}
              </Select>
            </Row>
            <Row label="Spasi baris default">
              <Select value={s.defaultLineSpacing} onChange={(e) => set("defaultLineSpacing", Number(e.target.value) as 1.5 | 2)}>
                <option value={1.5}>1,5</option>
                <option value={2}>2,0</option>
              </Select>
            </Row>
          </div>
        </Panel>

        <Panel title="Tampilan">
          <Row label="Tema">
            <Select value={s.theme} onChange={(e) => set("theme", e.target.value as "light" | "dark")}>
              <option value="light">Terang</option>
              <option value="dark">Gelap</option>
            </Select>
          </Row>
        </Panel>

        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={save} loading={saving} disabled={!dirty} className="shadow-sm">
            <Save /> Simpan pengaturan
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Penyimpanan dokumen">
          <dl className="flex flex-col gap-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">{envInfo.storageKind === "supabase" ? "Bucket privat (SUPABASE_BUCKET)" : "Direktori privat (STORAGE_DIR)"}</dt><dd className="break-all font-mono text-xs">{envInfo.storageDir}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Dokumen</dt><dd>{stats.documents}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">File tersimpan</dt><dd>{stats.files} · {formatBytes(stats.bytes)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Batas unggah</dt><dd>{envInfo.maxUploadMb} MB</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {envInfo.storageKind === "supabase"
              ? "File disimpan di bucket Supabase privat dan hanya bisa diunduh lewat tautan sementara setelah login."
              : "Direktori ini berada di luar folder publik, jadi file hanya bisa diunduh setelah login. Ubah lokasinya lewat STORAGE_DIR di .env."}
          </p>
        </Panel>

        <Panel title="Pemakaian AI (30 hari)">
          {stats.usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pemakaian.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {stats.usage.map((u) => (
                <li key={u.feature} className="flex justify-between gap-2">
                  <span>{FEATURE[u.feature] ?? u.feature}</span>
                  <span className="tabular-nums text-muted-foreground">{u.requests}× · {u.tokens.toLocaleString("id-ID")}</span>
                </li>
              ))}
              <li className="mt-1 flex justify-between border-t border-border pt-2 font-medium">
                <span>Total token</span>
                <span className="tabular-nums">{totalTokens.toLocaleString("id-ID")}</span>
              </li>
            </ul>
          )}
        </Panel>

        <Panel title="Data & keamanan">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><KeyRound className="size-3.5" /> Sesi login berlaku {envInfo.sessionHours} jam.</p>
            <Button variant="outline" size="sm" onClick={() => clear("history")} disabled={!stats.history}>
              Hapus riwayat AI ({stats.history})
            </Button>
            <Button variant="outline" size="sm" onClick={() => clear("usage")}>
              Reset log pemakaian
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
