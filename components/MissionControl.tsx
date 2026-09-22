"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MissionControl as MissionControlData, RankedAsset } from "@/lib/mission";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type ReadinessStatus = "PASS" | "TESTING" | "MISSING" | "BLOCKED";

type ReadinessControl = {
  id: string;
  label: string;
  critical: boolean;
  status: ReadinessStatus;
};

type ReadinessPayload = {
  generatedAt: string;
  report: {
    engineeringScore: number;
    criticalPassed: number;
    criticalTotal: number;
    shadowReady: boolean;
    capitalReady: boolean;
    blockers: ReadinessControl[];
    testing: ReadinessControl[];
    controls: ReadinessControl[];
  };
  liveTradingReleased: boolean;
  liveTradingAllowed: boolean;
  capitalReady: boolean;
  note?: string;
};

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

function readinessTone(status: ReadinessStatus) {
  if (status === "PASS") return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200";
  if (status === "TESTING") return "border-sky-400/20 bg-sky-400/[0.06] text-sky-100";
  if (status === "BLOCKED") return "border-rose-400/20 bg-rose-400/[0.08] text-rose-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export default function MissionControl({ initialData }: { initialData: MissionControlData }) {
  const [data, setData] = useState<MissionControlData>(initialData);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      try {
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        const missionResponse = await fetch("/api/mission", { cache: "no-store", signal: controller.signal });
        if (!missionResponse.ok) throw new Error("Mission API non disponibile");
        const nextMission = (await missionResponse.json()) as MissionControlData;

        let nextReadiness: ReadinessPayload | null = null;
        try {
          const readinessResponse = await fetch("/api/trading/readiness", { cache: "no-store", signal: controller.signal });
          if (readinessResponse.ok) nextReadiness = (await readinessResponse.json()) as ReadinessPayload;
        } catch {
          nextReadiness = null;
        }

        window.clearTimeout(timeout);
        if (active) {
          setData(nextMission);
          if (nextReadiness) setReadiness(nextReadiness);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Aggiornamento dati non disponibile");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const topAssets = useMemo(() => data.rankedAssets.slice(0, 6), [data]);
  const cashAmount = data.capital;
  const report = readiness?.report;
  const blockerPreview = report?.blockers.slice(0, 4) ?? [];
  const criticalSummary = report ? `${report.criticalPassed}/${report.criticalTotal}` : "—";
  const engineeringSummary = report ? `${report.engineeringScore}/100` : "—";
  const liveLocked = readiness ? readiness.liveTradingAllowed === false && readiness.liveTradingReleased === false : true;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-36 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {error ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">
            I dati visibili sono l’ultima versione disponibile. Aggiornamento in tempo reale temporaneamente non riuscito.
          </div>
        ) : null}

        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice AI</p>
            <h1 className="mt-1 text-2xl font-black">Preparazione investimento</h1>
          </div>
          <Link href="/readiness" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
            Readiness
          </Link>
        </header>

        <section className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.10] to-white/[0.02] p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Stato attuale</p>
          <h2 className="mt-3 text-3xl font-black text-amber-300 sm:text-5xl">NON INVESTIRE ANCORA</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Fenice resta in modalità studio/PAPER. I candidati possono essere analizzati, ma nessun punteggio equivale a un’autorizzazione d’acquisto. Il live rimane bloccato finché tutti i gate critici, la validazione PAPER e gli evidence runtime non risultano certificati.
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

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Readiness tecnica</p>
            <p className="mt-2 text-lg font-black">{engineeringSummary}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gate critici PASS</p>
            <p className="mt-2 text-lg font-black">{criticalSummary}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fiducia dati</p>
            <p className="mt-2 text-lg font-black">{data.dataQuality}/100</p>
            <p className="mt-1 text-[10px] text-slate-500">{freshnessLabel(data.freshnessStatus)}</p>
          </article>
          <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/70">Live trading</p>
            <p className="mt-2 text-lg font-black text-rose-200">{liveLocked ? "BLOCCATO" : "NON VERIFICATO"}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Gate di certificazione</p>
              <p className="mt-1 text-xs text-slate-500">Stato derivato dall’API readiness, non da testo statico.</p>
            </div>
            <Link href="/readiness" className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-slate-300">Dettagli</Link>
          </div>
          <div className="mt-4 space-y-3">
            {blockerPreview.length > 0 ? blockerPreview.map((control) => (
              <div key={control.id} className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${readinessTone(control.status)}`}>
                <p className="text-sm font-bold">{control.label}</p>
                <span className="rounded-full border border-current/20 px-2 py-1 text-[10px] font-black">{control.status}</span>
              </div>
            )) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Verifica dei gate in corso. Fenice non assume PASS in assenza di evidence.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black">Candidati da monitorare</h2>
            <p className="mt-1 text-xs text-slate-500">Ranking informativo: nessun candidato può diventare un ordine reale finché il gate operativo resta chiuso.</p>
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
          Dati mission aggiornati {new Date(data.generatedAt).toLocaleString("it-IT")}. Readiness aggiornata {readiness ? new Date(readiness.generatedAt).toLocaleString("it-IT") : "in verifica"}. Nessun ordine reale autorizzato.
        </footer>
      </div>
    </main>
  );
}
