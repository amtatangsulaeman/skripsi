import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { getSettings } from "@/lib/settings";
import { Rewriter } from "./rewriter";

export const metadata: Metadata = { title: "Sentence Rewriter" };

export default async function RewriterPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Sentence & Paragraph Rewriter" description="Perbaiki nada akademik, struktur, keringkasan, dan keterbacaan kalimat — lengkap dengan alasan setiap perubahan." />
      <Rewriter defaultLanguage={settings.defaultLanguage} />
    </>
  );
}
