// Key/model failover for Gemini. Pure logic (no SDK, no DB) so it can be unit-tested.
import { AiError, isDailyQuota, msUntilPacificMidnight, retryHintSec, toAiError, wibClock } from "./errors";

export type Candidate = { keyIndex: number; model: string };

/** In-memory cooldowns: "keyIndex|model" → timestamp (ms) until which it should be skipped. */
const cooldowns = new Map<string, number>();
const id = (c: Candidate) => `${c.keyIndex}|${c.model}`;

export function resetCooldowns() {
  cooldowns.clear();
}

/** How long to rest a key after a quota error. Daily quotas rest until the Pacific-midnight reset; per-minute limits use the server's retry hint. */
export function cooldownMs(err: AiError, rawMessage: string, now = Date.now()): number {
  if (err.code === "not_configured") return 10 * 60_000; // invalid key / model not available
  if (err.code === "quota_exhausted" || isDailyQuota(rawMessage)) return msUntilPacificMidnight(now);
  const secs = retryHintSec(rawMessage) ?? 60;
  return Math.min(Math.max(secs, 5), 300) * 1000;
}

const isQuota = (e: AiError | null) => e?.code === "rate_limited" || e?.code === "quota_exhausted";

/** Error for "every key/model combination is out of quota", with the earliest time one comes back. */
function exhaustedError(candidates: Candidate[], now: number, daily: boolean): AiError {
  const until = Math.min(...candidates.map((c) => cooldowns.get(id(c)) ?? now + 60_000));
  const secs = Math.max(1, Math.ceil((until - now) / 1000));
  const combos = candidates.length > 1 ? ` (${candidates.length} kombinasi API key/model)` : "";
  if (daily || secs > 600) {
    return new AiError(
      "quota_exhausted",
      `Semua API key/model Gemini${combos} sudah kehabisan kuota harian. Bisa dipakai lagi sekitar pukul ${wibClock(until)}. Untuk lanjut sekarang, tambahkan GEMINI_API_KEY_3 dari akun Google lain di .env.`,
      429,
      secs,
    );
  }
  return new AiError("rate_limited", `Semua API key/model Gemini${combos} sedang mencapai batas per menit. Coba lagi dalam ${secs} detik.`, 429, secs);
}

/** Throw immediately (without calling Gemini) when every candidate is still resting after a quota error. */
export function assertQuotaAvailable(keyCount: number, models: string[], now = Date.now()): void {
  const all: Candidate[] = [];
  for (const model of models) for (let k = 0; k < keyCount; k++) all.push({ keyIndex: k, model });
  if (all.length && all.every((c) => (cooldowns.get(id(c)) ?? 0) > now)) {
    const longest = Math.max(...all.map((c) => cooldowns.get(id(c))!));
    throw exhaustedError(all, now, longest - now > 600_000);
  }
}

/** Candidates in preference order: primary model on every key, then the fallback model. Cooled-down ones go last. */
export function orderCandidates(keyCount: number, models: string[], now = Date.now()): Candidate[] {
  const all: Candidate[] = [];
  for (const model of models) for (let k = 0; k < keyCount; k++) all.push({ keyIndex: k, model });
  const ready = all.filter((c) => (cooldowns.get(id(c)) ?? 0) <= now);
  const resting = all.filter((c) => (cooldowns.get(id(c)) ?? 0) > now).sort((a, b) => cooldowns.get(id(a))! - cooldowns.get(id(b))!);
  return [...ready, ...resting];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `call` against candidates until one succeeds.
 * - Quota/rate-limit or invalid key/model → mark that candidate as resting and switch immediately.
 * - Timeouts / 5xx → retry the same candidate once with backoff, then switch.
 * - Malformed JSON → retry once.
 * - Content problems (blocked, too long) → stop; another key would not help.
 */
export async function runWithFailover<T>(
  candidates: Candidate[],
  call: (c: Candidate) => Promise<T>,
  opts: { now?: () => number; backoffMs?: number } = {},
): Promise<{ value: T; candidate: Candidate; switched: number }> {
  const now = opts.now ?? Date.now;
  const backoff = opts.backoffMs ?? 1000;
  let lastErr: AiError | null = null;
  let switched = 0;
  let sawDaily = false;

  for (const c of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const value = await call(c);
        cooldowns.delete(id(c));
        return { value, candidate: c, switched };
      } catch (raw) {
        const err = toAiError(raw);
        lastErr = err;
        if (isQuota(err) || err.code === "not_configured") {
          if (err.code === "quota_exhausted") sawDaily = true;
          cooldowns.set(id(c), now() + cooldownMs(err, String((raw as Error)?.message ?? ""), now()));
          break; // next candidate
        }
        if (err.code === "blocked" || err.code === "too_long") throw err;
        if (attempt === 2) break;
        await sleep(backoff * attempt + Math.random() * 200);
      }
    }
    switched++;
  }

  if (isQuota(lastErr) && candidates.length > 1) throw exhaustedError(candidates, now(), sawDaily);
  throw lastErr ?? new AiError("upstream", "Gagal menghubungi Gemini API.", 502);
}
