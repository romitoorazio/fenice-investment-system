"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DcfCompany, DcfReport } from "@/lib/dcf";

const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 2 });

function value(value?: number, currency?: string) {
  return Number.isFinite(value) ? `${number.format(Number(value))} ${currency ?? ""}`.trim() : "—";
}

function percent(value?: number) {
  return Number.isFinite(value) ? `${number.format(Number(value))}%` : "—";
}

function statusClass(status: DcfCompany["status"]) {
  if (status === "disponibile") return "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200";
  if (status === "non confrontabile") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  return "border-rose-400/20 bg-rose-400/[0.06] text-rose-100";
}

function robustnessClass(state?: DcfCompany["robustness"] extends infer T ? T extends { state: infer S } ? S : never : never) {
  if (state === "BASSA FRAGILITÀ") return "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200";
  if (state === "MEDIA FRAGILITÀ") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  if (state === "ALTA FRAGILITÀ") return "border-rose-400/25 bg-rose-400/[0.07] text-rose-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function Metric({ label, value: metricValue }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-black">{metricValue}</p></div>;
}

function CompanyCard({ company }: { company: DcfCompany }) {
  const robustness = company.robustness;
  const discountRates = robustness ? [...new Set(robustness.sensitivityCells.map((cell) => cell.discountRatePercent))].sort((a, b) => a - b) : [];
  const terminalRates = robustness ? [...new Set(robustness.sensitivityCells.map((cell) => cell.terminalGrowthPercent))].sort((a, b) => a - b) : [];

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-black text-cyan-300">{company.symbol}</p><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(company.status)}`}>{company.status}</span>{company.businessStage ? <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black uppercase text-slate-400">{company.businessStage}</span> : null}{robustness ? <span className={`rounded-full border px-3 py-1 text-xs font-black ${robustnessClass(robustness.state)}`}>{robustness.state}</span> : null}</div>
          <h2 className="mt-2 text-lg font-black">{company.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{company.sector}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-5 py-4 text-center"><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">DCF Score</p><p className="mt-1 text-3xl font-black text-cyan-300">{company.score}</p><p className="mt-1 text-[10px] text-slate-500">confidenza {company.confidence}/100</p></div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Prezzo" value={value(company.currentPrice, company.currency)} />
        <Metric label="Fair value basso" value={value(company.fairValueLow, company.currency)} />
        <Metric label="Fair value base" value={value(company.fairValueBase, company.currency)} />
        <Metric label="Fair value alto" value={value(company.fairValueHigh, company.currency)} />
        <Metric label="Upside base" value={percent(company.upsideBasePercent)} />
        <Metric label="FCF" value={Number.isFinite(company.freeCashFlow) ? `${compact.format(Number(company.freeCashFlow))} ${company.currency ?? ""}` : "—"} />
        <Metric label="Cassa" value={Number.isFinite(company.cash) ? `${compact.format(Number(company.cash))} ${company.currency ?? ""}` : "—"} />
        <Metric label="Debito" value={Number.isFinite(company.debt) ? `${compact.format(Number(company.debt))} ${company.currency ?? ""}` : "—"} />
      </div>

      {company.scenarios.length ? <div className="mt-5 grid gap-4 lg:grid-cols-3">{company.scenarios.map((scenario) => <div key={scenario.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">{scenario.label}</p><p className="mt-1 text-xs text-slate-500">5 anni + terminal value</p></div><p className="text-2xl font-black text-cyan-300">{value(scenario.fairValuePerShare, company.currency)}</p></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Metric label="Crescita iniziale" value={percent(scenario.revenueGrowthStartPercent)} /><Metric label="Tasso sconto" value={percent(scenario.discountRatePercent)} /><Metric label="Crescita terminale" value={percent(scenario.terminalGrowthPercent)} /><Metric label="Upside" value={percent(scenario.upsidePercent)} /></div></div>)}</div> : null}

      {robustness && robustness.sensitivityCells.length ? (
        <section className="mt-5 rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Robustness & sensitivity 3×3</p>
              <h3 className="mt-2 text-xl font-black">Quanto dipende il fair value dalle ipotesi?</h3>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">{robustness.note}</p>
            </div>
            <span className={`self-start rounded-full border px-3 py-2 text-xs font-black ${robustnessClass(robustness.state)}`}>{robustness.state}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Celle a supporto" value={`${robustness.supportingCells}/${robustness.totalCells}`} />
            <Metric label="Supporto" value={percent(robustness.supportPercent)} />
            <Metric label="Min sensibilità" value={value(robustness.fairValueMin, company.currency)} />
            <Metric label="Mediana" value={value(robustness.fairValueMedian, company.currency)} />
            <Metric label="Max sensibilità" value={value(robustness.fairValueMax, company.currency)} />
            <Metric label="Margine scenario duro" value={percent(robustness.prudentMarginPercent)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-1 text-center text-xs">
              <thead><tr><th className="rounded-lg bg-slate-950/70 p-3 text-left text-slate-500">Tasso sconto ↓ / terminale →</th>{terminalRates.map((terminal) => <th key={terminal} className="rounded-lg bg-slate-950/70 p-3 text-violet-200">{percent(terminal)}</th>)}</tr></thead>
              <tbody>{discountRates.map((discount) => <tr key={discount}><th className="rounded-lg bg-slate-950/70 p-3 text-left text-violet-200">{percent(discount)}</th>{terminalRates.map((terminal) => { const cell = robustness.sensitivityCells.find((item) => item.discountRatePercent === discount && item.terminalGrowthPercent === terminal); const supports = Number(cell?.fairValuePerShare) >= Number(company.currentPrice); return <td key={`${discount}-${terminal}`} className={`rounded-lg p-3 font-black ${supports ? "bg-emerald-400/[0.08] text-emerald-200" : "bg-rose-400/[0.06] text-rose-100"}`}><div>{value(cell?.fairValuePerShare, company.currency)}</div><div className="mt-1 text-[10px] font-normal opacity-70">{percent(cell?.upsidePercent)}</div></td>; })}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-violet-100/70">Le celle verdi indicano soltanto fair value ≥ prezzo corrente sotto quella combinazione di ipotesi. Non sono segnali BUY e non modificano score, Radar, OMS o PAPER V6.</p>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-emerald-400/[0.04] p-4"><p className="text-xs font-black uppercase text-emerald-300">Razionale</p><div className="mt-3 space-y-2">{company.rationale.map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}</div></div><div className="rounded-2xl bg-rose-400/[0.04] p-4"><p className="text-xs font-black uppercase text-rose-300">Limiti e rischi</p><div className="mt-3 space-y-2">{company.warnings.map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}</div></div></div>
    </article>
  );
}

export default function DcfEngine() {
  const [report, setReport] = useState<DcfReport | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("TUTTI");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/dcf", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as DcfReport;
        if (active) { setReport(data); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "DCF non disponibile");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => (report?.companies ?? []).filter((company) => {
    const matchesStatus = filter === "TUTTI" || company.status === filter;
    const normalized = query.trim().toLowerCase();
    const matchesText = !normalized || `${company.symbol} ${company.name} ${company.sector}`.toLowerCase().includes(normalized);
    return matchesStatus && matchesText;
  }), [report, filter, query]);

  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta calcolando gli scenari DCF… {error}</main>;

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8"><div className="mx-auto max-w-7xl space-y-8">
    <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Fenice DCF Engine</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">Valore intrinseco a scenari + robustezza</h1><p className="mt-4 max-w-4xl leading-7 text-slate-300">Tre scenari separano ipotesi prudenti, centrali ed espansive. La matrice di sensibilità mostra quanto il risultato cambia al variare di sconto e crescita terminale. Fenice blocca il confronto quando i dati non sono affidabili.</p></div><div className="flex flex-wrap gap-2"><Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link><Link href="/terminal" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">World Terminal</Link><Link href="/journal" className="rounded-xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950">Decision Journal</Link></div></div></header>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Società", report.companyCount],["DCF disponibili", report.availableCount],["Copertura", `${report.coveragePercent}%`],["Modalità", report.mode],["Ultimo calcolo", new Date(report.generatedAt).toLocaleString("it-IT")]].map(([label, metricValue]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-xl font-black">{metricValue}</p></article>)}</section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="grid gap-3 md:grid-cols-[1fr_240px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca azienda o settore" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-300" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"><option value="TUTTI">Tutti gli stati</option><option value="disponibile">Disponibile</option><option value="non confrontabile">Non confrontabile</option><option value="non applicabile">Non applicabile</option><option value="dati insufficienti">Dati insufficienti</option></select></div></section>
    <section className="space-y-5">{filtered.map((company) => <CompanyCard key={company.symbol} company={company} />)}{!filtered.length ? <div className="rounded-2xl border border-white/10 p-10 text-center text-slate-500">Nessun risultato.</div> : null}</section>
    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-xl font-black">Metodo</h2><div className="mt-4 space-y-3">{report.methodology.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}</div></article><article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6"><h2 className="text-xl font-black">Avvisi</h2><div className="mt-4 space-y-3">{report.warnings.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}</div></article></section>
    <footer className="pb-8 text-center text-xs text-slate-500">Il DCF è sensibile alle ipotesi. Robustezza e matrice non costituiscono obiettivi di prezzo garantiti né autorizzazioni operative.</footer>
  </div></main>;
}
