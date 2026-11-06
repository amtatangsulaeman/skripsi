import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { documentOptions } from "@/lib/research/doc-options";
import { CitationChecker } from "./citations";

export const metadata: Metadata = { title: "Cek Sitasi" };

export default async function CitationsPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const [{ doc }, documents] = await Promise.all([searchParams, documentOptions()]);
  return (
    <>
      <PageHeader
        title="Cek Sitasi & Daftar Pustaka"
        description="Mencocokkan sitasi di teks dengan Daftar Pustaka dan memeriksa format APA 7. Diperiksa otomatis tanpa AI, jadi tidak ada sumber yang dikarang dan tetap bisa dipakai saat kuota AI habis."
      />
      <CitationChecker documents={documents} initialDocId={doc ?? ""} />
    </>
  );
}
