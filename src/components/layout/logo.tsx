import { cn } from "@/lib/utils";

export function Logo({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "size-9" : "size-7";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className={box} aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M9 10h14M16 10v13" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <circle cx="22.5" cy="22.5" r="2" fill="#c7d2fe" />
      </svg>
      <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-xl" : "text-base")}>ThesisMate</span>
    </div>
  );
}
