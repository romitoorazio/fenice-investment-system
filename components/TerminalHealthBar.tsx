"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TerminalReport } from "@/lib/terminal";

export default function TerminalHealthBar() {
  const [report, setReport] = useState<TerminalReport | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/terminal", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as TerminalReport;
        if (active) setReport(data);
      } catch {
        // Il terminale principale mostra gli eventuali errori di caricamento.
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!report) return null;
  const safe = !report.guardrails?.violations.length && report.allocationCheck?.valid;
  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 px-4 py-3 text-white backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 font-black ${safe ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
            Guardrail {safe ? "OK" : "DA VERIFICARE"}
          </span>
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-slate-300">Freschezza: {report.freshnessStatus ?? "n/d"}</span>
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-slate-300">Aggiornati: {report.freshAssetCount ?? 0}/{report.assetCount}</span>
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-slate-300">Investito: {report.allocationCheck?.investedPercent ?? 0}%</span>
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-slate-300">Riserva: {report.allocationCheck?.reservePercent ?? 100}%</span>
        </div>
        <Link href="/alerts" className="rounded-full bg-rose-400 px-3 py-1 font-black text-slate-950">Alert Center · {report.alertsCount ?? 0}</Link>
      </div>
    </div>
  );
}
