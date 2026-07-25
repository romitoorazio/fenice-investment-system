"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FundamentalCompany, FundamentalResearchReport, ResearchDecision } from "@/lib/research";

function decisionClass(decision: ResearchDecision) {
  if (decision === "PRIORITÀ") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (decision === "APPROFONDISCI") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  if (decision === "OSSERVA") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function scoreClass(score: number) {
  if (score >= 70) return "text-emerald-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

function compact(value?: number, unit?: string) {
  if (!Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat("it-IT", {
    notation: Math.abs(Number(value)) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(Number(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

function percent(value?: number) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Number(value))}%` : "—";
}

function ratio(value?: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(value)) : "—";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-black text-white">{value}</p>
    </div>
  );
}

function CompanyCard({ company }: { company: FundamentalCompany }) {
  const financials = company.financials;
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-2xl font-black text-amber-300">{company.ticker}</p>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${decisionClass(company.decision)}`}>{company.decision}</span>
          </div>
          <h2 className="mt-2 text-lg font-black text-white">{company.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{company.sector} · esercizio {financials.fiscalYear ?? "n/d"}</p>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Score fondamentale</p>
          <p className={`mt-1 text-3xl font-black ${scoreClass(company.scores.overall)}`}>{company.scores.overall}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Crescita ricavi" value={percent(financials.revenueGrowth3YPercent)} />
        <Metric label="Margine operativo" value={percent(financials.operatingMarginPercent)} />
        <Metric label="Margine FCF" value={percent(financials.freeCashFlowMarginPercent)} />
        <Metric label="Debito/Equity" value={ratio(financials.debtToEquity)} />
        <Metric label="P/E indicativo" value={ratio(financials.priceToEarnings)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-emerald-400/[0.05] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Punti di forza rilevati</p>
          <div className="mt-3 space-y-2">
            {company.thesis.map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}
          </div>
        </div>
        <div className="rounded-2xl bg-rose-400/[0.05] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-rose-300">Rischi da verificare</p>
          <div className="mt-3 space-y-2">
            {company.risks.map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-slate-500">
        <span>Completezza dati: <strong className="text-white">{company.scores.dataCompleteness}/100</strong></span>
        {company.filing?.url ? (
          <a href={company.filing.url} target="_blank" rel="noreferrer" className="font-black text-amber-300 hover:text-amber-200">
            Apri {company.filing.form ?? "filing"} SEC →
          </a>
        ) : <span>Filing annuale non collegato</span>}
      </div>
    </article>
  );
}

export default function ResearchEngine() {
  const [report, setReport] = useState<FundamentalResearchReport | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState("TUTTE");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/research", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as FundamentalResearchReport;
        if (active) {
          setReport(data);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Ricerca fondamentale non disponibile");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (report?.companies ?? []).filter((company) => {
      const matchesQuery = !normalized || `${company.ticker} ${company.name} ${company.sector}`.toLowerCase().includes(normalized);
      const matchesDecision = decision === "TUTTE" || company.decision === decision;
      return matchesQuery && matchesDecision;
    });
  }, [report, query, decision]);

  if (!report && !error) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta costruendo la ricerca fondamentale…</main>;
  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Errore Research Engine: {error}</main>;

  const priority = report.companies.filter((company) => company.decision === "PRIORITÀ" || company.decision === "APPROFONDISCI").length;
  const operational = report.companies.filter((company) => company.status === "operativo").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice Research Engine</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Analisi fondamentale verificabile</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">
                Bilanci annuali SEC normalizzati, crescita, margini, cassa, debito, free cash flow e valutazione indicativa. Ogni punteggio mostra la propria completezza e rimanda al filing originale.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/autonomia" className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950">Autonomia →</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Copertura", `${report.coveragePercent}%`],
            ["Società analizzate", `${report.companyCount}/${report.universeSize}`],
            ["Dati operativi", String(operational)],
            ["Da approfondire", String(priority)],
            ["Score medio", `${report.averageScore}/100`],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ticker, azienda o settore" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-amber-400" />
            <select value={decision} onChange={(event) => setDecision(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-amber-400">
              <option value="TUTTE">Tutte le decisioni</option>
              <option value="PRIORITÀ">Priorità</option>
              <option value="APPROFONDISCI">Approfondisci</option>
              <option value="OSSERVA">Osserva</option>
              <option value="SCARTA">Scarta</option>
              <option value="DATI INSUFFICIENTI">Dati insufficienti</option>
            </select>
          </div>
        </section>

        <section className="space-y-5">
          {filtered.map((company) => <CompanyCard key={company.ticker} company={company} />)}
          {!filtered.length && <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessuna società corrisponde ai filtri selezionati.</div>}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Metodo di analisi</h2>
            <div className="mt-4 space-y-3">
              {report.methodology.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}
            </div>
          </article>
          <article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6">
            <h2 className="text-xl font-black">Avvisi del ciclo</h2>
            <div className="mt-4 space-y-3">
              {(report.warnings.length ? report.warnings : ["Nessun avviso critico nell’ultimo ciclo fondamentale."]).map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}
            </div>
          </article>
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">
          Fonte primaria: SEC EDGAR Company Facts e filings annuali. Lo screening non costituisce consulenza finanziaria e non esegue ordini.
        </footer>
      </div>
    </main>
  );
}
