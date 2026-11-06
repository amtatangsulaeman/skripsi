import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { documentOptions } from "@/lib/research/doc-options";
import { WritingChecker } from "./writing";

export const metadata: Metadata = { title: "Cek Kualitas Tulisan" };

export default async function WritingCheckPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const [{ doc }, documents] = await Promise.all([searchParams, documentOptions()]);
  return (
    <>
      <PageHeader
        title="Cek Kualitas Tulisan"
        description="Menandai kata kabur, pembuka bertele-tele, kata tidak baku, klaim terlalu kuat, kalimat terlalu panjang, dan singkatan yang belum didefinisikan. Hanya saran, bukan penulisan ulang. Diperiksa tanpa AI."
      />
      <WritingChecker documents={documents} initialDocId={doc ?? ""} />
    </>
  );
}
