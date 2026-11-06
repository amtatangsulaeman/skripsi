import {
  LayoutDashboard,
  Sparkles,
  PenLine,
  ScanSearch,
  FileCog,
  SpellCheck,
  FolderOpen,
  Settings,
  Gavel,
  BookCheck,
  FileSearch,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; description: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Ringkasan aktivitas" },
  { href: "/paraphraser", label: "AI Paraphraser", icon: Sparkles, description: "Parafrasa teks akademik dengan aman" },
  { href: "/rewriter", label: "Sentence Rewriter", icon: PenLine, description: "Perbaiki kalimat & paragraf" },
  { href: "/similarity", label: "Similarity Checker", icon: ScanSearch, description: "Bandingkan kemiripan antar dokumen" },
  { href: "/formatter", label: "Thesis Formatter", icon: FileCog, description: "Format skripsi otomatis ke DOCX" },
  { href: "/grammar", label: "Grammar Checker", icon: SpellCheck, description: "Ejaan, tanda baca, dan tata bahasa" },
  { href: "/review", label: "Review Panel", icon: Gavel, description: "Simulasi 3 penguji + keputusan panel" },
  { href: "/citations", label: "Cek Sitasi", icon: BookCheck, description: "Sitasi ↔ daftar pustaka, format APA 7" },
  { href: "/writing-check", label: "Cek Kualitas Tulisan", icon: FileSearch, description: "Kata kabur, klise, tidak baku, kalimat panjang" },
  { href: "/mentor", label: "Mentor Struktur Bab", icon: GraduationCap, description: "Susun kerangka BAB I–V lewat tanya-jawab" },
  { href: "/documents", label: "My Documents", icon: FolderOpen, description: "Pustaka dokumen pribadi" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Preferensi aplikasi" },
];

export const TOOL_ITEMS = NAV_ITEMS.filter((i) => !["/dashboard", "/settings", "/documents"].includes(i.href));
