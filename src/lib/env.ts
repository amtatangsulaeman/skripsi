import "server-only";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get authUsername() {
    return required("AUTH_USERNAME");
  },
  /** Accepts a raw bcrypt hash or the base64-encoded form printed by `npm run hash-password`. */
  get authPasswordHash() {
    const raw = required("AUTH_PASSWORD_HASH").trim();
    if (raw.startsWith("$2")) return raw;
    return Buffer.from(raw, "base64").toString("utf8");
  },
  get sessionHours() {
    const h = Number(process.env.AUTH_SESSION_HOURS ?? 12);
    return Number.isFinite(h) && h > 0 ? h : 12;
  },
  /** All configured keys, in priority order: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3 … */
  get geminiApiKeys(): string[] {
    const names = ["GEMINI_API_KEY", ...Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 2}`)];
    const keys = names.map((n) => (process.env[n] ?? "").trim()).filter(Boolean);
    return Array.from(new Set(keys));
  },
  /** First key (kept for "is AI configured?" checks). */
  get geminiApiKey() {
    return this.geminiApiKeys[0] ?? "";
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL || "gemini-3.5-flash";
  },
  /** Optional second model, used when the primary model's quota is exhausted on every key. */
  get geminiFallbackModel() {
    return (process.env.GEMINI_FALLBACK_MODEL ?? "").trim();
  },
  get geminiTimeoutMs() {
    const t = Number(process.env.GEMINI_TIMEOUT_MS ?? 60000);
    return Number.isFinite(t) && t > 1000 ? t : 60000;
  },
  get storageDir() {
    return path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");
  },
  /** Supabase Storage (used instead of STORAGE_DIR when both values are set — required on Vercel). */
  get supabaseUrl() {
    return (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  },
  get supabaseServiceKey() {
    return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  },
  get supabaseBucket() {
    return (process.env.SUPABASE_BUCKET ?? "").trim() || "thesismate";
  },
  get maxUploadBytes() {
    const mb = Number(process.env.MAX_UPLOAD_MB ?? 20);
    return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
  },
};
