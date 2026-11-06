// Checks that the secrets in .env work, without printing any of them.
//   node --env-file=.env scripts/check-env.mjs
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => console.log(`  GAGAL ${m}`);
const env = process.env;
let failed = 0;
const fail = (m) => (failed++, bad(m));

console.log("1. Variabel wajib");
for (const k of ["DATABASE_URL", "DIRECT_URL", "AUTH_USERNAME", "AUTH_PASSWORD_HASH", "AUTH_SECRET", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const v = (env[k] ?? "").trim();
  if (!v) fail(`${k} kosong`);
  else if (/\[YOUR-PASSWORD\]|<password>|<ref>/.test(v)) fail(`${k} masih berisi placeholder`);
  else ok(`${k} terisi`);
}
if ((env.AUTH_SECRET ?? "").length < 32) fail("AUTH_SECRET kurang dari 32 karakter");
if (/[@#/?%]/.test(decodeURIComponent((env.DATABASE_URL ?? "").match(/:\/\/[^:]+:([^@]*)@/)?.[1] ?? "")) && !/%[0-9A-F]{2}/i.test(env.DATABASE_URL ?? "")) {
  fail("Password database mengandung simbol @ # / ? % yang belum di-encode");
}

console.log("2. Database (Supabase Postgres)");
const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1`;
  ok(`terhubung, ${await prisma.document.count()} dokumen`);
} catch (e) {
  fail(`tidak bisa terhubung: ${String(e.message).split("\n").find((l) => l.trim()) ?? "error"}`);
} finally {
  await prisma.$disconnect();
}

console.log("3. Storage (Supabase)");
try {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const bucket = (env.SUPABASE_BUCKET ?? "").trim() || "thesismate";
  const { data, error } = await sb.storage.getBucket(bucket);
  if (error) fail(`secret key ditolak atau bucket tidak ada: ${error.message}`);
  else if (data.public) fail(`bucket "${bucket}" bersifat PUBLIC, ubah ke private`);
  else ok(`bucket "${bucket}" bisa diakses dan private`);
} catch (e) {
  fail(`error: ${e.message}`);
}

console.log("4. Gemini");
const model = env.GEMINI_MODEL || "gemini-3.5-flash";
for (const name of ["GEMINI_API_KEY", ...Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 2}`)]) {
  const key = (env[name] ?? "").trim();
  if (!key) continue;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Balas: ok" }] }] }),
    });
    const j = await r.json();
    if (r.ok) ok(`${name} aktif (${model})`);
    else if (r.status === 429) ok(`${name} valid, tetapi kuota sedang habis`);
    else fail(`${name}: ${r.status} ${j.error?.status ?? ""}`);
  } catch (e) {
    fail(`${name}: ${e.message}`);
  }
}

console.log("5. Pengaman git");
if (fs.existsSync(".env.example")) {
  const ex = fs.readFileSync(".env.example", "utf8");
  if (/sb_secret_[A-Za-z0-9]|AIza[0-9A-Za-z_-]{20}|AQ\.[A-Za-z0-9_-]{20}|postgres(ql)?:\/\/[^<\s"]+:[^<\s"@]{6,}@/.test(ex)) fail(".env.example berisi rahasia asli! Ganti dengan contoh.");
  else ok(".env.example hanya berisi contoh");
}

console.log(failed ? `\n${failed} pemeriksaan gagal.` : "\nSemua beres.");
process.exit(failed ? 1 : 0);
