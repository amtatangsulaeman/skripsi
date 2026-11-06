import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Folder, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { DocumentActions, FolderActions, LibraryToolbar } from "./library-client";

export const metadata: Metadata = { title: "My Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const { q, folder } = await searchParams;
  const query = q?.trim();

  const [folders, documents, counts, total, unfiled] = await Promise.all([
    db.folder.findMany({ orderBy: { name: "asc" } }),
    db.document.findMany({
      where: {
        ...(folder === "none" ? { folderId: null } : folder ? { folderId: folder } : {}),
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: { id: true, title: true, fileType: true, kind: true, sizeBytes: true, folderId: true, updatedAt: true },
    }),
    db.document.groupBy({ by: ["folderId"], _count: true }),
    db.document.count(),
    db.document.count({ where: { folderId: null } }),
  ]);
  const countFor = (id: string) => counts.find((c) => c.folderId === id)?._count ?? 0;
  const activeFolder = folders.find((f) => f.id === folder);

  const folderLink = (value: string | undefined, label: string, count: number, icon = true) => {
    const active = (folder ?? "") === (value ?? "");
    const params = new URLSearchParams();
    if (value) params.set("folder", value);
    if (query) params.set("q", query);
    return (
      <Link
        href={`/documents${params.size ? `?${params}` : ""}`}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm",
          active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon && <Folder className="size-4 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className="text-xs tabular-nums">{count}</span>
      </Link>
    );
  };

  return (
    <>
      <PageHeader title="My Documents" description="Pustaka dokumen privat. File disimpan di server ini dan hanya bisa diakses setelah login." />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="flex flex-col gap-1">
          {folderLink(undefined, "Semua dokumen", total, false)}
          {folderLink("none", "Tanpa folder", unfiled, false)}
          <div className="my-2 h-px bg-border" />
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              <div className="min-w-0 flex-1">{folderLink(f.id, f.name, countFor(f.id))}</div>
              <FolderActions folder={{ id: f.id, name: f.name }} />
            </div>
          ))}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <form className="relative min-w-48 flex-1" action="/documents">
              {folder && <input type="hidden" name="folder" value={folder} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={query} placeholder="Cari judul atau isi dokumen…" className="pl-9" />
            </form>
            <LibraryToolbar folders={folders.map((f) => ({ id: f.id, name: f.name }))} currentFolder={activeFolder?.id ?? null} />
          </div>

          {documents.length === 0 ? (
            <EmptyState icon={<FileText />} title={query ? "Tidak ada dokumen yang cocok" : "Belum ada dokumen"}>
              {query ? "Coba kata kunci lain." : "Unggah file DOCX, PDF, atau TXT untuk memulai."}
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <ul className="divide-y divide-border">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <Link href={`/documents/${d.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium hover:text-primary">{d.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(d.updatedAt)}
                        {d.sizeBytes > 0 && ` · ${formatBytes(d.sizeBytes)}`}
                        {!activeFolder && d.folderId && ` · ${folders.find((f) => f.id === d.folderId)?.name ?? ""}`}
                      </span>
                    </Link>
                    {d.kind === "formatted" && <Badge tone="success">Hasil format</Badge>}
                    {d.kind === "note" && <Badge tone="primary">Catatan</Badge>}
                    <Badge>{d.fileType.toUpperCase()}</Badge>
                    <DocumentActions doc={{ id: d.id, title: d.title, folderId: d.folderId }} folders={folders.map((f) => ({ id: f.id, name: f.name }))} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
