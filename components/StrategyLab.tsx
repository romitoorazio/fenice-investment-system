"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StrategyAsset, StrategyFamily, StrategyLabReport, StrategyVerdict } from "@/lib/strategy";

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const percent = (value?: number) => Number.isFinite(value) ? `${number.format(Number(value))}%` : "—";

function verdictClass(verdict: StrategyVerdict) {
  if (verdict === "ROBUSTA") return "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200";
  if (verdict === "PROMETTENTE") return "border-sky-400/25 bg-sky-400/[0.07] text-sky-200";
  if (verdict === "FRAGILE") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  return "border-rose-400/20 bg-rose-400/[0.06] text-rose-100";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>;
}

function FamilyCard({ family }: { family: StrategyFamily }) {
  const selected = family.variants.find((variant) => variant.id === family.selectedVariantId) ?? family.variants[0];
  return <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-lg font-black">{family.label}</p><p className="mt-1 text-xs text-slate-500">Variante selezionata: {selected?.label ?? "n/d"}</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-black ${verdictClass(family.verdict)}`}>{family.verdict}</span><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black">{family.robustnessScore}/100</span></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Varianti positive OOS" value={`${family.positiveOutOfSampleVariants}/${family.variantCount}`} /><Metric label="Eccesso mediano OOS" value={percent(family.medianOutOfSampleExcessPercent)} /><Metric label="Miglioramento drawdown" value={percent(family.medianOutOfSampleDrawdownImprovementPercent)} /><Metric label="Strategia scelta" value={selected?.label ?? "—"} /></div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-full divide-y divide-white/10 text-xs"><thead className="bg-white/[0.04] text-left uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Variante</th><th className="px-3 py-3">OOS annuo</th><th className="px-3 py-3">SPY annuo</th><th className="px-3 py-3">Eccesso</th><th className="px-3 py-3">Drawdown</th><th className="px-3 py-3">Sharpe</th><th className="px-3 py-3">Operazioni</th></tr></thead><tbody className="divide-y divide-white/10">{family.variants.map((variant) => <tr key={variant.id} className={variant.id === family.selectedVariantId ? "bg-emerald-400/[0.04]" : ""}><td className="px-3 py-3 font-black">{variant.label}</td><td className="px-3 py-3">{percent(variant.outOfSample.annualizedReturnPercent)}</td><td className="px-3 py-3">{percent(variant.outOfSample.benchmarkAnnualizedReturnPercent)}</td><td className={`px-3 py-3 font-black ${variant.outOfSample.excessAnnualizedReturnPercent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{percent(variant.outOfSample.excessAnnualizedReturnPercent)}</td><td className="px-3 py-3">{percent(variant.outOfSample.maxDrawdownPercent)}</td><td className="px-3 py-3">{number.format(variant.outOfSample.sharpe)}</td><td className="px-3 py-3">{variant.outOfSample.trades}</td></tr>)}</tbody></table></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl bg-emerald-400/[0.04] p-4"><p className="text-xs font-black uppercase text-emerald-300">Evidenze</p>{family.rationale.map((item) => <p key={item} className="mt-2 text-sm leading-6 text-slate-300">• {item}</p>)}</div><div className="rounded-xl bg-rose-400/[0.04] p-4"><p className="text-xs font-black uppercase text-rose-300">Limiti</p>{(family.warnings.length ? family.warnings : ["Nessun avviso specifico oltre ai limiti generali del backtest."]).map((item) => <p key={item} className="mt-2 text-sm leading-6 text-slate-300">• {item}</p>)}</div></div>
  </article>;
}

function AssetCard({ asset }: { asset: StrategyAsset }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-black text-lime-300">{asset.symbol}</p><span className={`rounded-full border px-3 py-1 text-xs font-black ${verdictClass(asset.conclusion)}`}>{asset.conclusion}</span></div><h2 className="mt-2 text-lg font-black">{asset.name}</h2><p className="mt-1 text-sm text-slate-500">{asset.assetClass} · benchmark {asset.benchmark} · split OOS {asset.splitDate ? new Date(`${asset.splitDate}T12:00:00`).toLocaleDateString("it-IT") : "n/d"}</p></div><div className="rounded-2xl border border-lime-300/15 bg-lime-300/[0.06] px-5 py-4 text-center"><p className="text-[10px] font-bold uppercase text-lime-200">Robustezza migliore</p><p className="mt-1 text-3xl font-black text-lime-300">{asset.bestRobustnessScore}</p><p className="mt-1 text-[10px] text-slate-500">{asset.historyYears} anni · {asset.observations} sedute</p></div></div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2">{asset.families.map((family) => <FamilyCard key={family.id} family={family} />)}</div>
    {asset.warnings.length ? <div className="mt-4 space-y-2">{asset.warnings.map((item) => <p key={item} className="rounded-xl bg-amber-300/[0.05] p-3 text-sm text-amber-100">{item}</p>)}</div> : null}
  </article>;
}

export default function StrategyLab() {
  const [report, setReport] = useState<StrategyLabReport | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("TUTTI");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/strategies", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as StrategyLabReport;
        if (active) { setReport(data); setError(""); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Strategy Lab non disponibile"); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => (report?.assets ?? []).filter((asset) => {
    const matchesFilter = filter === "TUTTI" || asset.conclusion === filter;
    const normalized = query.trim().toLowerCase();
    return matchesFilter && (!normalized || `${asset.symbol} ${asset.name} ${asset.assetClass}`.toLowerCase().includes(normalized));
  }), [report, filter, query]);

  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta eseguendo i test fuori campione… {error}</main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8"><div className="mx-auto max-w-[1500px] space-y-8">
    <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">Fenice Robust Strategy Lab</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">Fuori campione, parametri multipli, benchmark reale</h1><p className="mt-4 max-w-4xl leading-7 text-slate-300">Una strategia viene promossa soltanto se il vantaggio sopravvive su dati non usati per costruirla e su più combinazioni di parametri. Il benchmark è SPY sulle stesse date.</p></div><div className="flex flex-wrap gap-2"><Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link><Link href="/terminal" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">World Terminal</Link><Link href="/valuation" className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950">DCF Valuation</Link></div></div></header>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Copertura", `${report.coveragePercent}%`],["Strumenti", `${report.assetCount}/${report.universeSize}`],["Robusti", report.robustCount],["Modalità", report.mode],["Ultimo calcolo", new Date(report.generatedAt).toLocaleString("it-IT")]].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-xl font-black">{value}</p></article>)}</section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="grid gap-3 md:grid-cols-[1fr_240px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca strumento o classe" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-lime-300" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"><option value="TUTTI">Tutti i verdetti</option><option value="ROBUSTA">Robusta</option><option value="PROMETTENTE">Promettente</option><option value="FRAGILE">Fragile</option><option value="INSUFFICIENTE">Insufficiente</option></select></div></section>
    <section className="space-y-5">{filtered.map((asset) => <AssetCard key={asset.symbol} asset={asset} />)}{!filtered.length ? <div className="rounded-2xl border border-white/10 p-10 text-center text-slate-500">Nessun risultato.</div> : null}</section>
    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-xl font-black">Metodo</h2><div className="mt-4 space-y-3">{report.methodology.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}</div></article><article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6"><h2 className="text-xl font-black">Avvisi</h2><div className="mt-4 space-y-3">{report.warnings.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}</div></article></section>
    <footer className="pb-8 text-center text-xs text-slate-500">I risultati fuori campione riducono, ma non eliminano, il rischio di overfitting.</footer>
  </div></main>;
}
