"use client";

import { useState } from "react";
import { Check, Copy, Eraser, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Textarea } from "@/components/ui/primitives";
import { cn, countWords } from "@/lib/utils";
import type { DiffPart } from "@/lib/diff";
import type { IntegrityReport } from "@/lib/ai/integrity";

export function TextInput({
  value,
  onChange,
  placeholder,
  maxChars,
  rows = 14,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxChars: number;
  rows?: number;
  id?: string;
}) {
  const over = value.length > maxChars;
  return (
    <div className="flex flex-col gap-2">
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="min-h-56 resize-y" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn("tabular-nums", over && "font-medium text-danger")}>
          {countWords(value).toLocaleString("id-ID")} kata · {value.length.toLocaleString("id-ID")} / {maxChars.toLocaleString("id-ID")} karakter
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} disabled={!value}>
          <Eraser /> Bersihkan
        </Button>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Salin" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Gagal menyalin ke clipboard.");
        }
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Tersalin" : label}
    </Button>
  );
}

/** Renders a word diff. `side` controls which changes are shown. */
export function DiffText({ parts, side = "both" }: { parts: DiffPart[]; side?: "before" | "after" | "both" }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((p, i) => {
        if (p.type === "same") return <span key={i}>{p.text}</span>;
        if (p.type === "added") {
          if (side === "before") return null;
          return (
            <mark key={i} className="rounded-sm bg-diff-add px-0.5 text-diff-add-fg">
              {p.text}
            </mark>
          );
        }
        if (side === "after") return null;
        return (
          <del key={i} className="rounded-sm bg-diff-del px-0.5 text-diff-del-fg decoration-diff-del-fg/60">
            {p.text}
          </del>
        );
      })}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { citations: "Sitasi", numbers: "Angka", links: "Tautan/DOI", quotes: "Kutipan langsung" };

export function IntegrityNotice({ report }: { report: IntegrityReport }) {
  if (report.ok) {
    return (
      <Alert tone="success" className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0" /> Pemeriksaan integritas lolos: sitasi, angka, tautan, dan kutipan tetap utuh.
      </Alert>
    );
  }
  return (
    <Alert tone="warning">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4 shrink-0" /> Periksa sebelum digunakan
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-foreground">
        {report.missing.map((m, i) => (
          <li key={`m${i}`}>
            {KIND_LABEL[m.kind]} hilang/berubah: <code className="text-xs">{m.value}</code>
          </li>
        ))}
        {report.added.map((m, i) => (
          <li key={`a${i}`}>
            {KIND_LABEL[m.kind]} baru muncul (tidak ada di teks asli): <code className="text-xs">{m.value}</code>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

export function Panel({ title, actions, children, className }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-background", className)}>
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

export function CheckboxChip({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label
      className={cn(
        // `relative` keeps the sr-only checkbox anchored to its chip. Without it the hidden input is positioned
        // against an ancestor outside the scroll panel, and focusing it on click scrolls the panel to the bottom.
        "relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        checked ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-2",
      )}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {checked && <Check className="size-3" />}
      {label}
    </label>
  );
}
