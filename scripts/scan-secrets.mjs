// Refuses commits that contain secrets (database URLs with passwords, API keys, private keys, password hashes).
//   node scripts/scan-secrets.mjs --staged   # used by the pre-commit hook
//   node scripts/scan-secrets.mjs --all      # every tracked file (used in CI)
// Matches are reported with the value masked. A line can be exempted with the comment "secret-scan:allow".
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const mode = process.argv.includes("--all") ? "all" : "staged";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const RULES = [
  { name: "URL database dengan password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@"'<>/]+:(?!\[YOUR-PASSWORD\]|<password>|password@|\*+@)[^\s@"'<>]{4,}@/i },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: "Google AI Studio key", re: /\bAQ\.[A-Za-z0-9_-]{30,}/ },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },
  { name: "Google service account", re: /"type"\s*:\s*"service_account"/ },
  { name: "JWT / service_role key", re: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "Hash password (bcrypt)", re: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}|\bJDJ[hi5]JD[A-Za-z0-9+/=]{40,}/ }, // raw or base64 ("$2b$" → "JDJiJ")
  { name: "GitHub / OpenAI / Anthropic token", re: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{30,})/ },
  // KEY="value" in env-style files: any non-empty secret-named variable.
  { name: "Nilai rahasia di file env", re: /^\s*[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|SERVICE_ROLE_KEY|PRIVATE_KEY|_HASH)[A-Z0-9_]*\s*=\s*["']?(?!["']?\s*$)(?!<)[^\s"'#]{8,}/m, envOnly: true },
];

const BLOCKED_FILES = [/(^|\/)\.env(\.[^/]*)?$/, /\.pem$/, /\.p12$/, /(^|\/)id_(rsa|ed25519)$/, /service[-_]?account.*\.json$/i, /\.db$/];
const ALLOWED_FILES = [/(^|\/)\.env\.example$/, /^scripts\/scan-secrets\.mjs$/];
const isEnvLike = (f) => /(^|\/)\.env|\.env$|\.ya?ml$|\.toml$|\.ini$|\.properties$/.test(f);
const mask = (s) => (s.length <= 10 ? "****" : `${s.slice(0, 6)}…(${s.length} karakter)`);

const files = (mode === "all" ? git("ls-files", "-z") : git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")).split("\0").filter(Boolean);

const problems = [];
for (const file of files) {
  if (BLOCKED_FILES.some((r) => r.test(file)) && !ALLOWED_FILES.some((r) => r.test(file))) {
    problems.push(`${file}: file rahasia tidak boleh di-commit (tambahkan ke .gitignore)`);
    continue;
  }
  if (file === "scripts/scan-secrets.mjs") continue;
  let content;
  try {
    content = mode === "all" ? readFileSync(file, "utf8") : git("show", `:${file}`);
  } catch {
    continue;
  }
  if (content.includes("\0")) continue; // binary
  content.split(/\r?\n/).forEach((line, i) => {
    if (line.includes("secret-scan:allow")) return;
    for (const rule of RULES) {
      if (rule.envOnly && !isEnvLike(file)) continue;
      const m = line.match(rule.re);
      if (m) problems.push(`${file}:${i + 1}: ${rule.name} → ${mask(m[0].trim())}`);
    }
  });
}

if (problems.length) {
  console.error(`\n✖ Commit ditolak: ditemukan ${problems.length} kemungkinan rahasia.\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nSimpan rahasia hanya di .env (sudah diabaikan git) atau di Environment Variables Vercel.");
  console.error('Kalau ini bukan rahasia (mis. contoh), tambahkan komentar "secret-scan:allow" di baris itu.\n');
  process.exit(1);
}
console.log(`✓ Pemeriksaan rahasia: ${files.length} file bersih.`);
