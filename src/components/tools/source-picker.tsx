"use client";

import { FileText, Type } from "lucide-react";
import { Label, Select } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { TextInput } from "./shared";

export type DocOption = { id: string; title: string; fileType: string; kind: string };
export type SourceValue = { mode: "document" | "text"; documentId: string; text: string };

export function sourcePayload(v: SourceValue) {
  return v.mode === "document" ? { documentId: v.documentId } : { text: v.text };
}

export function sourceReady(v: SourceValue) {
  return v.mode === "document" ? !!v.documentId : v.text.trim().length > 0;
}

/** Choose a library document or paste text. */
export function SourcePicker({ documents, value, onChange, maxChars, placeholder }: { documents: DocOption[]; value: SourceValue; onChange: (v: SourceValue) => void; maxChars: number; placeholder?: string }) {
  return (
    <Tabs value={value.mode} onValueChange={(m) => onChange({ ...value, mode: m as SourceValue["mode"] })}>
      <TabsList>
        <TabsTrigger value="document">
          <FileText className="size-4" /> Dari My Documents
        </TabsTrigger>
        <TabsTrigger value="text">
          <Type className="size-4" /> Tempel teks
        </TabsTrigger>
      </TabsList>
      <TabsContent value="document" className="mt-3">
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada dokumen dengan teks. Unggah DOCX/PDF di My Documents, atau pilih "Tempel teks".</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-doc">Dokumen</Label>
            <Select id="src-doc" value={value.documentId} onChange={(e) => onChange({ ...value, documentId: e.target.value })}>
              <option value="">— Pilih dokumen —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.kind === "note" ? "catatan" : d.fileType.toUpperCase()})
                </option>
              ))}
            </Select>
          </div>
        )}
      </TabsContent>
      <TabsContent value="text" className="mt-3">
        <TextInput value={value.text} onChange={(text) => onChange({ ...value, text })} maxChars={maxChars} rows={10} placeholder={placeholder} />
      </TabsContent>
    </Tabs>
  );
}
