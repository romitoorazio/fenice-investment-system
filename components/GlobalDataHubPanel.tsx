"use client";

import { useEffect, useState } from "react";
import type { GlobalDataHub } from "@/lib/global-data-hub";

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

function stateTone(state: GlobalDataHub["providers"][number]["state"]) {
  if (state === "operativo") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (state === "parziale") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

export default function GlobalDataHubPanel() {
  const [data, setData] = useState<GlobalDataHub | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/data-hub", { cache: "no-store" });
        if (!response.ok) throw new Error("Global Data Hub non disponibile");
        const next = (await response.json()) as GlobalDataHub;
        if (active) {
          setData(next);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Global Data Hub non disponibile");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (error && !data) return <main className="min-h-screen bg-slate-950 p-6 text-white">Errore: {error}</main>;
  if (!data) return <main className="min-h-screen bg-slate-950 p-6 text-white">Fenice sta verificando le fonti globali…</main>;

  const metrics = [
    ["Salute hub", data.healthScore],
    ["Freschezza", data.freshnessScore],
    ["Copertura", data.coverageScore],
    ["Diversità fonti", data.sourceDiversityScore],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Fenice Intelligence Layer</p>
          <h1 className="mt-2 text-3xl font-black">Global Data Hub</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Unifica lo stato delle fonti, misura la qualità dei dati e rende visibili copertura, freschezza e dipendenze prima che Fenice generi segnali.</p>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(([label, score]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-black ${scoreTone(score)}`}>{score}/100</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Strumenti</p><p className="mt-2 text-2xl font-black">{data.totalInstruments}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Freschi 24h</p><p className="mt-2 text-2xl font-black text-emerald-300">{data.freshInstruments}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Da aggiornare</p><p className="mt-2 text-2xl font-black text-amber-300">{data.staleInstruments}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Fonti uniche</p><p className="mt-2 text-2xl font-black">{data.uniqueSources}</p></article>
        </section>

        <section>
          <div className="mb-3"><h2 className="text-xl font-black">Copertura per classe</h2><p className="mt-1 text-xs text-slate-500">Distribuzione degli strumenti e qualità media dei segnali disponibili.</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.assetClasses.map((assetClass) => (
              <article key={assetClass.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-4"><div><h3 className="font-black">{assetClass.name}</h3><p className="mt-1 text-xs text-slate-500">{assetClass.sources.join(" · ") || "Fonte non indicata"}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold">{assetClass.instruments} strumenti</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Freschi</p><p className="mt-1 font-black text-emerald-300">{assetClass.freshInstruments}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Score</p><p className="mt-1 font-black">{assetClass.averageScore}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Rischio</p><p className="mt-1 font-black">{assetClass.averageRisk}</p></div></div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3"><h2 className="text-xl font-black">Provider</h2><p className="mt-1 text-xs text-slate-500">Stato operativo delle sorgenti che alimentano Fenice.</p></div>
          <div className="space-y-3">
            {data.providers.map((provider) => (
              <article key={provider.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{provider.name}</h3><p className="mt-1 text-sm text-slate-400">{provider.detail}</p></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${stateTone(provider.state)}`}>{provider.state} · {provider.healthScore}/100</span></div>
                <p className="mt-3 text-xs text-slate-500">Copertura: {provider.coverage.join(", ") || "non dichiarata"}</p>
              </article>
            ))}
          </div>
        </section>

        {data.warnings.length > 0 && <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5"><h2 className="font-black text-amber-300">Avvisi qualità dati</h2><div className="mt-3 space-y-2">{data.warnings.map((warning) => <p key={warning} className="text-sm leading-6 text-slate-300">• {warning}</p>)}</div></section>}

        <footer className="text-center text-xs text-slate-500">Controllato {new Date(data.checkedAt).toLocaleString("it-IT")} · Snapshot {new Date(data.generatedAt).toLocaleString("it-IT")}</footer>
      </div>
    </main>
  );
}
