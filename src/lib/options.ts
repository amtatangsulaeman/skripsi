// Shared (client + server) option catalogs.

export const PARAPHRASE_MODES = [
  { value: "standard", label: "Akademik Standar", hint: "Parafrasa seimbang untuk tulisan ilmiah." },
  { value: "formal", label: "Akademik Formal", hint: "Bahasa baku, impersonal, dan formal." },
  { value: "natural", label: "Akademik Natural", hint: "Tetap ilmiah namun mengalir alami." },
  { value: "simplify", label: "Sederhanakan Kalimat", hint: "Pecah kalimat panjang menjadi lebih ringkas." },
  { value: "readability", label: "Tingkatkan Keterbacaan", hint: "Perjelas alur dan transisi antar kalimat." },
] as const;
export type ParaphraseMode = (typeof PARAPHRASE_MODES)[number]["value"];
export const PARAPHRASE_MODE_VALUES = PARAPHRASE_MODES.map((m) => m.value) as [ParaphraseMode, ...ParaphraseMode[]];

export const INTENSITIES = [
  { value: "low", label: "Rendah" },
  { value: "medium", label: "Sedang" },
  { value: "high", label: "Tinggi" },
] as const;
export type Intensity = (typeof INTENSITIES)[number]["value"];

export const REWRITE_GOALS = [
  { value: "academic_tone", label: "Nada akademik" },
  { value: "structure", label: "Struktur kalimat" },
  { value: "simplify", label: "Sederhanakan" },
  { value: "concise", label: "Lebih ringkas" },
  { value: "readability", label: "Keterbacaan" },
  { value: "grammar", label: "Tata bahasa" },
] as const;
export type RewriteGoal = (typeof REWRITE_GOALS)[number]["value"];
export const REWRITE_GOAL_VALUES = REWRITE_GOALS.map((g) => g.value) as [RewriteGoal, ...RewriteGoal[]];

export const LANGUAGES = [
  { value: "auto", label: "Deteksi otomatis" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "English" },
] as const;
export type Language = (typeof LANGUAGES)[number]["value"];

export const GEMINI_MODEL_SUGGESTIONS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-pro-preview"];

export const PRESERVE_OPTIONS = [
  { key: "meaning", label: "Makna asli" },
  { key: "terminology", label: "Istilah teknis" },
  { key: "citations", label: "Sitasi" },
  { key: "references", label: "Daftar referensi" },
  { key: "quotes", label: "Kutipan langsung" },
] as const;
export type PreserveKey = (typeof PRESERVE_OPTIONS)[number]["key"];
export const PRESERVE_KEYS = PRESERVE_OPTIONS.map((p) => p.key) as [PreserveKey, ...PreserveKey[]];
export const INTENSITY_VALUES = INTENSITIES.map((i) => i.value) as [Intensity, ...Intensity[]];
