// One-time copy of the old local data (SQLite + STORAGE_DIR files) into Supabase (Postgres + Storage).
//
// 1. Fill DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
// 2. npx prisma db push
// 3. node --env-file=.env scripts/migrate-to-supabase.mjs [path/to/thesismate.db]
//
// Safe to re-run: existing rows (same id) and existing files are skipped.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const sqlitePath = path.resolve(process.argv[2] ?? "prisma/thesismate.db");
const storageDir = path.resolve(process.env.STORAGE_DIR || "./storage");
const bucketName = (process.env.SUPABASE_BUCKET ?? "").trim() || "thesismate";
for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[k]) throw new Error(`Set ${k} in .env first.`);
}
if (!process.env.DATABASE_URL.startsWith("postgres")) throw new Error("DATABASE_URL must point to Supabase Postgres.");

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const prisma = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Parents before children (foreign keys).
const TABLES = [
  ["folders", "folder"],
  ["documents", "document"],
  ["document_versions", "documentVersion"],
  ["paraphrase_history", "paraphraseHistory"],
  ["similarity_reports", "similarityReport"],
  ["formatting_profiles", "formattingProfile"],
  ["usage_logs", "usageLog"],
  ["settings", "setting"],
];
const DATE_FIELDS = new Set(["createdAt", "updatedAt"]);
const BOOL_FIELDS = new Set(["success"]);

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const toDate = (v) => (v == null ? v : new Date(typeof v === "number" || /^\d+$/.test(String(v)) ? Number(v) : v));

function convert(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = camel(k);
    out[key] = DATE_FIELDS.has(key) ? toDate(v) : BOOL_FIELDS.has(key) ? Boolean(v) : typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}

for (const [table, model] of TABLES) {
  let rows;
  try {
    rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
  } catch {
    console.log(`- ${table}: not found, skipped`);
    continue;
  }
  if (!rows.length) {
    console.log(`- ${table}: empty`);
    continue;
  }
  const { count } = await prisma[model].createMany({ data: rows.map(convert), skipDuplicates: true });
  console.log(`- ${table}: ${count} of ${rows.length} rows copied`);
}

// Files
const { data: bucket } = await sb.storage.getBucket(bucketName);
if (!bucket) {
  const { error } = await sb.storage.createBucket(bucketName, { public: false });
  if (error) throw new Error(`Could not create bucket: ${error.message}`);
}
const MIME = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf", txt: "text/plain; charset=utf-8" };
const docs = sqlite.prepare(`SELECT file_path FROM documents WHERE file_path IS NOT NULL`).all();
let uploaded = 0;
for (const { file_path: rel } of docs) {
  let data;
  try {
    data = await fs.readFile(path.join(storageDir, rel));
  } catch {
    console.warn(`  ! missing local file: ${rel}`);
    continue;
  }
  const ext = rel.split(".").pop();
  const { error } = await sb.storage.from(bucketName).upload(rel, data, { contentType: MIME[ext] ?? "application/octet-stream", upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) console.warn(`  ! ${rel}: ${error.message}`);
  else if (!error) uploaded++;
}
console.log(`- files: ${uploaded} uploaded (${docs.length} referenced)`);

await prisma.$disconnect();
sqlite.close();
console.log("Done.");
