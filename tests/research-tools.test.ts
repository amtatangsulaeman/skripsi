import { describe, expect, it } from "vitest";
import { checkCitations, extractCitations, extractReferences } from "@/lib/citations/engine";
import { checkWriting } from "@/lib/writing/check";
import { verifyQuote } from "@/lib/ai/anchors";

const DOC = `BAB I PENDAHULUAN

Pencatatan keuangan penting bagi UMKM (Sugiyono, 2017:136). Menurut Arens dkk. (2014) audit membutuhkan bukti. Pertama, Bawono dan Handika (2023) menemukan hal serupa (Syam & Latifah, 2022; Hafizi et al., 2025). Ikatan Akuntan Indonesia (2024) menerbitkan SAK EP, dan (IAI, 2024) menegaskannya.

Populasi Penelitian
Sugiyono (2019) menjelaskan populasi.

DAFTAR PUSTAKA

Arens, A. A., Elder, R. J., & Beasley, M. S. (2014). Auditing and assurance services. Pearson.
Bawono, I. R., & Handika, R. (2023). How do accounting records affect performance? https://doi.org/10.1000/xyz.
Hafizi, A., dkk. (2025). Pentingnya laporan keuangan.
Ikatan Akuntan Indonesia. (2024). Standar Akuntansi Keuangan Entitas Privat. IAI.
Sugiyono. (2017). Metode penelitian kuantitatif, kualitatif, dan R&D. Alfabeta.
Lestari, S. (2024). Evaluasi sistem informasi akuntansi.
Syam, A., & Latifah, N. (2022). Akuntansi entitas.
`;

describe("citation check", () => {
  it("reads parenthetical, narrative, multi-source and organisation citations", () => {
    const cites = extractCitations(DOC.split("DAFTAR PUSTAKA")[0]!);
    const keys = cites.map((c) => `${c.surnameKey}|${c.year}`);
    expect(keys).toContain("sugiyono|2017");
    expect(keys).toContain("arens|2014");
    expect(keys).toContain("bawono|2023"); // "Pertama," is not an author
    expect(keys).toContain("syam|2022");
    expect(keys).toContain("hafizi|2025");
    expect(keys).toContain("sugiyono|2019"); // heading on the previous line is not part of the name
    expect(keys.some((k) => k.startsWith("pertama") || k.startsWith("populasi"))).toBe(false);
  });

  it("counts authors without initials and parses years", () => {
    const refs = extractReferences(DOC.split("DAFTAR PUSTAKA")[1]!);
    expect(refs.find((r) => r.surnameKey === "arens")).toMatchObject({ authorCount: 3, year: "2014" });
    expect(refs.find((r) => r.surnameKey === "bawono")).toMatchObject({ authorCount: 2 });
  });

  it("finds orphans both ways, year mismatches and format problems — and never invents sources", () => {
    const r = checkCitations(DOC, { now: new Date("2026-11-05") });
    const msgs = r.issues.map((i) => `${i.kind}: ${i.message}`);
    expect(msgs.some((m) => m.startsWith("year_mismatch") && m.includes("Sugiyono") && m.includes("2019"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("uncited_reference") && m.includes("Lestari"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("missing_reference"))).toBe(false); // IAI matches "Ikatan Akuntan Indonesia"
    expect(msgs.some((m) => m.startsWith("multi_order"))).toBe(true); // Syam before Hafizi
    expect(msgs.some((m) => m.startsWith("reference_format") && m.includes("dkk"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("doi_format") && m.includes("titik"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("ordering"))).toBe(true); // Sugiyono before Lestari
    expect(r.stats.references).toBe(7);
  });

  it("reports a missing reference list instead of guessing", () => {
    const r = checkCitations("Teks tanpa daftar pustaka (Sugiyono, 2017).");
    expect(r.issues[0]!.kind).toBe("no_reference_list");
  });
});

describe("writing quality check", () => {
  const text = `Di era globalisasi ini, sistem informasi akuntansi (SIA) sangat krusial. Tidak dapat dipungkiri bahwa perusahaan memerlukan analisa yang holistik di mana data diolah dikarenakan resiko yang tinggi. Penelitian ini membuktikan bahwa semua perusahaan membutuhkan SIA dan ERP.

Pada bab ini akan dibahas teori. Hal ini penting. Hal ini juga relevan. Hal ini perlu dipahami.

DAFTAR PUSTAKA

Sugiyono. (2017). Metode penelitian. Alfabeta.`;

  it("flags clichés, non-standard words, overclaims, meta-commentary, repetition and undefined acronyms", () => {
    const r = checkWriting(text);
    const cats = new Set(r.findings.map((f) => f.category));
    for (const c of ["throat_clearing", "vague_term", "nonstandard", "overclaim", "meta_commentary", "repetition", "acronym"] as const) expect(cats).toContain(c);
    const acr = r.findings.filter((f) => f.category === "acronym").map((f) => f.excerpt);
    expect(acr).toEqual(["ERP"]); // SIA is defined, BAB is known
    expect(r.findings.some((f) => f.context.includes("Alfabeta"))).toBe(false); // reference list is skipped
  });

  it("ignores all-caps headings and Roman numerals", () => {
    const r = checkWriting("BAB II KAJIAN PUSTAKA\n\nTeori ini dijelaskan dengan baik oleh peneliti sebelumnya.");
    expect(r.findings.filter((f) => f.category === "acronym")).toHaveLength(0);
  });

  it("flags very long sentences", () => {
    const long = `${Array.from({ length: 50 }, (_, i) => `kata${i}`).join(" ")}.`;
    expect(checkWriting(long).findings.some((f) => f.category === "long_sentence")).toBe(true);
  });
});

describe("evidence anchors", () => {
  const source = "Wawancara dilakukan kepada direktur dan pihak yang bertanggung jawab atas pencatatan keuangan.";
  it("accepts verbatim and whitespace/case-insensitive quotes, marks partial and missing ones", () => {
    expect(verifyQuote(source, "dilakukan kepada  Direktur")).toBe("found");
    expect(verifyQuote(source, "Wawancara dilakukan kepada direktur dan pihak yang bertanggung jawab atas laporan pajak")).toBe("partial");
    expect(verifyQuote(source, "Kuesioner disebarkan kepada 100 responden")).toBe("not_found");
    expect(verifyQuote(source, "")).toBe("not_found");
  });
});
