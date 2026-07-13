"use client";

import { useCallback, useEffect, useState } from "react";
import {
  autonomousCoverage,
  autonomousPrinciples,
  type AutonomySnapshot,
  type ProviderState,
} from "@/lib/autonomy";

const initialError = "Non è stato possibile leggere il rapporto autonomo.";

function statusClasses(state: ProviderState) {
  if (state === "operativo") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (state === "parziale") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (state === "errore") return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function scoreClasses(score: number, reversed = false) {
  const good = reversed ? score <= 45 : score >= 70;
  const bad = reversed ? score >= 70 : score <= 40;
  if (good) return "text-emerald-300";
  if (bad) return "text-rose-300";
  return "text-amber-300";
}

function formatDate(value?: string | null) {
  if (!value) return "Prima analisi non ancora eseguita";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(date);
}

function formatNumber(value?: number, maximumFractionDigits = 2) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits }).format(value);
}

export default function AutonomyPanel() {
  const [snapshot, setSnapshot] = useState<AutonomySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/autonomy/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSnapshot((await response.json()) as AutonomySnapshot);
    } catch (reason) {
      setError(reason instanceof Error ? `${initialError} ${reason.message}` : initialError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  if (loading && !snapshot) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-lg font-black text-white">Caricamento motore autonomo…</p>
        <p className="mt-2 text-sm text-slate-500">Lettura dell’ultimo rapporto salvato.</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="panel border-rose-400/25 p-6">
        <p className="font-black text-rose-300">{error || initialError}</p>
        <button onClick={() => void loadSnapshot()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">
          Riprova
        </button>
      </div>
    );
  }

  const operational = snapshot.providers.filter((item) => item.state === "operativo").length;
  const monitoredClasses = new Set(snapshot.markets.map((item) => item.assetClass)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Fenice Autopilot</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Analisi autonoma dei mercati</h1>
          <p className="mt-3 max-w-4xl leading-7 text-slate-400">
            Il motore raccoglie fonti indipendenti, scopre nuovi strumenti e aggiorna il rapporto senza intervento manuale.
            Analizza automaticamente, ma non può comprare né vendere.
          </p>
        </div>
        <button
          onClick={() => void loadSnapshot()}
          disabled={loading}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:border-amber-400 disabled:opacity-50"
        >
          {loading ? "Aggiornamento…" : "Ricarica rapporto"}
        </button>
      </div>

      <article className="panel overflow-hidden">
        <div className="border-b border-slate-800 bg-gradient-to-r from-amber-400/10 to-transparent p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${snapshot.mode === "live" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
                  {snapshot.mode === "live" ? "Dati live" : snapshot.mode === "partial" ? "Copertura parziale" : "Avvio iniziale"}
                </span>
                <span className="text-xs font-bold text-slate-500">Versione rapporto {snapshot.version}</span>
              </div>
              <h2 className="mt-4 text-xl font-black text-white">{snapshot.headline}</h2>
              <p className="mt-2 text-sm text-slate-500">Ultima analisi: {formatDate(snapshot.generatedAt)}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-5 py-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Verdetto automatico</p>
              <p className="mt-2 text-2xl font-black text-white">{snapshot.pulse.verdict}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Opportunità", snapshot.pulse.opportunity, false],
            ["Rischio", snapshot.pulse.risk, true],
            ["Fiducia dati", snapshot.pulse.confidence, false],
            ["Scoperta emergenti", snapshot.pulse.discoveryHeat, false],
          ].map(([label, value, reversed]) => (
            <div key={String(label)} className="bg-slate-900/95 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-black ${scoreClasses(Number(value), Boolean(reversed))}`}>{value}/100</p>
            </div>
          ))}
        </div>
      </article>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="panel p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Fonti operative</p>
          <p className="mt-2 text-3xl font-black">{operational}/{snapshot.providers.length}</p>
          <p className="mt-2 text-sm text-slate-500">Le fonti parziali continuano a contribuire con fiducia ridotta.</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Strumenti letti</p>
          <p className="mt-2 text-3xl font-black">{snapshot.markets.length}</p>
          <p className="mt-2 text-sm text-slate-500">Distribuiti in {monitoredClasses} classi presenti nell’ultimo rapporto.</p>
        </article>
        <article className="panel p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Segnali nuovi</p>
          <p className="mt-2 text-3xl font-black">{snapshot.discoveries.length}</p>
          <p className="mt-2 text-sm text-slate-500">IPO, SEC, crypto, biotech, società private e tecnologie emergenti.</p>
        </article>
      </div>

      <article className="panel p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-black">Stato delle fonti</h2>
            <p className="mt-1 text-sm text-slate-500">Nessun punteggio viene considerato completo se le fonti fondamentali mancano.</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Aggiornamento programmato giornaliero</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {snapshot.providers.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-white">{item.name}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${statusClasses(item.state)}`}>{item.state}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.coverage.map((coverage) => (
                  <span key={coverage} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{coverage}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="panel overflow-hidden">
          <div className="border-b border-slate-800 p-5 sm:p-6">
            <h2 className="text-xl font-black">Strumenti con punteggio più alto</h2>
            <p className="mt-1 text-sm text-slate-500">Classifica quantitativa, non ordine di acquisto.</p>
          </div>
          <div className="overflow-x-auto px-5 sm:px-6">
            <table className="w-full min-w-[700px] text-left">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-4 pr-4">Strumento</th>
                  <th className="py-4 pr-4">Classe</th>
                  <th className="py-4 pr-4">Prezzo</th>
                  <th className="py-4 pr-4">Variazione</th>
                  <th className="py-4 pr-4">Score</th>
                  <th className="py-4 text-right">Rischio</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.markets.slice(0, 18).map((item, index) => (
                  <tr key={`${item.source}-${item.symbol}-${index}`} className="border-t border-slate-800/80">
                    <td className="py-4 pr-4"><strong className="text-amber-300">{item.symbol}</strong><p className="mt-1 text-xs text-slate-500">{item.name}</p></td>
                    <td className="py-4 pr-4 text-sm text-slate-300">{item.assetClass}</td>
                    <td className="py-4 pr-4 font-bold">{formatNumber(item.price)} {item.currency}</td>
                    <td className={`py-4 pr-4 font-bold ${(item.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{item.changePercent === undefined ? "—" : `${formatNumber(item.changePercent)}%`}</td>
                    <td className={`py-4 pr-4 font-black ${scoreClasses(item.score)}`}>{item.score}</td>
                    <td className={`py-4 text-right font-black ${scoreClasses(item.risk, true)}`}>{item.risk}</td>
                  </tr>
                ))}
                {snapshot.markets.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">La prima raccolta automatica non è ancora stata eseguita.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel p-5 sm:p-6">
          <h2 className="text-xl font-black">Copertura progettata</h2>
          <p className="mt-1 text-sm text-slate-500">Il catalogo può crescere aggiungendo nuovi connettori senza rifare la dashboard.</p>
          <div className="mt-5 space-y-2">
            {autonomousCoverage.map((item) => (
              <div key={item} className="flex gap-3 rounded-xl bg-slate-950/50 p-3 text-sm text-slate-300">
                <span className="font-black text-amber-300">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel overflow-hidden">
        <div className="border-b border-slate-800 p-5 sm:p-6">
          <h2 className="text-xl font-black">Nuove opportunità rilevate</h2>
          <p className="mt-1 text-sm text-slate-500">I segnali nuovi hanno spesso rischio elevato e devono essere verificati da più fonti.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2 sm:p-6">
          {snapshot.discoveries.slice(0, 24).map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-black text-sky-300">{item.category}</span>
                <div className="text-right text-xs"><span className={scoreClasses(item.score)}>Score {item.score}</span><span className="ml-2 text-rose-300">Rischio {item.risk}</span></div>
              </div>
              <h3 className="mt-3 font-black leading-6 text-white">{item.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.signal}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{item.source}</span>
                {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="font-bold text-amber-300 hover:text-amber-200">Fonte →</a>}
              </div>
            </article>
          ))}
          {snapshot.discoveries.length === 0 && <p className="text-sm text-slate-500">Nessun segnale ancora salvato. Avviare il workflow Fenice Autonomous Analysis.</p>}
        </div>
      </article>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="panel p-5 sm:p-6">
          <h2 className="text-xl font-black">Regole del motore</h2>
          <div className="mt-4 space-y-3">
            {autonomousPrinciples.map((principle) => (
              <p key={principle} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{principle}</p>
            ))}
          </div>
        </article>

        <article className="panel border-rose-400/20 p-5 sm:p-6">
          <h2 className="text-xl font-black">Limiti e avvisi</h2>
          <div className="mt-4 space-y-3">
            {snapshot.warnings.map((warning) => (
              <p key={warning} className="rounded-xl border border-rose-400/15 bg-rose-400/5 p-4 text-sm leading-6 text-rose-100">{warning}</p>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
