# ThesisMate

ThesisMate is a private academic writing assistant for one owner. It has no registration, no multi-user support and no SaaS features.

Its tools are an AI Paraphraser, a Sentence Rewriter, a Grammar Checker (Gemini), a Similarity Checker (deterministic, internal), a Thesis Formatter (DOCX) and a private document library, plus four research tools adapted from [academic-research-skills](https://github.com/Imbad0202/academic-research-skills):

| Tool | How it works |
| --- | --- |
| Review Panel (`/review`) | Gemini, 3 calls: methodology + substance examiners, a separate devil's advocate, then a committee chair. Criterion-bound verdicts (no scores). Every finding quotes the manuscript, and `src/lib/ai/anchors.ts` checks each quote against the text; findings whose quote is not found are flagged and kept out of the chair's decision. Reports are stored in `review_reports`. |
| Cek Sitasi (`/citations`) | Deterministic (`src/lib/citations/engine.ts`): in-text author–date citations ↔ reference list both ways, year mismatches, APA 7 format checks. No AI, so no invented sources. |
| Cek Kualitas Tulisan (`/writing-check`) | Deterministic (`src/lib/writing/check.ts`): vague terms, clichés, non-standard Indonesian, overclaims, long sentences, undefined acronyms. Suggestions only; not a humanizer. |
| Mentor Struktur Bab (`/mentor`) | Gemini, Socratic dialogue that asks instead of writing; produces an outline only from the student's own answers. Conversation is kept in the browser; the outline can be saved as a note. |

academic-research-skills is © Cheng-I Wu, licensed CC BY-NC 4.0 (non-commercial, attribution). The adaptation keeps that attribution in the code and UI; do not use these parts commercially.

When the Gemini quota runs out, the API answers 429 with `code` (`rate_limited` per minute, `quota_exhausted` daily) and `retryAfterSec`. Exhausted key/model pairs rest until the reset (daily quotas reset at midnight Pacific Time), later requests fail fast without calling Gemini, and the UI shows a banner with a countdown. Cek Sitasi, Cek Kualitas Tulisan, Similarity and the Formatter keep working without AI.

## Setup

```bash
npm install
cp .env.example .env
npm run hash-password -- "your-strong-password"   # paste the printed AUTH_PASSWORD_HASH into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # → AUTH_SECRET
# set AUTH_USERNAME and GEMINI_API_KEY (https://aistudio.google.com/apikey, free tier is enough)
npx prisma db push      # creates the tables in Postgres (set DATABASE_URL + DIRECT_URL first)
npm run dev             # http://localhost:3000
```

On npm 11, if Prisma's install scripts were blocked, run `npm approve-scripts prisma @prisma/client @prisma/engines` and then `npm rebuild`.

Production build: `npm run build && npm start`. Tests: `npm test`. Typecheck: `npm run typecheck`.

## Architecture

| Layer | Choice |
| --- | --- |
| App | Next.js 15 App Router, TypeScript (strict), Tailwind v4, shadcn-style components on Radix, Lucide, TipTap |
| Data | PostgreSQL (Supabase) + Prisma (`prisma/schema.prisma`), with tables for documents, versions, folders, history, reports, profiles, usage and settings |
| Auth | Single owner from `.env` (bcrypt hash). A signed JWT (HS256, `jose`) is stored in an httpOnly, SameSite=strict cookie. `middleware.ts` guards every route, and each API handler re-validates the session (`withAuth`) and rejects cross-origin writes. Login attempts are rate-limited. |
| AI | `@google/genai` runs server-side only (`src/lib/ai`). It uses one central `generateStructured()` with JSON-schema output, zod validation, timeout, retry/backoff on 429/5xx and usage logging. Each feature has its own prompt in `prompts.ts`. `integrity.ts` checks every AI output for dropped or invented citations, numbers, DOIs and quotes. |
| Files | Uploads are stored in a private Supabase Storage bucket (or `STORAGE_DIR` without Supabase) under random UUID names. The file type is checked from its bytes, and files are served only by `/api/documents/[id]/file` after authentication. |
| Formatter | Mammoth turns a DOCX into HTML, which becomes blocks (`parse.ts`). `detect.ts` finds sections, renumbers headings and captions, and records changes and warnings. `build.ts` generates the DOCX with the `docx` library. `preview.ts` renders the on-screen preview. |
| Similarity | Word 5-gram shingling with greedy longest-match (`src/lib/similarity/engine.ts`). The score is the share of words that match the owner's own documents. There is no web or Turnitin access, and the UI says so. |

```
src/
  middleware.ts               route protection
  app/login                   login page + server actions
  app/(app)/…                 dashboard, paraphraser, rewriter, grammar, similarity, formatter, documents, settings
  app/api/…                   authenticated route handlers
  components/ui, layout, tools
  lib/auth, ai, docs, formatter, similarity, diff.ts, settings.ts
tests/                        vitest: auth, integrity/diff/PDF, similarity, formatter end-to-end, AI schemas
```

## Privacy and deployment

- Every page and API route needs the owner session. `robots.txt` disallows all crawling, and pages send `noindex` plus `X-Robots-Tag` and `X-Frame-Options` headers.
- API keys and credentials live only in `.env` on the server. Settings shows whether a key is configured, never its value.
- **Vercel + Supabase** is the main deployment (see below). Self-hosting on a VPS also works: without `SUPABASE_URL` the app stores files in `STORAGE_DIR`, but it still needs a Postgres database.

## Deploying to Vercel (Supabase)

1. Create a Supabase project. Copy the Prisma connection strings (Connect → ORMs → Prisma) into `DATABASE_URL` (port 6543, `?pgbouncer=true&connection_limit=1`) and `DIRECT_URL` (port 5432). Copy the project URL and the **service_role** key into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Create the tables from your machine: `npx prisma db push`.
3. Optional, to move the old local data: `node --env-file=.env scripts/migrate-to-supabase.mjs`.
4. Import the repo in Vercel and add every variable from `.env` (except `STORAGE_DIR`) under Project → Settings → Environment Variables. Deploy.

How it works on Vercel:
- Files live in a **private** bucket (created automatically on first upload). The service-role key never reaches the browser.
- Uploads go straight from the browser to the bucket through a one-time signed URL (`/api/uploads`), because Vercel limits request bodies to 4.5 MB. The file waits in `incoming/` until the server has checked its size and bytes, then it moves to `uploads/`. Rejected files are deleted.
- Downloads redirect to a signed link that expires after 60 seconds, so large files never pass through a function.
- The login rate limiter is in memory, so on serverless it only counts attempts per instance. Use a long, random password.

## Notes on the formatter

- The original file is never changed. Each export is saved as a new document linked to its source.
- Before export, the word, table and image counts of the output are compared with the input. If anything is missing, the export stops and lists what was lost.
- The table of contents and the lists of figures and tables are Word fields. When Word opens the file and asks to update fields, choose **Yes** (or right-click → Update Field).
- Mammoth cannot tell number lists from letter lists, so Word lists are renumbered (1., 2. / a., b.) and a note appears under "Perubahan". Images in EMF/WMF format are replaced with a red marker and reported.
- The "Universitas Terbuka — Proposal/Metode Penelitian (contoh)" profile was measured from a sample proposal the campus accepted. Check its margins and spacing against the official guideline.
