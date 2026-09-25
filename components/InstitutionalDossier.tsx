"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DcfCompany, DcfReport } from "@/lib/dcf";
import type { DiscoveryCandidate, DiscoveryReport } from "@/lib/discovery-engine";
import type { EventIntelligenceReport, IntelligenceEvent } from "@/lib/event-intelligence";
import type { MissionControl, RankedAsset } from "@/lib/mission";
import type { FundamentalCompany, FundamentalResearchReport } from "@/lib/research";

type DossierRow = {
  company: FundamentalCompany;
  discovery?: DiscoveryCandidate;
  radar?: RankedAsset;
  dcf?: DcfCompany;
  events: IntelligenceEvent[];
  layers: number;
  label: "DOSSIER COMPLETO" | "QUASI COMPLETO" | "TESI + VALUTAZIONE" | "RICERCA PARZIALE";
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function scoreClass(value?: number) {
  if (!Number.isFinite(value)) return "text-slate-500";
  if (Number(value) >= 70) return "text-emerald-300";
  if (Number(value) >= 50) return "text-amber-300";
  return "text-rose-300";
}

function percent(value?: number) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Number(value))}%` : "—";
}

function money(value?: number, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

function labelFor(layers: number, hasDcf: boolean, hasEvents: boolean): DossierRow["label"] {
  if (layers >= 5) return "DOSSIER COMPLETO";
  if (layers === 4) return "QUASI COMPLETO";
  if (hasDcf && layers >= 3) return "TESI + VALUTAZIONE";
  if (hasEvents && layers >= 3) return "QUASI COMPLETO";
  return "RICERCA PARZIALE";
}

function LayerCard({ title, value, status, detail }: { title: string; value?: number; status: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`text-2xl font-black ${scoreClass(value)}`}>{Number.isFinite(value) ? `${Math.round(Number(value))}/100` : "—"}</p>
        <span className="text-right text-[11px] font-black uppercase text-slate-300">{status}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function DossierCard({ row }: { row: DossierRow }) {
  const { company, discovery, radar, dcf, events } = row;
  const topEvent = events[0];
  const dcfCurrency = dcf?.currency ?? company.financials.currency ?? "USD";
  const eventStatus = topEvent ? `${topEvent.priority} · ${topEvent.impact}` : "NESSUN EVENTO";

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black text-amber-300">{company.ticker}</span>
            <span className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-[11px] font-black text-slate-300">{company.decision}</span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-black text-cyan-200">{row.label}</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-black text-slate-400">{row.layers}/5 livelli</span>
          </div>
          <h2 className="mt-2 text-xl font-black text-white">{company.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{company.sector} · dati fondamentali {company.scores.dataCompleteness}/100</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3 text-xs leading-5 text-emerald-100">
          Read-only. Nessun livello del dossier crea ordini o modifica PAPER V6.
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <LayerCard
          title="1 · Fondamentali SEC"
          value={company.scores.overall}
          status={company.decision}
          detail={`Qualità ${company.scores.quality}/100 · completezza ${company.scores.dataCompleteness}/100`}
        />
        <LayerCard
          title="2 · Discovery"
          value={discovery?.priorityScore}
          status={discovery?.status ?? "NON PRESENTE"}
          detail={discovery ? `Conf. ${discovery.confidenceScore}/100 · rischio ${discovery.riskScore}/100 · ${discovery.source}` : "Nessun candidato Discovery collegato nel ciclo corrente."}
        />
        <LayerCard
          title="3 · Radar / timing"
          value={radar?.conviction}
          status={radar?.action ?? "FUORI SHORTLIST"}
          detail={radar ? `Readiness ${radar.entryReadiness}/100 · rischio ${radar.riskBand} · conf. ${radar.confidenceBand}` : "Il titolo non compare nella shortlist Radar corrente."}
        />
        <LayerCard
          title="4 · DCF / valuation"
          value={dcf?.confidence}
          status={dcf?.status ?? "NON DISPONIBILE"}
          detail={dcf?.status === "disponibile" ? `Fair value base ${money(dcf.fairValueBase, dcfCurrency)} · upside ${percent(dcf.upsideBasePercent)}` : (dcf?.rationale[0] ?? "Nessuna valutazione DCF collegata.")}
        />
        <LayerCard
          title="5 · Catalizzatori"
          value={topEvent?.confidence}
          status={eventStatus}
          detail={topEvent ? `${topEvent.title} · rilevanza ${topEvent.relevance}/100 · ${topEvent.source}` : "Nessun catalizzatore strutturato collegato al ticker."}
        />
      </div>

      {dcf?.status === "disponibile" ? (
        <div className="mt-4 rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Valuation range</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div><p className="text-[11px] text-slate-500">Prezzo</p><p className="font-black">{money(dcf.currentPrice, dcfCurrency)}</p></div>
            <div><p className="text-[11px] text-slate-500">Prudente</p><p className="font-black">{money(dcf.fairValueLow, dcfCurrency)}</p></div>
            <div><p className="text-[11px] text-slate-500">Base</p><p className="font-black">{money(dcf.fairValueBase, dcfCurrency)}</p></div>
            <div><p className="text-[11px] text-slate-500">Espansivo</p><p className="font-black">{money(dcf.fairValueHigh, dcfCurrency)}</p></div>
          </div>
          {dcf.warnings.length ? <p className="mt-3 text-xs leading-5 text-violet-100/70">{dcf.warnings[0]}</p> : null}
        </div>
      ) : null}

      {events.length ? (
        <div className="mt-4 rounded-2xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-300">Catalyst & event review</p>
          <div className="mt-3 space-y-3">
            {events.slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-xl bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{event.title}</p>
                  <span className="text-[11px] font-black text-fuchsia-200">{event.priority} · {event.impact}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{event.summary}</p>
                {event.requiredChecks.length ? <p className="mt-2 text-[11px] leading-5 text-amber-100/80">Check: {event.requiredChecks[0]}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-emerald-400/[0.04] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Tesi fondamentale</p>
          <div className="mt-3 space-y-2">{company.thesis.slice(0, 3).map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}</div>
        </div>
        <div className="rounded-2xl bg-rose-400/[0.04] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-rose-300">Rischi / blocker</p>
          <div className="mt-3 space-y-2">
            {company.risks.slice(0, 2).map((item) => <p key={item} className="text-sm leading-6 text-slate-300">• {item}</p>)}
            {discovery?.blockers.slice(0, 2).map((item) => <p key={item} className="text-sm leading-6 text-rose-100">• Discovery: {item}</p>)}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function InstitutionalDossier() {
  const [research, setResearch] = useState<FundamentalResearchReport | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryReport | null>(null);
  const [mission, setMission] = useState<MissionControl | null>(null);
  const [dcf, setDcf] = useState<DcfReport | null>(null);
  const [events, setEvents] = useState<EventIntelligenceReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("TUTTI");

  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.allSettled([
        fetchJson<FundamentalResearchReport>("/api/research"),
        fetchJson<DiscoveryReport>("/api/discovery"),
        fetchJson<MissionControl>("/api/mission"),
        fetchJson<DcfReport>("/api/dcf"),
        fetchJson<EventIntelligenceReport>("/api/events"),
      ]);
      if (!active) return;
      const [researchResult, discoveryResult, missionResult, dcfResult, eventsResult] = results;
      const supportWarnings: string[] = [];

      if (researchResult.status === "fulfilled") {
        setResearch(researchResult.value);
        setError("");
      } else {
        setError(errorMessage(researchResult.reason));
      }
      if (discoveryResult.status === "fulfilled") setDiscovery(discoveryResult.value);
      else supportWarnings.push(`Discovery: ${errorMessage(discoveryResult.reason)}`);
      if (missionResult.status === "fulfilled") setMission(missionResult.value);
      else supportWarnings.push(`Radar/Mission: ${errorMessage(missionResult.reason)}`);
      if (dcfResult.status === "fulfilled") setDcf(dcfResult.value);
      else supportWarnings.push(`DCF: ${errorMessage(dcfResult.reason)}`);
      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
      else supportWarnings.push(`Event Intelligence: ${errorMessage(eventsResult.reason)}`);
      setWarnings(supportWarnings);
    }

    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const rows = useMemo<DossierRow[]>(() => {
    if (!research) return [];
    const discoveryMap = new Map<string, DiscoveryCandidate>();
    for (const candidate of discovery?.candidates ?? []) {
      const symbol = candidate.symbol.toUpperCase();
      const current = discoveryMap.get(symbol);
      if (!current || candidate.priorityScore > current.priorityScore) discoveryMap.set(symbol, candidate);
    }
    const radarMap = new Map((mission?.rankedAssets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]));
    const dcfMap = new Map((dcf?.companies ?? []).map((company) => [company.symbol.toUpperCase(), company]));
    const eventMap = new Map<string, IntelligenceEvent[]>();
    for (const event of events?.events ?? []) {
      if (!event.symbol) continue;
      const symbol = event.symbol.toUpperCase();
      const bucket = eventMap.get(symbol) ?? [];
      bucket.push(event);
      eventMap.set(symbol, bucket);
    }

    return research.companies.map((company) => {
      const symbol = company.ticker.toUpperCase();
      const discoveryCandidate = discoveryMap.get(symbol);
      const radar = radarMap.get(symbol);
      const valuation = dcfMap.get(symbol);
      const linkedEvents = (eventMap.get(symbol) ?? []).sort((a, b) => b.relevance - a.relevance || b.confidence - a.confidence);
      const layers = 1 + Number(Boolean(discoveryCandidate)) + Number(Boolean(radar)) + Number(valuation?.status === "disponibile") + Number(linkedEvents.length > 0);
      return {
        company,
        discovery: discoveryCandidate,
        radar,
        dcf: valuation,
        events: linkedEvents,
        layers,
        label: labelFor(layers, valuation?.status === "disponibile", linkedEvents.length > 0),
      };
    }).sort((a, b) => b.layers - a.layers || b.company.scores.overall - a.company.scores.overall);
  }, [research, discovery, mission, dcf, events]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const queryMatch = !normalized || `${row.company.ticker} ${row.company.name} ${row.company.sector}`.toLowerCase().includes(normalized);
      const coverageMatch = coverageFilter === "TUTTI" || (coverageFilter === "5" ? row.layers === 5 : coverageFilter === "4+" ? row.layers >= 4 : row.layers <= 3);
      return queryMatch && coverageMatch;
    });
  }, [rows, query, coverageFilter]);

  if (!research && !error) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta costruendo il dossier istituzionale…</main>;
  if (!research) return <main className="min-h-screen bg-slate-950 p-8 text-white">Dossier non disponibile: {error}</main>;

  const full = rows.filter((row) => row.layers === 5).length;
  const fourPlus = rows.filter((row) => row.layers >= 4).length;
  const dcfAvailable = rows.filter((row) => row.dcf?.status === "disponibile").length;
  const withEvents = rows.filter((row) => row.events.length > 0).length;
  const averageLayers = rows.length ? rows.reduce((sum, row) => sum + row.layers, 0) / rows.length : 0;
  const allWarnings = [...new Set([...(research.warnings ?? []), ...(dcf?.warnings ?? []), ...(events?.warnings ?? []), ...warnings])].slice(0, 12);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Fenice V7 · Institutional Dossier</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Una tesi, cinque verifiche indipendenti</h1>
              <p className="mt-4 max-w-5xl leading-7 text-slate-300">
                Il dossier riunisce SEC fundamentals, Discovery, Radar/timing, DCF e catalizzatori. Non media i punteggi, non crea un segnale sintetico e non invia ordini: serve a vedere convergenze, buchi informativi e rischi prima di qualsiasi decisione.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/research" className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950">Research</Link>
              <Link href="/events" className="rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-black text-slate-950">Eventi</Link>
              <Link href="/radar" className="rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950">Radar</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Società", rows.length],
            ["Dossier 5/5", full],
            ["Copertura ≥4/5", fourPlus],
            ["DCF disponibili", dcfAvailable],
            ["Con catalizzatori", withEvents],
            ["Livelli medi", averageLayers.toFixed(1)],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-5">
            <LayerCard title="1 · SEC" status="TESI" detail="Qualità economica, crescita, cash flow, debito e completezza del filing." />
            <LayerCard title="2 · Discovery" status="SCOPERTA" detail="Perché il titolo è emerso, qualità della fonte, rischio e blocker." />
            <LayerCard title="3 · Radar" status="TIMING" detail="Convinzione, readiness, regime e rischio corrente." />
            <LayerCard title="4 · DCF" status="VALUTAZIONE" detail="Range prudente/base/espansivo con controlli qualità obbligatori." />
            <LayerCard title="5 · Eventi" status="CATALIZZATORI" detail="Eventi, priorità, impatto, confidenza e controlli richiesti." />
          </div>
          <p className="mt-4 text-xs leading-5 text-emerald-100/70">La presenza di 5/5 livelli indica completezza del dossier, non autorizzazione a comprare. LIVE e broker-write restano fuori da questo strato.</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ticker, azienda o settore" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" />
            <select value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400">
              <option value="TUTTI">Tutta la copertura</option>
              <option value="5">Solo dossier 5/5</option>
              <option value="4+">Almeno 4/5</option>
              <option value="3-">Massimo 3/5</option>
            </select>
          </div>
        </section>

        <section className="space-y-5">
          {filtered.map((row) => <DossierCard key={row.company.ticker} row={row} />)}
          {!filtered.length ? <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessun dossier corrisponde ai filtri selezionati.</div> : null}
        </section>

        <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6">
          <h2 className="text-xl font-black">Avvisi e limiti del ciclo</h2>
          <div className="mt-4 space-y-3">
            {(allWarnings.length ? allWarnings : ["Nessun avviso critico pubblicato dai motori collegati."]).map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-amber-100">{item}</p>)}
          </div>
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">Dossier read-only. Le decisioni originali dei motori restano separate; nessun punteggio del dossier modifica OMS, rischio, quorum, PAPER V6 o LIVE lock.</footer>
      </div>
    </main>
  );
}
