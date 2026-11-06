import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { Mentor } from "./mentor";

export const metadata: Metadata = { title: "Mentor Struktur Bab" };

export default function MentorPage() {
  return (
    <>
      <PageHeader
        title="Mentor Struktur Bab"
        description="Dialog tanya-jawab ala dosen pembimbing untuk menyusun kerangka BAB I–V dari jawaban Anda sendiri. Mentor bertanya dan mengarahkan, tidak menuliskan isi skripsi."
      />
      <Mentor />
    </>
  );
}
