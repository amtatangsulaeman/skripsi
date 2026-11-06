import type { Metadata } from "next";
import Link from "next/link";
import { FileText, History, ScanSearch, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getActiveModel } from "@/lib/settings";
import { TOOL_ITEMS } from "@/components/layout/nav";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Alert } from "@/components/ui/primitives";
import { formatDate, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const FEATURE_LABEL: Record<string, string> = { paraphrase: "Parafrasa", rewrite: "Rewrite", grammar: "Grammar" };
const SCOPE_LABEL: Record<string, string> = { internal: "Antar dokumen sendiri", web: "Sumber web publik", external: "Penyedia eksternal" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("id-ID", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date()));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function DashboardPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [documents, history, reports, usageToday, model] = await Promise.all([
    db.document.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, fileType: true, updatedAt: true, kind: true },
    }),
    db.paraphraseHistory.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.similarityReport.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.usageLog.aggregate({ where: { createdAt: { gte: startOfDay } }, _sum: { tokensUsed: true }, _count: true }),
    getActiveModel(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lanjutkan penulisan skripsimu. Semua data tersimpan privat di server ini.</p>
      </div>

      {!env.geminiApiKey && (
        <Alert tone="warning">
          GEMINI_API_KEY belum diatur di file <code>.env</code>. Fitur AI (Paraphraser, Rewriter, Grammar, analisis pedoman) belum bisa digunakan.
        </Alert>
      )}

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-3 text-sm font-medium text-muted-foreground">Akses cepat</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TOOL_ITEMS.map(({ href, label, icon: Icon, description }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-surface"
            >
              <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-4" />
              </div>
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Dokumen terakhir</CardTitle>
            <Link href="/documents" className="text-xs text-primary hover:underline">
              Semua
            </Link>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <EmptyState icon={<FileText />} title="Belum ada dokumen">
                <Link href="/documents" className="text-primary hover:underline">
                  Unggah dokumen pertama
                </Link>
              </EmptyState>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{d.title}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(d.updatedAt)}</span>
                      </span>
                      <Badge>{d.kind === "formatted" ? "FORMAT" : d.fileType.toUpperCase()}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat parafrasa</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyState icon={<History />} title="Belum ada riwayat">
                <Link href="/paraphraser" className="text-primary hover:underline">
                  Coba AI Paraphraser
                </Link>
              </EmptyState>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="py-2.5">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge tone="primary">{FEATURE_LABEL[h.feature] ?? h.feature}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{truncate(h.originalText, 90)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Laporan similarity</CardTitle>
            <Link href="/similarity" className="text-xs text-primary hover:underline">
              Cek baru
            </Link>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <EmptyState icon={<ScanSearch />} title="Belum ada laporan" />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/similarity?report=${r.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{r.title || "Laporan tanpa judul"}</span>
                        <span className="text-xs text-muted-foreground">{SCOPE_LABEL[r.analysisScope] ?? r.analysisScope}</span>
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                        {r.similarityScore.toFixed(1)}% <ArrowRight className="size-3.5 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Model aktif: <span className="font-medium text-foreground">{model}</span> · Pemakaian hari ini: {usageToday._count} permintaan,{" "}
        {(usageToday._sum.tokensUsed ?? 0).toLocaleString("id-ID")} token
      </p>
    </div>
  );
}
