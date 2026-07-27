"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MissionControl as MissionControlData, RankedAsset } from "@/lib/mission";

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function freshnessLabel(status: MissionControlData["freshnessStatus"]) {
  if (status === "near-real-time") return "Quasi in tempo reale";
  if (status === "aggiornato") return "Aggiornato";
  if (status === "stale") return "Da aggiornare";
  return "Non disponibile";
}

function actionStyle(action: RankedAsset["action"]) {
  if (action === "ACCUMULA") return { label: "CANDIDATA", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  if (action === "MANTIENI") return { label: "OSSERVA", tone: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
  if (action === "ATTENDI") return { label: "ATTENDI", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  return { label: "SCARTA", tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" };
}

export default function MissionControl() {
  const [data, setData] = useState<MissionControlData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/mission", { cache: "no-store" });
        if (!response.ok) throw new Error("Mission API non disponibile");
        const next = (await response.json()) as MissionControlData;
        if (active) {
          setData(next);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Mission API non disponibile");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const topAssets = useMemo(() => data?.rankedAssets.slice(0, 6) ?? [], [data]);

  if (error && !data) return <main className="min-h-screen bg-slate-950 p-6 text-white">Errore: {error}</main>;
  if (!data) return <main className="min-h-screen bg-slate-950 p-6 text-white">Fenice sta elaborando i dati…</main>;

  const cashAmount = data.capital;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice AI</p>
            <h1 className="mt-1 text-2xl font-black">Preparazione investimento</h1>
          </div>
          <Link href="/autonomia" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">Analisi</Link>
        </header>

        <section className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.10] to-white/[0.02] p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Stato attuale</p>
          <h2 className="mt-3 text-3xl font-black text-amber-300 sm:text-5xl">NON INVESTIRE ANCORA</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Il portafoglio reale è ancora vuoto e non è stato scelto l'intermediario. Fenice continua a studiare i mercati, ma fino al completamento della configurazione mostra solo candidati e simulazioni.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Investito realmente</p>
              <p className="mt-2 text-2xl font-black">{euro.format(0)}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Capitale disponibile</p>
              <p className="mt-2 text-2xl font-black">{euro.format(cashAmount)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Prima di comprare</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-4"><span className="text-amber-300">1</span><p className="text-sm font-bold">Scegliere banca o broker</p></div>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-4"><span className="text-slate-500">2</span><p className="text-sm font-bold text-slate-300">Definire costi, mercati disponibili e regime fiscale</p></div>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-4"><span className="text-slate-500">3</span><p className="text-sm font-bold text-slate-300">Confermare capitale iniziale e rischio massimo</p></div>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-4"><span className="text-slate-500">4</span><p className="text-sm font-bold text-slate-300">Avviare il primo acquisto solo dopo conferma</p></div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Portafoglio</p>
            <p className="mt-2 text-lg font-black">VUOTO</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fiducia dati</p>
            <p className="mt-2 text-lg font-black">{data.dataQuality}/100</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dati</p>
            <p className="mt-2 text-sm font-black">{freshnessLabel(data.freshnessStatus)}</p>
          </article>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black">Candidati da monitorare</h2>
            <p className="mt-1 text-xs text-slate-500">Nessun importo è operativo finché non scegliamo l'intermediario.</p>
          </div>
          <div className="space-y-3">
            {topAssets.map((asset, index) => {
              const style = actionStyle(asset.action);
              return (
                <article key={`${asset.symbol}-${asset.source}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-slate-500">#{index + 1} · {asset.assetClass}</p>
                      <h3 className="mt-1 text-xl font-black">{asset.symbol}</h3>
                      <p className="mt-1 text-sm text-slate-400">{asset.name}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black ${style.tone}`}>{style.label}</span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">{asset.reason}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-lg bg-white/5 px-2 py-1">Convinzione {asset.conviction}/100</span>
                    <span className="rounded-lg bg-white/5 px-2 py-1">Rischio {asset.risk}/100</span>
                    <span className="rounded-lg bg-white/5 px-2 py-1">Fonte: {asset.source}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="pb-4 text-center text-xs leading-5 text-slate-500">
          Aggiornato {new Date(data.generatedAt).toLocaleString("it-IT")}. Fenice è in modalità studio: nessun ordine, nessun capitale investito.
        </footer>
      </div>
    </main>
  );
}
