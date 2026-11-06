import { describe, expect, it } from "vitest";
import { analyzeSimilarity, findRepeatedSentences } from "@/lib/similarity/engine";

const A =
  "Pengendalian internal sangat berperan penting dalam pencegahan fraud. Organisasi dengan sistem pengendalian internal yang baik memiliki risiko kecurangan yang rendah, tetapi sebaliknya jika pengendalian internal lemah maka tingkat risikonya jauh lebih tinggi.";
const UNRELATED = "Fotosintesis adalah proses tumbuhan hijau mengubah energi cahaya matahari menjadi energi kimia dalam bentuk glukosa dan oksigen.";

describe("similarity engine", () => {
  it("scores identical text at 100% and attributes the source", () => {
    const r = analyzeSimilarity(A, [{ id: "d1", title: "Draf lama", text: A }], { excludeQuotes: false, excludeReferences: false });
    expect(r.score).toBe(100);
    expect(r.sources[0]).toMatchObject({ id: "d1", percent: 100 });
    expect(r.passages[0]!.sourceExcerpt).toBe(A.replace(/\.$/, ""));
  });

  it("scores unrelated text at 0% (never invents a score)", () => {
    const r = analyzeSimilarity(A, [{ id: "x", title: "Biologi", text: UNRELATED }]);
    expect(r.score).toBe(0);
    expect(r.passages).toEqual([]);
  });

  it("detects a copied passage inside new text, case/punctuation-insensitively", () => {
    const target = `${UNRELATED} ORGANISASI DENGAN SISTEM PENGENDALIAN INTERNAL YANG BAIK, memiliki risiko kecurangan yang rendah.`;
    const r = analyzeSimilarity(target, [{ id: "d1", title: "Draf", text: A }]);
    expect(r.passages).toHaveLength(1);
    expect(r.matchedWords).toBe(12);
    expect(r.score).toBeCloseTo((12 / r.totalWords) * 100, 1);
  });

  it("ignores matches shorter than the minimum and excluded quotations/references", () => {
    const short = analyzeSimilarity("pengendalian internal sangat berperan penting saja", [{ id: "d1", title: "Draf", text: A }], { minWords: 8 });
    expect(short.score).toBe(0);

    const quoted = `Menurut ahli, “${A}”`;
    const q = analyzeSimilarity(quoted, [{ id: "d1", title: "Draf", text: A }], { excludeQuotes: true });
    expect(q.score).toBe(0);
    expect(q.excludedWords).toBeGreaterThan(0);

    const withRefs = `${UNRELATED}\n\nDaftar Pustaka\n\n${A}`;
    const refs = analyzeSimilarity(withRefs, [{ id: "d1", title: "Draf", text: A }], { excludeReferences: true });
    expect(refs.score).toBe(0);
  });

  it("finds sentences repeated within the same text", () => {
    const text = "Hipotesis yang diuji pada penelitian ini dinamakan hipotesis kerja. Ini kalimat lain yang berbeda sekali. Hipotesis yang diuji pada penelitian ini dinamakan hipotesis kerja.";
    expect(findRepeatedSentences(text)).toEqual([{ text: "Hipotesis yang diuji pada penelitian ini dinamakan hipotesis kerja.", count: 2 }]);
  });
});
