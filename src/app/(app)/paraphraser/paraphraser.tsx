"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, RefreshCw, Replace, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Label, Select } from "@/components/ui/primitives";
import { CheckboxChip, CopyButton, DiffText, IntegrityNotice, Panel, TextInput } from "@/components/tools/shared";
import { errorMessage, postJson } from "@/lib/client-api";
import { changeRatio, diffWords } from "@/lib/diff";
import type { IntegrityReport } from "@/lib/ai/integrity";
import {
  INTENSITIES,
  LANGUAGES,
  PARAPHRASE_MODES,
  PRESERVE_OPTIONS,
  type Intensity,
  type Language,
  type ParaphraseMode,
  type PreserveKey,
} from "@/lib/options";

const MAX = 15000;

type Version = {
  source: string;
  paraphrased: string;
  notes: string[];
  integrity: IntegrityReport;
  mode: ParaphraseMode;
  intensity: Intensity;
  tokens: number;
};

export function Paraphraser({ defaultMode, defaultLanguage, initialText, documentId }: {
  defaultMode: ParaphraseMode;
  defaultLanguage: Language;
  initialText?: string;
  documentId?: string;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [mode, setMode] = useState<ParaphraseMode>(defaultMode);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [preserve, setPreserve] = useState<PreserveKey[]>(PRESERVE_OPTIONS.map((p) => p.key));
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState(0);
  const [compareWith, setCompareWith] = useState<"original" | number>("original");
  const [view, setView] = useState<"highlight" | "clean">("highlight");
  const [loading, setLoading] = useState(false);

  const current = versions[active];
  const diff = useMemo(() => {
    if (!current) return [];
    const base = compareWith === "original" ? current.source : versions[compareWith]?.paraphrased ?? current.source;
    return diffWords(base, current.paraphrased);
  }, [current, compareWith, versions]);

  async function run(source = text) {
    if (!source.trim()) return toast.error("Masukkan teks terlebih dahulu.");
    if (source.length > MAX) return toast.error(`Maksimal ${MAX.toLocaleString("id-ID")} karakter.`);
    setLoading(true);
    try {
      const res = await postJson<Omit<Version, "source" | "mode" | "intensity">>("/api/ai/paraphrase", {
        text: source,
        mode,
        intensity,
        preserve,
        language,
        documentId,
      });
      const v: Version = { ...res, source, mode, intensity };
      setVersions((prev) => {
        const next = [...prev, v].slice(-8);
        setActive(next.length - 1);
        return next;
      });
      setCompareWith("original");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function replaceOriginal() {
    if (!current) return;
    setText(current.paraphrased);
    toast.success("Teks asli diganti dengan hasil parafrasa. Versi sebelumnya tetap ada di riwayat versi.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mode">Mode</Label>
          <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as ParaphraseMode)}>
            {PARAPHRASE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{PARAPHRASE_MODES.find((m) => m.value === mode)?.hint}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Intensitas</Label>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="radiogroup" aria-label="Intensitas">
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                type="button"
                role="radio"
                aria-checked={intensity === i.value}
                onClick={() => setIntensity(i.value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${intensity === i.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lang">Bahasa</Label>
          <Select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label>Pertahankan</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRESERVE_OPTIONS.map((p) => (
              <CheckboxChip
                key={p.key}
                label={p.label}
                checked={p.key === "meaning" || preserve.includes(p.key)}
                onChange={(on) => {
                  if (p.key === "meaning") return toast.info("Makna asli selalu dipertahankan.");
                  setPreserve((prev) => (on ? [...prev, p.key] : prev.filter((k) => k !== p.key)));
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Teks asli">
          <TextInput value={text} onChange={setText} maxChars={MAX} placeholder="Tempel paragraf skripsi di sini…" />
          <Button className="mt-3 w-full sm:w-auto" onClick={() => run()} loading={loading}>
            <Sparkles /> Parafrasa
          </Button>
        </Panel>

        <Panel
          title="Hasil parafrasa"
          actions={
            current && (
              <>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(["highlight", "clean"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`rounded-md px-2 py-1 text-xs ${view === v ? "bg-surface-2 font-medium" : "text-muted-foreground"}`}
                    >
                      {v === "highlight" ? "Sorot perubahan" : "Bersih"}
                    </button>
                  ))}
                </div>
                <CopyButton text={current.paraphrased} />
              </>
            )
          }
        >
          {loading && !current ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Memproses dengan Gemini…</div>
          ) : !current ? (
            <EmptyState icon={<Sparkles />} title="Hasil akan muncul di sini">
              Perubahan kata dan kalimat akan disorot.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{PARAPHRASE_MODES.find((m) => m.value === current.mode)?.label}</Badge>
                <Badge>Intensitas {INTENSITIES.find((i) => i.value === current.intensity)?.label.toLowerCase()}</Badge>
                <Badge>{changeRatio(diff)}% kata berubah</Badge>
                <Badge>{current.tokens.toLocaleString("id-ID")} token</Badge>
              </div>
              <div className="max-h-[28rem] overflow-y-auto rounded-lg bg-surface p-3">
                {view === "highlight" ? <DiffText parts={diff} side="after" /> : <p className="whitespace-pre-wrap text-sm leading-relaxed">{current.paraphrased}</p>}
              </div>
              <IntegrityNotice report={current.integrity} />
              {current.notes.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {current.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => run(current.source)} loading={loading}>
                  <RefreshCw /> Regenerasi
                </Button>
                <Button variant="outline" size="sm" onClick={replaceOriginal}>
                  <Replace /> Ganti teks asli
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {current && (
        <Panel
          title="Bandingkan versi"
          actions={
            <div className="flex items-center gap-2 text-xs">
              <ArrowLeftRight className="size-3.5 text-muted-foreground" />
              <Select className="h-8 w-auto text-xs" value={String(compareWith)} onChange={(e) => setCompareWith(e.target.value === "original" ? "original" : Number(e.target.value))}>
                <option value="original">Teks asli</option>
                {versions.map((_, i) => i !== active && (
                  <option key={i} value={i}>
                    Versi {i + 1}
                  </option>
                ))}
              </Select>
              <span className="text-muted-foreground">vs</span>
              <Select className="h-8 w-auto text-xs" value={active} onChange={(e) => { setActive(Number(e.target.value)); setCompareWith("original"); }}>
                {versions.map((_, i) => (
                  <option key={i} value={i}>
                    Versi {i + 1}
                  </option>
                ))}
              </Select>
            </div>
          }
        >
          <p className="mb-2 text-xs text-muted-foreground">
            <span className="rounded-sm bg-diff-del px-1 text-diff-del-fg">dihapus</span>{" "}
            <span className="rounded-sm bg-diff-add px-1 text-diff-add-fg">ditambahkan</span>
          </p>
          <div className="max-h-[32rem] overflow-y-auto">
            <DiffText parts={diff} side="both" />
          </div>
        </Panel>
      )}
    </div>
  );
}
