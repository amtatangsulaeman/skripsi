"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { checkLoginAllowed, registerLoginFailure, resetLoginFailures } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/server";

export type LoginState = { error?: string };

// Used to equalize timing when the username is wrong (avoids user enumeration via response time).
let dummyHash: string | null = null;
function getDummyHash() {
  dummyHash ??= bcrypt.hashSync("thesismate-timing-equalizer", 12);
  return dummyHash;
}

function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  // Only allow same-site relative paths.
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/login") ? v : "/dashboard";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = await clientIp();
  const gate = checkLoginAllowed(ip);
  if (!gate.allowed) {
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(gate.retryAfterSec / 60)} menit.` };
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password || password.length > 256) {
    return { error: "Username dan password wajib diisi." };
  }

  let ownerUser: string;
  let ownerHash: string;
  try {
    ownerUser = env.authUsername;
    ownerHash = env.authPasswordHash;
  } catch {
    return { error: "Akun pemilik belum dikonfigurasi di file .env (AUTH_USERNAME / AUTH_PASSWORD_HASH)." };
  }

  const userMatches = username.toLowerCase() === ownerUser.toLowerCase();
  const passwordMatches = await bcrypt.compare(password, userMatches ? ownerHash : getDummyHash());

  if (!userMatches || !passwordMatches) {
    registerLoginFailure(ip);
    return { error: "Username atau password salah." };
  }

  resetLoginFailures(ip);
  const token = await createSessionToken(ownerUser, env.sessionHours);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.round(env.sessionHours * 3600),
  });

  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
