"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StrategyBacktest, TerminalDecision, TerminalReport, TechnicalSignal, UnifiedAsset } from "@/lib/terminal";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

function percent(value?: number) {
  return Number.isFinite(value) ? `${number.format(Number(value))}%` : "—";
}

function price(value?: number, currency?: string) {
  if (!Number.isFinite(value)) return "—";
  return `${number.format(Number(value))} ${currency ?? ""}`.trim();
}

function decisionClass(decision: TerminalDecision) {
  if (decision === "ACCUMULA") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (decision === "MANTIENI") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  if (decision === "SPECULATIVA") return "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300";
  if (decision === "ATTENDI") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function signalClass(signal: TechnicalSignal) {
  if (signal === "FORTE") return "text-emerald-300";
  if (signal === "POSITIVO") return "text-sky-300";
  if (signal === "NEUTRALE") return "text-amber-300";
  return "text-rose-300";
}

function scoreClass(score: number) {
  if (score >= 72) return "text-emerald-300";
  if (score >= 60) return "text-sky-300";
  if (score >= 48) return "text-amber-300";
  return "text-rose-300";
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-black text-white">{value}</p>
      {note ? <p className="mt-1 text-[10px] text-slate-600">{note}</p> : null}
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: StrategyBacktest }) {
  const beatsBenchmark = strategy.excessAnnualizedReturnPercent > 0;
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-white">{strategy.label}</p>
          <p className="mt-1 text-xs text-slate-500">{strategy.observations} sedute · costo {strategy.transactionCostPercent}% per cambio</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${beatsBenchmark ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
          {strategy.excessAnnualizedReturnPercent >= 0 ? "+" : ""}{strategy.excessAnnualizedReturnPercent}% vs mercato
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Rendimento annuo" value={percent(strategy.annualizedReturnPercent)} />
        <Metric label="Rendimento totale" value={percent(strategy.totalReturnPercent)} />
        <Metric label="Drawdown" value={percent(strategy.maxDrawdownPercent)} />
        <Metric label="Sharpe" value={number.format(strategy.sharpe)} />
        <Metric label="Operazioni" value={String(strategy.trades)} />
        <Metric label="Esposizione" value={percent(strategy.exposurePercent)} />
      </div>
    </article>
  );
}

function AssetDetail({ asset }: { asset: UnifiedAsset }) {
  const technical = asset.technical;
  const valuation = asset.valuation;
  return (
    <section className="space-y-5">
      <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-3xl font-black text-amber-300">{asset.symbol}</p>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${decisionClass(asset.decision)}`}>{asset.decision}</span>
              <span className={`rounded-full bg-slate-900 px-3 py-1 text-xs font-black ${signalClass(technical.signal)}`}>Tecnico {technical.signal}</span>
            </div>
            <h2 className="mt-2 text-xl font-black">{asset.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{asset.assetClass}{asset.businessStage ? ` · ${asset.businessStage}` : ""} · {technical.market}</p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">{asset.reason}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[440px]">
            <Metric label="Fenice Score" value={`${asset.unifiedScore}/100`} />
            <Metric label="Confidenza" value={`${asset.confidence}/100`} />
            <Metric label="Rischio" value={`${asset.riskScore}/100`} />
            <Metric label="Prezzo" value={price(asset.price, asset.currency)} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Metric label="Fondamentale" value={Number.isFinite(asset.fundamentalScore) ? `${asset.fundamentalScore}/100` : "n/a"} />
          <Metric label="Tecnico" value={`${asset.technicalScore}/100`} />
          <Metric label="Valutazione" value={Number.isFinite(asset.valuationScore) ? `${asset.valuationScore}/100` : "n/a"} />
          <Metric label="RSI 14" value={number.format(technical.indicators.rsi14 ?? NaN)} />
          <Metric label="1 mese" value={percent(technical.returns.oneMonthPercent)} />
          <Metric label="6 mesi" value={percent(technical.returns.sixMonthPercent)} />
          <Metric label="Volatilità" value={percent(technical.indicators.volatility20Percent)} />
          <Metric label="Drawdown 1A" value={percent(technical.indicators.maxDrawdown1YPercent)} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-sky-400/[0.05] p-5">
            <p className="text-xs font-black uppercase tracking-wider text-sky-300">Lettura tecnica</p>
            <div className="mt-3 space-y-2">
              {technical.reasons.map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-300/[0.05] p-5">
            <p className="text-xs font-black uppercase tracking-wider text-amber-300">Allocazione proposta</p>
            <p className="mt-3 text-3xl font-black">{asset.targetWeightPercent}% · {euro.format(asset.targetAmountEuro)}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">Il peso rispetta i limiti di concentrazione per nucleo, crescita e strumenti speculativi. Non rappresenta un ordine automatico.</p>
          </div>
        </div>
      </article>

      <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-300">Valuation Engine</p>
            <h3 className="mt-2 text-2xl font-black">Valore indicativo e margine di sicurezza</h3>
            <p className="mt-2 text-sm text-slate-500">Metodo: {valuation.method} · confidenza {valuation.confidence}/100</p>
          </div>
          <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase text-slate-300">{valuation.status}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Prezzo corrente" value={price(valuation.currentPrice, valuation.currency)} />
          <Metric label="Fair value basso" value={price(valuation.fairValueLow, valuation.currency)} />
          <Metric label="Fair value centrale" value={price(valuation.fairValueBase, valuation.currency)} />
          <Metric label="Fair value alto" value={price(valuation.fairValueHigh, valuation.currency)} />
          <Metric label="Upside centrale" value={percent(valuation.upsideBasePercent)} />
          <Metric label="P/E obiettivo" value={Number.isFinite(valuation.targetPriceToEarnings) ? number.format(valuation.targetPriceToEarnings) : "—"} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {valuation.rationale.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-3 text-sm text-slate-300">{item}</p>)}
          </div>
          <div className="space-y-2">
            {(valuation.warnings.length ? valuation.warnings : ["Nessun avviso specifico sulla valutazione."]).map((item) => <p key={item} className="rounded-xl bg-rose-400/[0.05] p-3 text-sm text-rose-100">{item}</p>)}
          </div>
        </div>
      </article>

      <section>
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-wider text-amber-300">Strategy Lab</p>
          <h3 className="mt-2 text-2xl font-black">Backtest senza dati futuri</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {technical.strategies.map((strategy) => <StrategyCard key={strategy.id} strategy={strategy} />)}
          {!technical.strategies.length ? <div className="rounded-2xl border border-white/10 p-6 text-slate-500">Storico insufficiente per il backtest.</div> : null}
        </div>
      </section>
    </section>
  );
}

export default function TerminalEngine() {
  const [report, setReport] = useState<TerminalReport | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState("TUTTE");
  const [selectedSymbol, setSelectedSymbol] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/terminal", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as TerminalReport;
        if (active) {
          setReport(data);
          setSelectedSymbol((current) => current || data.assets[0]?.symbol || "");
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Terminale non disponibile");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (report?.assets ?? []).filter((asset) => {
      const queryMatch = !normalized || `${asset.symbol} ${asset.name} ${asset.assetClass}`.toLowerCase().includes(normalized);
      const decisionMatch = decision === "TUTTE" || asset.decision === decision;
      return queryMatch && decisionMatch;
    });
  }, [report, query, decision]);

  const selected = report?.assets.find((asset) => asset.symbol === selectedSymbol) ?? filtered[0] ?? report?.assets[0];

  if (!report && !error) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta costruendo il terminale mondiale…</main>;
  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Errore Terminal Engine: {error}</main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice World Terminal</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Tecnica, fondamentali, valutazione e strategie</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">Un unico punteggio collega bilanci SEC, prezzi, trend, rischio, fair value e backtest. Le decisioni forti richiedono convergenza tra più motori e dati sufficientemente completi.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/research" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Research Engine</Link>
              <Link href="/autonomia" className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950">Autonomia →</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Copertura", `${report.coveragePercent}%`],
            ["Strumenti", `${report.assetCount}/${report.universeSize}`],
            ["Qualità terminale", `${report.dataQuality}/100`],
            ["Score medio", `${report.averageUnifiedScore}/100`],
            ["Regime", report.marketRegime],
            ["Ultimo calcolo", new Date(report.generatedAt).toLocaleString("it-IT")],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-black">Portafoglio proposto</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {report.portfolio.map((slice) => (
              <article key={slice.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-sm font-bold text-slate-300">{slice.label}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-3xl font-black">{slice.targetPercent}%</p>
                  <p className="rounded-xl bg-slate-950 px-3 py-2 font-black">{euro.format(slice.targetAmountEuro)}</p>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">{slice.rationale}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ticker, azienda o classe" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-amber-400" />
            <select value={decision} onChange={(event) => setDecision(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-amber-400">
              <option value="TUTTE">Tutte le decisioni</option>
              <option value="ACCUMULA">Accumula</option>
              <option value="MANTIENI">Mantieni</option>
              <option value="ATTENDI">Attendi</option>
              <option value="SPECULATIVA">Speculativa</option>
              <option value="EVITA">Evita</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.05] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-4">Strumento</th>
                  <th className="px-4 py-4">Fenice</th>
                  <th className="px-4 py-4">Fond.</th>
                  <th className="px-4 py-4">Tecnico</th>
                  <th className="px-4 py-4">Rischio</th>
                  <th className="px-4 py-4">Decisione</th>
                  <th className="px-4 py-4">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-white/[0.02]">
                {filtered.map((asset) => (
                  <tr key={asset.symbol} onClick={() => setSelectedSymbol(asset.symbol)} className={`cursor-pointer transition hover:bg-white/[0.05] ${selected?.symbol === asset.symbol ? "bg-amber-300/[0.06]" : ""}`}>
                    <td className="px-4 py-4"><p className="font-black text-amber-300">{asset.symbol}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{asset.name}</p></td>
                    <td className={`px-4 py-4 text-lg font-black ${scoreClass(asset.unifiedScore)}`}>{asset.unifiedScore}</td>
                    <td className="px-4 py-4">{Number.isFinite(asset.fundamentalScore) ? asset.fundamentalScore : "—"}</td>
                    <td className="px-4 py-4">{asset.technicalScore}</td>
                    <td className="px-4 py-4">{asset.riskScore}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black ${decisionClass(asset.decision)}`}>{asset.decision}</span></td>
                    <td className="px-4 py-4 font-black">{asset.targetWeightPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selected ? <AssetDetail asset={selected} /> : <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessuno strumento disponibile.</div>}

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Metodo e controlli</h2>
            <div className="mt-4 space-y-3">{report.methodology.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}</div>
          </article>
          <article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6">
            <h2 className="text-xl font-black">Limiti del ciclo</h2>
            <div className="mt-4 space-y-3">{report.warnings.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}</div>
          </article>
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">Fenice è un sistema di supporto decisionale. Backtest, punteggi, fair value e allocazioni non costituiscono una garanzia né un ordine di investimento.</footer>
      </div>
    </main>
  );
}
