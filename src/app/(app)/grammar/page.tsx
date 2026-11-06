import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { getSettings } from "@/lib/settings";
import { GrammarChecker } from "./grammar";

export const metadata: Metadata = { title: "Grammar Checker" };

export default async function GrammarPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Grammar Checker" description="Koreksi ejaan, tanda baca, dan tata bahasa Indonesia (KBBI/EYD) maupun Inggris, beserta penjelasannya." />
      <GrammarChecker defaultLanguage={settings.defaultLanguage} />
    </>
  );
}
