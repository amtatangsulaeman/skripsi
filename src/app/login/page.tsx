import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Masuk ke ThesisMate</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">Ruang kerja akademik pribadi.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> Akses terbatas untuk pemilik akun.
        </p>
      </div>
    </main>
  );
}
