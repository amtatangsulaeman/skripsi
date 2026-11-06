import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth/server";
import { AiError } from "@/lib/ai/errors";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

/**
 * Wraps a Route Handler with: server-side session validation, a same-origin check for
 * state-changing requests, and uniform JSON error responses.
 */
export function withAuth<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });

    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (origin && host && new URL(origin).host !== host) {
        return NextResponse.json({ error: "Permintaan lintas origin ditolak." }, { status: 403 });
      }
    }

    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof AiError) {
        const headers = err.retryAfterSec ? { "Retry-After": String(err.retryAfterSec) } : undefined;
        return NextResponse.json({ error: err.message, code: err.code, retryAfterSec: err.retryAfterSec ?? null }, { status: err.status, headers });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Input tidak valid.", issues: err.issues }, { status: 400 });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: NextRequest, parse: (v: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Body JSON tidak valid.");
  }
  return parse(body);
}
