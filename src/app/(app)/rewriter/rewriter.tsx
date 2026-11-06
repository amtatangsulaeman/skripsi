"use client";

import { useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Label, Select } from "@/components/ui/primitives";
import { CheckboxChip, CopyButton, DiffText, IntegrityNotice, Panel, TextInput } from "@/components/tools/shared";
import { errorMessage, postJson } from "@/lib/client-api";
import { diffWords } from "@/lib/diff";
import type { IntegrityReport } from "@/lib/ai/integrity";
import { LANGUAGES, REWRITE_GOALS, type Language, type RewriteGoal } from "@/lib/options";

const MAX = 6000;

type Result = {
  revised: string;
  alternatives: string[];
  explanations: { change: string; reason: string }[];
  integrity: IntegrityReport;
  source: string;
};

export function Rewriter({ defaultLanguage }: { defaultLanguage: Language }) {
  const [text, setText] = useState("");
  const [goals, setGoals] = useState<RewriteGoal[]>(["academic_tone", "structure"]);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const diff = useMemo(() => (result ? diffWords(result.source, result.revised) : []), [result]);

  async function run() {
    if (!text.trim()) return toast.error("Masukkan kalimat atau paragraf.");
    if (!goals.length) return toast.error("Pilih minimal satu tujuan perbaikan.");
    setLoading(true);
    try {
      const res = await postJson<Omit<Result, "source">>("/api/ai/rewrite", { text, goals, language });
      setResult({ ...res, source: text });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Kalimat / paragraf asli">
        <div className="mb-4 flex flex-col gap-2">
          <Label>Tujuan perbaikan</Label>
          <div className="flex flex-wrap gap-1.5">
            {REWRITE_GOALS.map((g) => (
              <CheckboxChip
                key={g.value}
                label={g.label}
                checked={goals.includes(g.value)}
                onChange={(on) => setGoals((p) => (on ? [...p, g.value] : p.filter((x) => x !== g.value)))}
              />
            ))}
          </div>
        </div>
        <TextInput value={text} onChange={setText} maxChars={MAX} rows={8} placeholder="Contoh: Penelitian ini mengggunakan metode kuantitatif dengan studi kasus yang dipilih untuk memahami…" />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rw-lang">Bahasa</Label>
            <Select id="rw-lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="w-48">
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={run} loading={loading}>
            <PenLine /> Tulis ulang
          </Button>
        </div>
      </Panel>

      <Panel title="Hasil revisi" actions={result && <CopyButton text={result.revised} />}>
        {!result ? (
          <EmptyState icon={<PenLine />} title="Belum ada revisi">
            Versi revisi, alternatif, dan penjelasan perubahan akan tampil di sini.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Asli</p>
              <div className="rounded-lg bg-surface p-3">
                <DiffText parts={diff} side="before" />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Revisi</p>
              <div className="rounded-lg bg-surface p-3">
                <DiffText parts={diff} side="after" />
              </div>
            </div>
            <IntegrityNotice report={result.integrity} />
            {result.alternatives.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Versi alternatif</p>
                <ul className="flex flex-col gap-2">
                  {result.alternatives.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
                      <span className="whitespace-pre-wrap">{a}</span>
                      <CopyButton text={a} label="" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.explanations.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Penjelasan perubahan</p>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {result.explanations.map((x, i) => (
                    <li key={i} className="p-3 text-sm">
                      <p className="font-medium">{x.change}</p>
                      <p className="mt-0.5 text-muted-foreground">{x.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
