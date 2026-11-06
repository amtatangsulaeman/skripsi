"use client";

import { useEffect, useState } from "react";
import { Hourglass, X } from "lucide-react";
import { clearQuota, QUOTA_EVENT, readQuota, type QuotaState } from "@/lib/client-api";

function formatWait(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 90) return `${s} detik`;
  const m = Math.ceil(s / 60);
  if (m < 90) return `${m} menit`;
  const h = Math.floor(m / 60);
  return `${h} jam ${m % 60} menit`;
}

/** Sticky notice while the Gemini quota is exhausted, with a live countdown. Disappears when the wait is over. */
export function QuotaBanner() {
  const [state, setState] = useState<QuotaState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setState(readQuota());
    const onQuota = (e: Event) => setState((e as CustomEvent<QuotaState | null>).detail);
    window.addEventListener(QUOTA_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EVENT, onQuota);
  }, []);

  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= state.until) clearQuota();
    }, 1000);
    return () => clearInterval(t);
  }, [state]);

  if (!state || now >= state.until) return null;
  const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(state.until));
  const daily = state.code === "quota_exhausted";

  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-transparent bg-warning-soft p-3 text-sm text-warning">
      <Hourglass className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{daily ? "Kuota harian Gemini habis" : "Batas per menit Gemini tercapai"}</p>
        <p className="mt-0.5">
          Fitur AI (Paraphraser, Rewriter, Grammar, Review Panel, Mentor) bisa dipakai lagi dalam <span className="font-medium tabular-nums">{formatWait(state.until - now)}</span> (sekitar pukul {clock}).
          {daily && " Fitur tanpa AI seperti Cek Sitasi, Cek Kualitas Tulisan, Similarity, dan Formatter tetap bisa dipakai."}
        </p>
      </div>
      <button onClick={clearQuota} className="rounded-md p-1 hover:bg-black/5" aria-label="Tutup pemberitahuan kuota">
        <X className="size-4" />
      </button>
    </div>
  );
}
