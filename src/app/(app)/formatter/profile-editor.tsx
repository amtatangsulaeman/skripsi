"use client";

import { cn } from "@/lib/utils";
import { Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/radix";
import { SECTION_KEYS, SECTION_LABELS, type FormattingConfig, type SectionKey } from "@/lib/formatter/profile";
import { CheckboxChip } from "@/components/tools/shared";

type Props = { value: FormattingConfig; onChange: (v: FormattingConfig) => void };

function Num({ label, value, onChange, step = 0.1, min = 0, max = 10, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <div className="relative">
        <Input
          type="number"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          inputMode="decimal"
          className={cn("no-spinner pl-2.5 tabular-nums", suffix ? "pr-9" : "pr-2.5")}
        />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProfileEditor({ value: c, onChange }: Props) {
  const set = <K extends keyof FormattingConfig>(k: K, v: Partial<FormattingConfig[K]>) =>
    onChange({ ...c, [k]: typeof c[k] === "object" && !Array.isArray(c[k]) ? { ...(c[k] as object), ...(v as object) } : v } as FormattingConfig);

  return (
    <div className="flex flex-col gap-4">
      <Group title="Halaman (A4)">
        <div className="grid grid-cols-2 gap-2">
          {(["top", "bottom", "left", "right"] as const).map((side) => (
            <Num
              key={side}
              label={{ top: "Atas", bottom: "Bawah", left: "Kiri", right: "Kanan" }[side]}
              value={c.page.margins[side]}
              suffix="cm"
              onChange={(n) => set("page", { margins: { ...c.page.margins, [side]: n } })}
            />
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Orientasi
          <Select value={c.page.orientation} onChange={(e) => set("page", { orientation: e.target.value as "portrait" | "landscape" })}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </label>
      </Group>

      <Group title="Tipografi & paragraf">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Font
            <Select value={c.font.family} onChange={(e) => set("font", { family: e.target.value as "Times New Roman" | "Arial" })}>
              <option>Times New Roman</option>
              <option>Arial</option>
            </Select>
          </label>
          <Num label="Ukuran" value={c.font.size} step={0.5} min={8} max={16} suffix="pt" onChange={(n) => set("font", { size: n })} />
          <label className="flex flex-col gap-1 text-xs font-medium">
            Spasi baris
            <Select value={c.paragraph.lineSpacing} onChange={(e) => set("paragraph", { lineSpacing: Number(e.target.value) as 1 | 1.15 | 1.5 | 2 })}>
              {[1, 1.15, 1.5, 2].map((v) => (
                <option key={v} value={v}>
                  {v.toFixed(v === 1.15 ? 2 : 1)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Perataan
            <Select value={c.paragraph.alignment} onChange={(e) => set("paragraph", { alignment: e.target.value as "justify" | "left" })}>
              <option value="justify">Rata kiri-kanan (justify)</option>
              <option value="left">Rata kiri</option>
            </Select>
          </label>
          <Num label="Indentasi baris pertama" value={c.paragraph.firstLineIndentCm} suffix="cm" onChange={(n) => set("paragraph", { firstLineIndentCm: n })} />
          <Num label="Spasi setelah paragraf" value={c.paragraph.spacingAfterPt} step={1} max={36} suffix="pt" onChange={(n) => set("paragraph", { spacingAfterPt: n })} />
        </div>
      </Group>

      <Group title="Judul bab & subbab">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Penomoran bab
            <Select value={c.headings.chapterNumberStyle} onChange={(e) => set("headings", { chapterNumberStyle: e.target.value as "roman" | "arabic" })}>
              <option value="roman">BAB I, BAB II…</option>
              <option value="arabic">BAB 1, BAB 2…</option>
            </Select>
          </label>
          <Num label="Ukuran judul bab" value={c.headings.chapterFontSize} step={1} min={10} max={18} suffix="pt" onChange={(n) => set("headings", { chapterFontSize: n })} />
        </div>
        <Toggle label="Judul bab rata tengah" checked={c.headings.chapterAlign === "center"} onChange={(v) => set("headings", { chapterAlign: v ? "center" : "left" })} />
        <Toggle label="Judul bab huruf kapital" checked={c.headings.chapterTitleUppercase} onChange={(v) => set("headings", { chapterTitleUppercase: v })} />
        <Toggle label="Setiap bab di halaman baru" checked={c.headings.chapterPageBreak} onChange={(v) => set("headings", { chapterPageBreak: v })} />
        <Toggle label="Nomori ulang subbab (1.1, 1.1.1)" checked={c.headings.subheadingNumbering} onChange={(v) => set("headings", { subheadingNumbering: v })} />
        <Toggle label="Subbab cetak tebal" checked={c.headings.subheadingBold} onChange={(v) => set("headings", { subheadingBold: v })} />
      </Group>

      <Group title="Nomor halaman, header & footer">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Posisi nomor halaman
          <Select value={c.pagination.position} onChange={(e) => set("pagination", { position: e.target.value as FormattingConfig["pagination"]["position"] })}>
            <option value="bottom-center">Bawah tengah</option>
            <option value="bottom-right">Bawah kanan</option>
            <option value="top-right">Atas kanan</option>
          </Select>
        </label>
        <Toggle label="Halaman awal bernomor romawi (i, ii, iii)" checked={c.pagination.frontMatter === "lowerRoman"} onChange={(v) => set("pagination", { frontMatter: v ? "lowerRoman" : "none" })} />
        <label className="flex flex-col gap-1 text-xs font-medium">
          Teks header (opsional)
          <Input value={c.headerText} maxLength={200} onChange={(e) => onChange({ ...c, headerText: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Teks footer (opsional)
          <Input value={c.footerText} maxLength={200} onChange={(e) => onChange({ ...c, footerText: e.target.value })} />
        </label>
      </Group>

      <Group title="Daftar isi, gambar & tabel">
        <Toggle label="Daftar isi otomatis" checked={c.toc.include} onChange={(v) => set("toc", { include: v })} />
        <Toggle label="Daftar gambar otomatis" checked={c.toc.includeListOfFigures} onChange={(v) => set("toc", { includeListOfFigures: v })} />
        <Toggle label="Daftar tabel otomatis" checked={c.toc.includeListOfTables} onChange={(v) => set("toc", { includeListOfTables: v })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Label gambar
            <Input value={c.captions.figureLabel} maxLength={20} onChange={(e) => set("captions", { figureLabel: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Label tabel
            <Input value={c.captions.tableLabel} maxLength={20} onChange={(e) => set("captions", { tableLabel: e.target.value })} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Penomoran caption
          <Select value={c.captions.numbering} onChange={(e) => set("captions", { numbering: e.target.value as "chapter" | "sequential" })}>
            <option value="chapter">Per bab (Tabel 3.1)</option>
            <option value="sequential">Berurutan (Tabel 1, 2, 3)</option>
          </Select>
        </label>
      </Group>

      <Group title="Daftar pustaka">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Judul
          <Input value={c.references.title} maxLength={60} onChange={(e) => set("references", { title: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Hanging indent" value={c.references.hangingIndentCm} suffix="cm" onChange={(n) => set("references", { hangingIndentCm: n })} />
          <label className="flex flex-col gap-1 text-xs font-medium">
            Spasi baris
            <Select value={c.references.lineSpacing} onChange={(e) => set("references", { lineSpacing: Number(e.target.value) as 1 | 1.15 | 1.5 | 2 })}>
              {[1, 1.15, 1.5, 2].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Toggle label="Urutkan alfabetis" checked={c.references.sortAlphabetically} onChange={(v) => set("references", { sortAlphabetically: v })} />
      </Group>

      <Group title="Bagian wajib (untuk validasi)">
        <div className="flex flex-wrap gap-1.5">
          {SECTION_KEYS.map((k: SectionKey) => (
            <CheckboxChip
              key={k}
              label={SECTION_LABELS[k]}
              checked={c.requiredSections.includes(k)}
              onChange={(on) => onChange({ ...c, requiredSections: on ? [...c.requiredSections, k] : c.requiredSections.filter((x) => x !== k) })}
            />
          ))}
        </div>
      </Group>

      <Group title="Catatan pedoman">
        <Label className="sr-only" htmlFor="profile-notes">Catatan</Label>
        <Textarea id="profile-notes" rows={4} value={c.notes} maxLength={4000} onChange={(e) => onChange({ ...c, notes: e.target.value })} placeholder="Aturan lain dari pedoman kampus (gaya sitasi, batas kata abstrak, dsb.)" />
      </Group>
    </div>
  );
}
