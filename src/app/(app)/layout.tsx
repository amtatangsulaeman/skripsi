import { requireSession } from "@/lib/auth/server";
import { Sidebar } from "@/components/layout/sidebar";
import { QuotaBanner } from "@/components/layout/quota-banner";

// Every page in this group is private: the session is validated server-side on each request.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="lg:flex">
      <Sidebar username={session.username} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <QuotaBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
