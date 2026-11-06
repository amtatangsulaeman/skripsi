"use client";

import { useMemo, useState } from "react";
import { Replace, SpellCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Label, Select } from "@/components/ui/primitives";
import { CopyButton, DiffText, IntegrityNotice, Panel, TextInput } from "@/components/tools/shared";
import { errorMessage, postJson } from "@/lib/client-api";
import { diffWords } from "@/lib/diff";
import type { IntegrityReport } from "@/lib/ai/integrity";
import { LANGUAGES, type Language } from "@/lib/options";

const MAX = 15000;

type Correction = { original: string; corrected: string; type: string; explanation: string };
type Result = {
  detectedLanguage: "id" | "en";
  corrected: string;
  corrections: Correction[];
  suggestions: string[];
  integrity: IntegrityReport;
  source: string;
};

const TYPE_LABEL: Record<string, string> = {
  spelling: "Ejaan",
  grammar: "Tata bahasa",
  punctuation: "Tanda baca",
  word_choice: "Pilihan kata",
  capitalization: "Kapitalisasi",
  clarity: "Kejelasan",
};

export function GrammarChecker({ defaultLanguage }: { defaultLanguage: Language }) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<Language>("auto");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const diff = useMemo(() => (result ? diffWords(result.source, result.corrected) : []), [result]);

  async function run() {
    if (!text.trim()) return toast.error("Masukkan teks yang akan diperiksa.");
    setLoading(true);
    try {
      const res = await postJson<Omit<Result, "source">>("/api/ai/grammar", { text, language });
      setResult({ ...res, source: text });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const counts = result?.corrections.reduce<Record<string, number>>((acc, c) => ((acc[c.type] = (acc[c.type] ?? 0) + 1), acc), {});

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Teks asli">
          <TextInput value={text} onChange={setText} maxChars={MAX} placeholder="Tempel teks berbahasa Indonesia atau Inggris…" />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-lang">Bahasa</Label>
              <Select id="g-lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="w-48">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                    {l.value === defaultLanguage ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={run} loading={loading}>
              <SpellCheck /> Periksa
            </Button>
          </div>
        </Panel>

        <Panel
          title="Teks terkoreksi"
          actions={
            result && (
              <>
                <Button variant="outline" size="sm" onClick={() => setText(result.corrected)}>
                  <Replace /> Terapkan
                </Button>
                <CopyButton text={result.corrected} />
              </>
            )
          }
        >
          {!result ? (
            <EmptyState icon={<SpellCheck />} title="Belum diperiksa">
              Koreksi ejaan (KBBI/EYD), tanda baca, dan tata bahasa akan disorot.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="primary">{result.detectedLanguage === "id" ? "Bahasa Indonesia" : "English"}</Badge>
                <Badge>{result.corrections.length} koreksi</Badge>
                {counts &&
                  Object.entries(counts).map(([t, n]) => (
                    <Badge key={t}>
                      {TYPE_LABEL[t] ?? t}: {n}
                    </Badge>
                  ))}
              </div>
              <div className="max-h-[28rem] overflow-y-auto rounded-lg bg-surface p-3">
                <DiffText parts={diff} side="both" />
              </div>
              <IntegrityNotice report={result.integrity} />
            </div>
          )}
        </Panel>
      </div>

      {result && (result.corrections.length > 0 || result.suggestions.length > 0) && (
        <Panel title="Penjelasan koreksi">
          {result.corrections.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Asli</th>
                    <th className="py-2 pr-3 font-medium">Koreksi</th>
                    <th className="py-2 pr-3 font-medium">Jenis</th>
                    <th className="py-2 font-medium">Penjelasan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.corrections.map((c, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-2 pr-3 text-diff-del-fg"><span className="rounded-sm bg-diff-del px-1">{c.original}</span></td>
                      <td className="py-2 pr-3 text-diff-add-fg"><span className="rounded-sm bg-diff-add px-1">{c.corrected}</span></td>
                      <td className="py-2 pr-3"><Badge>{TYPE_LABEL[c.type] ?? c.type}</Badge></td>
                      <td className="py-2 text-muted-foreground">{c.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.suggestions.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Saran kejelasan & nada akademik (belum diterapkan)</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
