import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ThesisMate", template: "%s · ThesisMate" },
  description: "Asisten penulisan akademik pribadi.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("tm_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="id" className={`${inter.variable} ${theme === "dark" ? "dark" : ""}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="bottom-right" theme={theme} richColors closeButton />
      </body>
    </html>
  );
}
