"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, ListTree, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label, Textarea } from "@/components/ui/primitives";
import { CopyButton, Panel } from "@/components/tools/shared";
import { errorMessage, postJson } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { MentorOutline } from "@/lib/ai/research";

type Msg = { role: "student" | "mentor"; text: string };
type State = { field: string; topic: string; messages: Msg[]; stage: string; insights: string[]; outline: MentorOutline | null };

const STAGES: { key: string; label: string }[] = [
  { key: "readiness", label: "Kesiapan" },
  { key: "thesis", label: "Inti argumen" },
  { key: "bab1", label: "BAB I" },
  { key: "bab2", label: "BAB II" },
  { key: "bab3", label: "BAB III" },
  { key: "bab4", label: "BAB IV" },
  { key: "bab5", label: "BAB V" },
  { key: "stress_test", label: "Uji argumen" },
  { key: "outline", label: "Kerangka" },
];
const STORE = "thesismate.mentor.v1";
const EMPTY: State = { field: "", topic: "", messages: [], stage: "readiness", insights: [], outline: null };

function outlineText(o: MentorOutline) {
  const lines = [o.title || "Kerangka Skripsi", "", o.problemStatement ? `Rumusan masalah: ${o.problemStatement}` : "", ""];
  for (const c of o.chapters) {
    lines.push(`${c.label}${c.title ? ` ${c.title}` : ""}`);
    if (c.purpose) lines.push(`  Tujuan bab: ${c.purpose}`);
    for (const s of c.subsections) lines.push(`  - ${s}`);
    for (const q of c.openQuestions) lines.push(`  ? ${q}`);
    lines.push("");
  }
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function outlineHtml(o: MentorOutline) {
  let html = o.problemStatement ? `<p><strong>Rumusan masalah:</strong> ${esc(o.problemStatement)}</p>` : "";
  for (const c of o.chapters) {
    html += `<h2>${esc(`${c.label}${c.title ? ` ${c.title}` : ""}`)}</h2>`;
    if (c.purpose) html += `<p><em>Tujuan bab:</em> ${esc(c.purpose)}</p>`;
    if (c.subsections.length) html += `<ul>${c.subsections.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    if (c.openQuestions.length) html += `<p><strong>Masih perlu diputuskan:</strong></p><ul>${c.openQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`;
  }
  return html;
}

export function Mentor() {
  const router = useRouter();
  const [s, setS] = useState<State>(EMPTY);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "outline" | "save">("");
  const endRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Conversation survives a refresh (per browser only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setS({ ...EMPTY, ...(JSON.parse(raw) as State) });
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(s));
    } catch {}
  }, [s]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [s.messages.length]);

  async function turn(messages: Msg[], requestOutline = false) {
    setBusy(requestOutline ? "outline" : "send");
    try {
      const res = await postJson<{ reply: string; stage: string; insights: string[]; outline: MentorOutline | null }>("/api/ai/mentor", { field: s.field, topic: s.topic, messages, requestOutline });
      setS((p) => ({
        ...p,
        messages: [...messages, { role: "mentor", text: res.reply }],
        stage: res.stage,
        insights: res.insights.length ? res.insights : p.insights,
        outline: res.outline ?? p.outline,
      }));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const messages: Msg[] = [...s.messages, { role: "student", text }];
    setS((p) => ({ ...p, messages }));
    setDraft("");
    if (!(await turn(messages))) {
      setS((p) => ({ ...p, messages: p.messages.slice(0, -1) }));
      setDraft(text);
    }
  }

  function start() {
    if (!s.topic.trim()) return toast.error("Tulis topik atau judul sementara Anda dulu.");
    void turn([]);
  }

  async function saveOutline() {
    if (!s.outline) return;
    setBusy("save");
    try {
      const { document } = await postJson<{ document: { id: string } }>("/api/documents", { title: `Kerangka — ${s.outline.title || s.topic}`.slice(0, 200), content: outlineHtml(s.outline) });
      toast.success("Kerangka disimpan sebagai catatan di My Documents.");
      router.push(`/documents/${document.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  function reset() {
    if (s.messages.length && !window.confirm("Mulai percakapan baru? Percakapan ini akan dihapus dari browser.")) return;
    setS(EMPTY);
    setDraft("");
  }

  const stageIdx = Math.max(0, STAGES.findIndex((x) => x.key === s.stage));
  const started = s.messages.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {!started && (
          <Panel title="Mulai">
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-field">Program studi</Label>
                <Input id="m-field" value={s.field} onChange={(e) => setS({ ...s, field: e.target.value })} placeholder="mis. Akuntansi" maxLength={120} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-topic">Topik / judul sementara</Label>
                <Input id="m-topic" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value })} placeholder="mis. Penerapan konsep entitas pada pencatatan keuangan UMKM" maxLength={600} />
              </div>
            </div>
            <Button className="mt-3" onClick={start} loading={busy === "send"}>
              <GraduationCap /> Mulai bimbingan
            </Button>
          </Panel>
        )}

        {started && (
          <Panel
            title={s.topic || "Bimbingan"}
            actions={
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw /> Mulai baru
              </Button>
            }
          >
            <div className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1">
              {s.messages.map((m, i) => (
                <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed", m.role === "student" ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-2")}>
                  {m.text}
                </div>
              ))}
              {busy === "send" && <div className="self-start rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted-foreground">Mentor sedang berpikir…</div>}
              <div ref={endRef} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Textarea
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
                }}
                placeholder="Jawab dengan kata-kata Anda sendiri… (Ctrl+Enter untuk kirim)"
                maxLength={6000}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => turn(s.messages, true)} loading={busy === "outline"} disabled={s.messages.length < 4 || !!busy}>
                  <ListTree /> Susun kerangka sekarang
                </Button>
                <Button onClick={send} loading={busy === "send"} disabled={!draft.trim() || !!busy}>
                  <Send /> Kirim
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Tahap">
          <ol className="flex flex-col gap-1">
            {STAGES.map((st, i) => (
              <li key={st.key} className={cn("flex items-center gap-2 text-sm", i < stageIdx ? "text-muted-foreground" : i === stageIdx ? "font-medium text-primary" : "text-muted-foreground/60")}>
                <span className={cn("size-2 rounded-full", i < stageIdx ? "bg-success" : i === stageIdx ? "bg-primary" : "bg-border")} />
                {st.label}
              </li>
            ))}
          </ol>
        </Panel>

        {s.insights.length > 0 && (
          <Panel title="Yang sudah Anda putuskan">
            <ul className="list-disc space-y-1 pl-5 text-sm">{s.insights.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Panel>
        )}

        {s.outline && (
          <Panel
            title="Kerangka"
            actions={
              <>
                <CopyButton text={outlineText(s.outline)} />
                <Button size="sm" onClick={saveOutline} loading={busy === "save"}>
                  <Save /> Simpan
                </Button>
              </>
            }
          >
            {s.outline.problemStatement && <p className="mb-3 text-sm"><span className="font-medium">Rumusan masalah:</span> {s.outline.problemStatement}</p>}
            <div className="flex flex-col gap-3">
              {s.outline.chapters.map((c, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium">{c.label} {c.title}</p>
                  {c.purpose && <p className="text-xs text-muted-foreground">{c.purpose}</p>}
                  {c.subsections.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{c.subsections.map((x, k) => <li key={k}>{x}</li>)}</ul>}
                  {c.openQuestions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.openQuestions.map((q, k) => <Badge key={k} tone="warning">? {q}</Badge>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        <p className="text-xs text-muted-foreground">
          Percakapan hanya tersimpan di browser ini. Metode diadaptasi dari plan mode & socratic mentor di academic-research-skills (Cheng-I Wu, CC BY-NC 4.0).
        </p>
      </div>
    </div>
  );
}
