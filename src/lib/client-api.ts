// Browser-side fetch helpers. Errors carry the server's user-facing message.

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiClientError("Sesi berakhir. Silakan masuk kembali.", 401);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 429 && (data.code === "quota_exhausted" || data.code === "rate_limited")) {
      announceQuota(String(data.code), data.error ?? "Kuota Gemini habis.", Number(data.retryAfterSec) || 60);
    }
    throw new ApiClientError(data.error ?? `Permintaan gagal (${res.status}).`, res.status, data);
  }
  return data as T;
}

export async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return handle<T>(res);
}

export async function getJson<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store" }));
}

export async function postForm<T>(url: string, form: FormData): Promise<T> {
  return handle<T>(await fetch(url, { method: "POST", body: form }));
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Terjadi kesalahan.";
}

export type UploadRef = { path: string; name: string };

/**
 * Upload a file straight to private storage when the server uses Supabase (bypasses Vercel's 4.5 MB body limit).
 * Returns null when the server uses local storage; the caller then sends the file as multipart form data.
 */
export async function uploadDirect(file: File): Promise<UploadRef | null> {
  const target = await postJson<{ direct: false } | { direct: true; path: string; signedUrl: string }>("/api/uploads", { name: file.name, size: file.size });
  if (!target.direct) return null;
  const body = new FormData();
  body.append("cacheControl", "0");
  body.append("", file);
  const res = await fetch(target.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiClientError(`Unggah gagal: ${data.message ?? data.error ?? res.status}`, res.status);
  }
  return { path: target.path, name: file.name };
}

// ── Gemini quota state (shown by <QuotaBanner/> on every page) ──

export const QUOTA_EVENT = "thesismate:ai-quota";
const QUOTA_KEY = "thesismate.aiQuota";
export type QuotaState = { code: string; message: string; until: number };

function announceQuota(code: string, message: string, retryAfterSec: number) {
  const state: QuotaState = { code, message, until: Date.now() + retryAfterSec * 1000 };
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(state));
  } catch {}
  window.dispatchEvent(new CustomEvent<QuotaState>(QUOTA_EVENT, { detail: state }));
}

export function readQuota(): QuotaState | null {
  try {
    const s = JSON.parse(localStorage.getItem(QUOTA_KEY) ?? "null") as QuotaState | null;
    return s && s.until > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function clearQuota() {
  try {
    localStorage.removeItem(QUOTA_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent<QuotaState | null>(QUOTA_EVENT, { detail: null }));
}
