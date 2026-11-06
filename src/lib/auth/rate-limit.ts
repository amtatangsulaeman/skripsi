// Simple in-memory limiter for login attempts. Sufficient for a single self-hosted instance.
type Entry = { count: number; first: number; lockedUntil: number };

const attempts = new Map<string, Entry>();
const WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function checkLoginAllowed(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  const e = attempts.get(key);
  if (e && e.lockedUntil > now) return { allowed: false, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}

export function registerLoginFailure(key: string, now = Date.now()): void {
  const e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) e.lockedUntil = now + LOCK_MS;
}

export function resetLoginFailures(key: string): void {
  attempts.delete(key);
}
