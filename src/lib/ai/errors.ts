export type AiErrorCode =
  | "not_configured"
  | "rate_limited" // per-minute request/token limit: usable again in seconds
  | "quota_exhausted" // daily free-tier quota used up: usable again after the daily reset
  | "timeout"
  | "invalid_response"
  | "blocked"
  | "upstream"
  | "too_long";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    public status: number,
    /** Seconds until the request can succeed again (quota errors only). */
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

/** Daily quotas (free tier) reset at midnight Pacific Time. */
export function msUntilPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return Math.max(60_000, 86_400_000 - elapsed);
}

/** "15.00 WIB" style clock time for a future timestamp. */
export function wibClock(at: number): string {
  return `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at))} WIB`;
}

export function isDailyQuota(rawMessage: string): boolean {
  return /per\s*day|PerDay|daily/i.test(rawMessage);
}

/** Server retry hint ("retryDelay":"37s" or "retry in 37.5s"), in seconds. */
export function retryHintSec(rawMessage: string): number | null {
  const m = rawMessage.match(/retry(?:Delay)?["'\s:]*(?:in\s*)?(\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(Number(m[1])) : null;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AiError) return err.code === "rate_limited" || err.code === "timeout" || err.code === "upstream";
  return false;
}

/** Normalize SDK / network errors into AiError with an Indonesian, user-facing message. */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const e = err as { status?: number; name?: string; message?: string };
  const status = typeof e?.status === "number" ? e.status : 0;
  const msg = String(e?.message ?? "");
  if (e?.name === "AbortError" || /abort|timed? ?out|deadline/i.test(msg)) {
    return new AiError("timeout", "Permintaan ke Gemini melebihi batas waktu. Coba lagi atau persingkat teks.", 504);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate/i.test(msg)) {
    if (isDailyQuota(msg)) {
      const wait = msUntilPacificMidnight();
      return new AiError(
        "quota_exhausted",
        `Kuota harian Gemini API sudah habis. Kuota direset sekitar pukul ${wibClock(Date.now() + wait)}.`,
        429,
        Math.ceil(wait / 1000),
      );
    }
    const secs = Math.min(Math.max(retryHintSec(msg) ?? 60, 5), 300);
    return new AiError("rate_limited", `Batas permintaan per menit Gemini API tercapai. Coba lagi dalam ${secs} detik.`, 429, secs);
  }
  if (status === 401 || status === 403 || /API key/i.test(msg)) {
    return new AiError("not_configured", "GEMINI_API_KEY tidak valid atau tidak memiliki akses ke model ini.", 502);
  }
  if (status === 404 || /not found/i.test(msg)) {
    return new AiError("not_configured", "Model Gemini tidak ditemukan. Periksa nama model di Settings.", 502);
  }
  if (status >= 500) return new AiError("upstream", "Layanan Gemini sedang bermasalah. Coba lagi beberapa saat.", 502);
  return new AiError("upstream", "Gagal menghubungi Gemini API.", 502);
}
