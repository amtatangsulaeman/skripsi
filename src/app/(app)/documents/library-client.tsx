"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FilePlus, FolderInput, FolderPlus, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/radix";
import { errorMessage, postForm, postJson, uploadDirect } from "@/lib/client-api";

type FolderLite = { id: string; name: string };

export function UploadButton({ folderId, onUploaded, label = "Unggah", variant = "default" }: {
  folderId?: string | null;
  onUploaded?: (doc: { id: string; title: string; content: string; fileType: string }) => void;
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        type Res = { document: { id: string; title: string; content: string; fileType: string } };
        const ref = await uploadDirect(file);
        let document: Res["document"];
        if (ref) {
          ({ document } = await postJson<Res>("/api/documents", { upload: ref, folderId: folderId ?? null }));
        } else {
          const form = new FormData();
          form.set("file", file);
          if (folderId) form.set("folderId", folderId);
          ({ document } = await postForm<Res>("/api/documents", form));
        }
        ok++;
        onUploaded?.(document);
        if (!document.content) toast.warning(`"${file.name}" diunggah, tetapi tidak ada teks yang terbaca (mungkin PDF hasil scan).`);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
    setBusy(false);
    if (ref.current) ref.current.value = "";
    if (ok) {
      toast.success(`${ok} file berhasil diunggah.`);
      router.refresh();
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".docx,.pdf,.txt" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <Button variant={variant} onClick={() => ref.current?.click()} loading={busy}>
        <Upload /> {label}
      </Button>
    </>
  );
}

export function LibraryToolbar({ folders, currentFolder }: { folders: FolderLite[]; currentFolder: string | null }) {
  const router = useRouter();
  const [folderOpen, setFolderOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await postJson("/api/folders", { name });
      setFolderOpen(false);
      setName("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createNote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { document } = await postJson<{ document: { id: string } }>("/api/documents", { title: name, content: "", folderId: currentFolder });
      router.push(`/documents/${document.id}?tab=edit`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={folderOpen} onOpenChange={(o) => (setFolderOpen(o), setName(""))}>
        <Button variant="outline" onClick={() => setFolderOpen(true)}>
          <FolderPlus /> Folder
        </Button>
        <DialogContent title="Folder baru">
          <form onSubmit={createFolder} className="flex flex-col gap-3">
            <Label htmlFor="folder-name">Nama folder</Label>
            <Input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            <Button type="submit" loading={busy} className="self-end">
              Buat folder
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={noteOpen} onOpenChange={(o) => (setNoteOpen(o), setName(""))}>
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          <FilePlus /> Catatan
        </Button>
        <DialogContent title="Catatan baru" description="Dokumen teks yang bisa langsung kamu tulis dan edit.">
          <form onSubmit={createNote} className="flex flex-col gap-3">
            <Label htmlFor="note-title">Judul</Label>
            <Input id="note-title" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
            <Button type="submit" loading={busy} className="self-end">
              Buat & buka
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <UploadButton folderId={currentFolder} />
    </div>
  );
}

export function DocumentActions({ doc, folders }: { doc: { id: string; title: string; folderId: string | null }; folders: FolderLite[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [folderId, setFolderId] = useState(doc.folderId ?? "");
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${doc.title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => (setTitle(doc.title), setDialog("rename"))}>
            <Pencil /> Ganti nama
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            <FolderInput /> Pindahkan
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/documents/${doc.id}/file`}>
              <Download /> Unduh
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger onSelect={() => setDialog("delete")}>
            <Trash2 /> Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Ganti nama dokumen">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => (e.preventDefault(), act(() => postJson(`/api/documents/${doc.id}`, { title }, "PATCH"), "Nama diperbarui."))}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
            <Button type="submit" loading={busy} className="self-end">
              Simpan
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "move"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Pindahkan ke folder">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => (e.preventDefault(), act(() => postJson(`/api/documents/${doc.id}`, { folderId: folderId || null }, "PATCH"), "Dokumen dipindahkan."))}
          >
            <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Tanpa folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Button type="submit" loading={busy} className="self-end">
              Pindahkan
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Hapus dokumen?" description={`"${doc.title}" beserta file aslinya dan riwayat versinya akan dihapus permanen.`}>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={busy} onClick={() => act(() => postJson(`/api/documents/${doc.id}`, {}, "DELETE"), "Dokumen dihapus.")}>
              Hapus permanen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FolderActions({ folder }: { folder: FolderLite }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="opacity-60 group-hover:opacity-100" aria-label={`Aksi folder ${folder.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil /> Ganti nama
          </DropdownMenuItem>
          <DropdownMenuItem danger onSelect={() => setDialog("delete")}>
            <Trash2 /> Hapus folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Ganti nama folder">
          <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), act(() => postJson(`/api/folders/${folder.id}`, { name }, "PATCH")))}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            <Button type="submit" loading={busy} className="self-end">
              Simpan
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={`Hapus folder "${folder.name}"?`} description="Dokumen di dalamnya tidak ikut terhapus — semuanya dipindahkan ke 'Tanpa folder'.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={busy} onClick={() => act(() => postJson(`/api/folders/${folder.id}`, {}, "DELETE"))}>
              Hapus folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
