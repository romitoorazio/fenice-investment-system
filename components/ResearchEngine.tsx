"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiscoveryCandidate, DiscoveryReport } from "@/lib/discovery-engine";
import type { MissionControl, RankedAsset } from "@/lib/mission";
import type { FundamentalCompany, FundamentalResearchReport, ResearchDecision } from "@/lib/research";

type FunnelStage = "CONFERMA 3 MOTORI" | "FONDAMENTALI + RADAR" | "FONDAMENTALI FORTI" | "SCOPERTA DA STUDIARE" | "OSSERVAZIONE";

type FunnelState = {
  stage: FunnelStage;
  detail: string;
};

function decisionClass(decision: ResearchDecision) {
  if (decision === "PRIORITÀ") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (decision === "APPROFONDISCI") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  if (decision === "OSSERVA") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (decision === "SPECULATIVA") return "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function funnelClass(stage: FunnelStage) {
  if (stage === "CONFERMA 3 MOTORI") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (stage === "FONDAMENTALI + RADAR") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  if (stage === "FONDAMENTALI FORTI") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (stage === "SCOPERTA DA STUDIARE") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function stageRank(stage: FunnelStage) {
  if (stage === "CONFERMA 3 MOTORI") return 5;
  if (stage === "FONDAMENTALI + RADAR") return 4;
  if (stage === "FONDAMENTALI FORTI") return 3;
  if (stage === "SCOPERTA DA STUDIARE") return 2;
  return 1;
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

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function researchFunnel(company: FundamentalCompany, radar?: RankedAsset, discovery?: DiscoveryCandidate): FunnelState {
  const fundamentalStrong = company.decision === "PRIORITÀ" || company.decision === "APPROFONDISCI";
  const discoveryStrong = Boolean(
    discovery &&
    (discovery.status === "PRIORITARIA" || discovery.status === "DA STUDIARE") &&
    discovery.blockers.length === 0,
  );
  const radarStrong = Boolean(
    radar &&
    radar.action === "ACCUMULA" &&
    radar.entryReadiness >= 68 &&
    radar.confidenceBand !== "BASSA",
  );

  if (fundamentalStrong && discoveryStrong && radarStrong) {
    return {
      stage: "CONFERMA 3 MOTORI",
      detail: "Fondamentali, Discovery e Radar convergono senza blocker Discovery. È priorità di approfondimento umano, non un ordine automatico.",
    };
  }
  if (fundamentalStrong && radar) {
    return {
      stage: "FONDAMENTALI + RADAR",
      detail: radar.action === "ACCUMULA"
        ? "Fondamentali favorevoli e Radar positivo, ma manca una conferma Discovery completa."
        : "Fondamentali favorevoli, ma il Radar non conferma ancora un timing ACCUMULA.",
    };
  }
  if (fundamentalStrong) {
    return {
      stage: "FONDAMENTALI FORTI",
      detail: "La ricerca fondamentale merita attenzione, ma il titolo non è nella shortlist Radar corrente o non ha una conferma Discovery sufficiente.",
    };
  }
  if (discoveryStrong) {
    return {
      stage: "SCOPERTA DA STUDIARE",
      detail: "Discovery rileva un candidato interessante, ma i fondamentali non hanno ancora promosso il profilo.",
    };
  }
  return {
    stage: "OSSERVAZIONE",
    detail: "Non c’è ancora convergenza sufficiente tra fondamentali, scoperta e timing. Nessuna forzatura del segnale.",
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-black text-white">{value}</p>
    </div>
  );
}

function EngineCard({ title, score, status, detail }: { title: string; score?: number; status: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`text-2xl font-black ${Number.isFinite(score) ? scoreClass(Number(score)) : "text-slate-500"}`}>
          {Number.isFinite(score) ? `${Math.round(Number(score))}/100` : "—"}
        </p>
        <span className="text-right text-[11px] font-black uppercase text-slate-300">{status}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function CompanyCard({ company, radar, discovery }: { company: FundamentalCompany; radar?: RankedAsset; discovery?: DiscoveryCandidate }) {
  const financials = company.financials;
  const preCommercial = company.businessStage === "pre-commerciale" || company.decision === "SPECULATIVA";
  const funnel = researchFunnel(company, radar, discovery);
  const visibleSources = new Set([company.source, radar?.source, discovery?.source].filter(Boolean)).size;

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-2xl font-black text-amber-300">{company.ticker}</p>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${decisionClass(company.decision)}`}>{company.decision}</span>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${funnelClass(funnel.stage)}`}>{funnel.stage}</span>
            {company.businessStage ? <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-black uppercase text-slate-400">{company.businessStage}</span> : null}
          </div>
          <h2 className="mt-2 text-lg font-black text-white">{company.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{company.sector} · esercizio {financials.fiscalYear ?? "n/d"} · {visibleSources} fonti/motori visibili</p>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">{preCommercial ? "Score speculativo" : "Score fondamentale"}</p>
          <p className={`mt-1 text-3xl font-black ${scoreClass(company.scores.overall)}`}>{company.scores.overall}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Cross-engine convergence</p>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{funnel.detail}</p>
          </div>
          <div className="text-right text-[11px] text-slate-500">Read-only · nessun impatto su OMS o PAPER V6</div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <EngineCard
            title="Fondamentali"
            score={company.scores.overall}
            status={company.decision}
            detail={`Completezza ${company.scores.dataCompleteness}/100 · fonte ${company.source}`}
          />
          <EngineCard
            title="Discovery"
            score={discovery?.priorityScore}
            status={discovery?.status ?? "NON PRESENTE"}
            detail={discovery
              ? `Confidenza ${discovery.confidenceScore}/100 · rischio ${discovery.riskScore}/100 · ${discovery.source}`
              : "Il titolo non compare tra i candidati Discovery pubblicati nel ciclo corrente."}
          />
          <EngineCard
            title="Radar / timing"
            score={radar?.conviction}
            status={radar?.action ?? "FUORI SHORTLIST"}
            detail={radar
              ? `Readiness ${radar.entryReadiness}/100 · confidenza ${radar.confidenceBand} · rischio ${radar.riskBand}`
              : "Il titolo non rientra nella shortlist diversificata del Radar corrente."}
          />
        </div>
        {discovery?.blockers.length ? (
          <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3 text-xs leading-5 text-rose-100">
            <strong>Blocker Discovery:</strong> {discovery.blockers.join(" · ")}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Crescita ricavi" value={percent(financials.revenueGrowth3YPercent)} />
        <Metric label="Margine operativo" value={percent(financials.operatingMarginPercent)} />
        <Metric label="Margine FCF" value={percent(financials.freeCashFlowMarginPercent)} />
        <Metric label="Debito/Equity" value={ratio(financials.debtToEquity)} />
        <Metric label="P/E indicativo" value={ratio(financials.priceToEarnings)} />
        <Metric label="Autonomia cassa" value={Number.isFinite(financials.cashRunwayYears) ? `${ratio(financials.cashRunwayYears)} anni` : "—"} />
      </div>

      {preCommercial ? (
        <p className="mt-4 rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.05] p-4 text-sm leading-6 text-fuchsia-100">
          Modello separato: per una società pre-commerciale i margini tradizionali non sono confrontabili con quelli di un’azienda matura. Fenice valuta soprattutto cassa, consumo di capitale, debito, rischio clinico e possibile diluizione.
        </p>
      ) : null}

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

      {company.warnings.length ? <div className="mt-4 space-y-2">{company.warnings.map((item) => <p key={item} className="rounded-xl bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-100">{item}</p>)}</div> : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-slate-500">
        <span>Completezza dati: <strong className="text-white">{company.scores.dataCompleteness}/100</strong> · Ricavi {compact(financials.revenue, financials.currency)}</span>
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
  const [mission, setMission] = useState<MissionControl | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryReport | null>(null);
  const [error, setError] = useState("");
  const [supportWarnings, setSupportWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState("TUTTE");

  useEffect(() => {
    let active = true;
    async function load() {
      const [researchResult, missionResult, discoveryResult] = await Promise.allSettled([
        fetchJson<FundamentalResearchReport>("/api/research"),
        fetchJson<MissionControl>("/api/mission"),
        fetchJson<DiscoveryReport>("/api/discovery"),
      ]);
      if (!active) return;

      const warnings: string[] = [];
      if (researchResult.status === "fulfilled") {
        setReport(researchResult.value);
        setError("");
      } else {
        setError(errorMessage(researchResult.reason));
      }

      if (missionResult.status === "fulfilled") setMission(missionResult.value);
      else {
        setMission(null);
        warnings.push(`Radar/Mission non disponibile: ${errorMessage(missionResult.reason)}`);
      }

      if (discoveryResult.status === "fulfilled") setDiscovery(discoveryResult.value);
      else {
        setDiscovery(null);
        warnings.push(`Discovery non disponibile: ${errorMessage(discoveryResult.reason)}`);
      }
      setSupportWarnings(warnings);
    }

    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const radarBySymbol = useMemo(() => {
    return new Map((mission?.rankedAssets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]));
  }, [mission]);

  const discoveryBySymbol = useMemo(() => {
    const map = new Map<string, DiscoveryCandidate>();
    for (const candidate of discovery?.candidates ?? []) {
      const symbol = candidate.symbol.toUpperCase();
      const current = map.get(symbol);
      if (!current || candidate.priorityScore > current.priorityScore) map.set(symbol, candidate);
    }
    return map;
  }, [discovery]);

  const funnelRows = useMemo(() => {
    return (report?.companies ?? []).map((company) => {
      const symbol = company.ticker.toUpperCase();
      const radar = radarBySymbol.get(symbol);
      const discoveryCandidate = discoveryBySymbol.get(symbol);
      return {
        company,
        radar,
        discovery: discoveryCandidate,
        funnel: researchFunnel(company, radar, discoveryCandidate),
      };
    });
  }, [report, radarBySymbol, discoveryBySymbol]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return funnelRows
      .filter(({ company }) => {
        const matchesQuery = !normalized || `${company.ticker} ${company.name} ${company.sector}`.toLowerCase().includes(normalized);
        const matchesDecision = decision === "TUTTE" || company.decision === decision;
        return matchesQuery && matchesDecision;
      })
      .sort((left, right) => stageRank(right.funnel.stage) - stageRank(left.funnel.stage) || right.company.scores.overall - left.company.scores.overall);
  }, [funnelRows, query, decision]);

  if (!report && !error) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta costruendo il funnel di ricerca…</main>;
  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Errore Research Engine: {error}</main>;

  const priority = report.companies.filter((company) => company.decision === "PRIORITÀ" || company.decision === "APPROFONDISCI").length;
  const speculative = report.companies.filter((company) => company.decision === "SPECULATIVA").length;
  const operational = report.companies.filter((company) => company.status === "operativo").length;
  const radarCoverage = funnelRows.filter((row) => Boolean(row.radar)).length;
  const discoveryCoverage = funnelRows.filter((row) => Boolean(row.discovery)).length;
  const tripleCoverage = funnelRows.filter((row) => Boolean(row.radar && row.discovery)).length;
  const tripleConfirmation = funnelRows.filter((row) => row.funnel.stage === "CONFERMA 3 MOTORI").length;
  const allWarnings = [...new Set([
    ...report.warnings,
    ...supportWarnings,
    ...(error ? [`Aggiornamento Research: ${error}`] : []),
  ])];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Fenice Research Funnel · Cross-engine</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Dalla scoperta alla tesi, senza fondere i guardrail</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">
                Research mantiene i fondamentali SEC, Discovery misura qualità della scoperta e Radar separa convinzione dal timing. La convergenza evidenzia dove i motori concordano e, soprattutto, dove non concordano. Nessun nuovo score modifica le decisioni dei motori sottostanti.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/radar" className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950">Global Radar</Link>
              <Link href="/discovery" className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950">Discovery</Link>
              <Link href="/portfolio" className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950">Paper Portfolio</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Copertura SEC", `${report.coveragePercent}%`],
            ["Società analizzate", `${report.companyCount}/${report.universeSize}`],
            ["Radar match", `${radarCoverage}/${report.companyCount}`],
            ["Discovery match", `${discoveryCoverage}/${report.companyCount}`],
            ["Copertura 3 motori", `${tripleCoverage}/${report.companyCount}`],
            ["Conferme 3 motori", String(tripleConfirmation)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Funnel istituzionale read-only</p>
              <h2 className="mt-2 text-2xl font-black">Tre motori, tre domande diverse</h2>
            </div>
            <div className="rounded-xl bg-slate-950/70 px-3 py-2 text-xs text-slate-400">LIVE: <strong className="text-rose-300">NON ABILITATO</strong></div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <EngineCard title="1 · Discovery" status="COSA STUDIARE" detail="Scoperta globale, qualità del segnale, rischio, fonte e blocker." />
            <EngineCard title="2 · Research" status="VALE LA TESI?" detail="SEC, crescita, margini, cassa, debito, FCF, completezza e rischi fondamentali." />
            <EngineCard title="3 · Radar" status="È IL MOMENTO?" detail="Convinzione, readiness, regime, rischio e qualità dati della shortlist diversificata." />
          </div>
          <p className="mt-4 text-xs leading-5 text-emerald-100/70">
            Una conferma a tre motori è soltanto una priorità di approfondimento. Non crea ordini, non modifica il PAPER OMS, non rilassa soglie e non entra nel fingerprint V6.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Dati operativi", String(operational)],
            ["Fondamentali forti", String(priority)],
            ["Speculative", String(speculative)],
            ["Score medio", `${report.averageScore}/100`],
            ["Radar regime", mission?.regime ?? "—"],
            ["Discovery conf. media", discovery ? `${discovery.averageConfidence}/100` : "—"],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-xl font-black">{value}</p>
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
              <option value="SPECULATIVA">Speculativa</option>
              <option value="SCARTA">Scarta</option>
              <option value="DATI INSUFFICIENTI">Dati insufficienti</option>
            </select>
          </div>
        </section>

        <section className="space-y-5">
          {filtered.map(({ company, radar, discovery: discoveryCandidate }) => (
            <CompanyCard key={company.ticker} company={company} radar={radar} discovery={discoveryCandidate} />
          ))}
          {!filtered.length && <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessuna società corrisponde ai filtri selezionati.</div>}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Metodo di analisi</h2>
            <div className="mt-4 space-y-3">
              {report.methodology.map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}
              <p className="rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-4 text-sm leading-6 text-cyan-100">La nuova convergenza è uno strato di lettura: non media i punteggi e non sostituisce le decisioni originali dei tre motori.</p>
            </div>
          </article>
          <article className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6">
            <h2 className="text-xl font-black">Avvisi del ciclo</h2>
            <div className="mt-4 space-y-3">
              {(allWarnings.length ? allWarnings : ["Nessun avviso critico nell’ultimo ciclo fondamentale."]).map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}
            </div>
          </article>
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">
          Fonte fondamentale primaria: SEC EDGAR Company Facts e filings annuali. Discovery e Radar mantengono le proprie fonti e guardrail. Il funnel non costituisce consulenza finanziaria e non esegue ordini.
        </footer>
      </div>
    </main>
  );
}
