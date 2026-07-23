"use client";

import { useEffect, useState } from "react";
import type { MissionControl as MissionControlData } from "@/lib/mission";

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function actionClass(action: string) {
  if (action === "ACCUMULA") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (action === "MANTIENI") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  if (action === "ATTENDI") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

export default function MissionControl() {
  const [data, setData] = useState<MissionControlData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mission", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Mission API non disponibile");
        return response.json();
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Errore: {error}</main>;
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Fenice sta elaborando i dati…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice Mission Control</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Obiettivo 10 anni</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Capitale iniziale {euro.format(data.capital)}, obiettivo ambizioso {euro.format(data.stretchGoal)}.
                Il sistema trasforma i dati raccolti ogni giorno in regime operativo, allocazione e priorità.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-amber-200">Regime attuale</p>
              <p className="mt-1 text-2xl font-black text-amber-300">{data.regime}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Rendimento richiesto", `${data.requiredAnnualReturn}% annuo`],
            ["Qualità dati", `${data.dataQuality}/100`],
            ["Liquidità obiettivo", `${data.cashTargetPercent}%`],
            ["Ultimo calcolo", new Date(data.generatedAt).toLocaleString("it-IT")],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-black">Allocazione dinamica</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {data.buckets.map((bucket) => (
              <article key={bucket.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-300">{bucket.label}</p>
                    <p className="mt-2 text-3xl font-black">{bucket.targetPercent}%</p>
                  </div>
                  <p className="rounded-xl bg-white/5 px-3 py-2 font-bold">{euro.format(bucket.targetAmount)}</p>
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-400">{bucket.rationale}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">Classifica strumenti monitorati</h2>
            <span className="text-sm text-slate-500">Top {data.rankedAssets.length}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/[0.05] text-left text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Strumento</th>
                    <th className="px-5 py-4">Classe</th>
                    <th className="px-5 py-4">Convinzione</th>
                    <th className="px-5 py-4">Rischio</th>
                    <th className="px-5 py-4">Decisione</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-white/[0.025]">
                  {data.rankedAssets.map((asset) => (
                    <tr key={`${asset.symbol}-${asset.source}`}>
                      <td className="px-5 py-4">
                        <p className="font-black">{asset.symbol}</p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500">{asset.name}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{asset.assetClass}</td>
                      <td className="px-5 py-4 font-black">{asset.conviction}/100</td>
                      <td className="px-5 py-4">{asset.risk}/100</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${actionClass(asset.action)}`}>
                          {asset.action}
                        </span>
                        <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">{asset.reason}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Azioni successive</h2>
            <div className="mt-5 space-y-3">
              {data.nextActions.map((action) => (
                <p key={action} className="rounded-xl bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">{action}</p>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Avvisi e limiti</h2>
            <div className="mt-5 space-y-3">
              {(data.warnings.length ? data.warnings : ["Nessun avviso critico nell'ultimo ciclo."]).map((warning) => (
                <p key={warning} className="rounded-xl border border-amber-300/10 bg-amber-300/[0.05] p-4 text-sm leading-6 text-amber-100">{warning}</p>
              ))}
            </div>
          </article>
        </section>

        <footer className="pb-6 text-center text-xs leading-5 text-slate-500">
          Fenice svolge analisi automatica ma non invia ordini al broker. Ogni operazione richiede conferma umana.
        </footer>
      </div>
    </main>
  );
}
