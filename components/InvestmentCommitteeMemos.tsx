"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FundamentalCompany, FundamentalResearchReport } from "@/lib/research";
import type { DiscoveryCandidate, DiscoveryReport } from "@/lib/discovery-engine";
import type { MissionControl, RankedAsset } from "@/lib/mission";
import type { DcfCompany, DcfReport } from "@/lib/dcf";
import type { EventIntelligenceReport, IntelligenceEvent } from "@/lib/event-intelligence";

type ReviewState = "PRONTO PER REVISIONE" | "REVISIONE CAUTA" | "DA COMPLETARE";

type MemoRow = {
  company: FundamentalCompany;
  discovery?: DiscoveryCandidate;
  radar?: RankedAsset;
  dcf?: DcfCompany;
  events: IntelligenceEvent[];
  state: ReviewState;
  support: string[];
  falsifiers: string[];
  missingEvidence: string[];
  promotionGates: string[];
  nextReviewTriggers: string[];
};

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function unique(items: Array<string | undefined | null>) {
  return [...new Set(items.filter((item): item is string => Boolean(item && item.trim())))];
}

function stateClass(state: ReviewState) {
  if (state === "PRONTO PER REVISIONE") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (state === "REVISIONE CAUTA") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function money(value?: number, currency?: string) {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(value))}${currency ? ` ${currency}` : ""}`;
}

function percent(value?: number) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Number(value))}%` : "—";
}

function buildMemo(
  company: FundamentalCompany,
  discovery?: DiscoveryCandidate,
  radar?: RankedAsset,
  dcf?: DcfCompany,
  events: IntelligenceEvent[] = [],
): MemoRow {
  const strongFundamental = company.decision === "PRIORITÀ" || company.decision === "APPROFONDISCI";
  const discoveryClean = Boolean(discovery && discovery.blockers.length === 0 && discovery.status !== "SCARTARE");
  const radarUsable = Boolean(radar && radar.confidenceBand !== "BASSA" && radar.riskBand !== "ESTREMO");
  const dcfUsable = dcf?.status === "disponibile";
  const verifiedEvent = events.some((event) => event.confidence >= 60 && (event.priority === "CRITICA" || event.priority === "ALTA"));
  const completed = [strongFundamental, discoveryClean, radarUsable, dcfUsable, verifiedEvent].filter(Boolean).length;

  const state: ReviewState = completed >= 4 && strongFundamental
    ? "PRONTO PER REVISIONE"
    : completed >= 2
      ? "REVISIONE CAUTA"
      : "DA COMPLETARE";

  const support = unique([
    ...company.thesis,
    discovery?.thesis,
    ...(dcf?.status === "disponibile"
      ? [`DCF base ${money(dcf.fairValueBase, dcf.currency)} vs prezzo ${money(dcf.currentPrice, dcf.currency)} (${percent(dcf.upsideBasePercent)}).`]
      : []),
    ...(radar ? [`Radar ${radar.action}: convinzione ${radar.conviction}/100, readiness ${radar.entryReadiness}/100.`] : []),
    ...events.slice(0, 2).map((event) => `Catalizzatore ${event.priority.toLowerCase()}: ${event.title} (${event.impact.toLowerCase()}, confidenza ${event.confidence}/100).`),
  ]).slice(0, 10);

  const falsifiers = unique([
    ...company.risks,
    ...(discovery?.blockers ?? []),
    ...(dcf?.warnings ?? []),
    ...(radar?.action === "EVITA" ? ["Radar corrente classifica il titolo come EVITA."] : []),
    ...(radar?.action === "ATTENDI" ? ["Il timing non è ancora confermato: Radar è ATTENDI."] : []),
    ...(radar?.riskBand === "ALTO" || radar?.riskBand === "ESTREMO" ? [`Rischio Radar ${radar.riskBand.toLowerCase()}.`] : []),
    ...events.filter((event) => event.impact === "NEGATIVO").slice(0, 3).map((event) => `Evento negativo: ${event.title}.`),
  ]).slice(0, 12);

  const missingEvidence = unique([
    ...(!strongFundamental ? [`Research non ha promosso il caso: decisione attuale ${company.decision}.`] : []),
    ...(!discovery ? ["Nessun candidato Discovery collegato al ticker nel ciclo corrente."] : []),
    ...(discovery && discovery.blockers.length ? discovery.blockers.map((blocker) => `Discovery: ${blocker}`) : []),
    ...(!radar ? ["Titolo assente dalla shortlist Radar corrente."] : []),
    ...(!dcf ? ["Nessun profilo DCF disponibile."] : []),
    ...(dcf && dcf.status !== "disponibile" ? [`DCF ${dcf.status}: fair value non utilizzabile.`] : []),
    ...(!events.length ? ["Nessun catalizzatore strutturato collegato al ticker."] : []),
    ...events.flatMap((event) => event.requiredChecks.map((check) => `Evento ${event.title}: ${check}`)).slice(0, 4),
  ]).slice(0, 12);

  const promotionGates = unique([
    ...(!strongFundamental ? ["Portare Research almeno ad APPROFONDISCI con dati SEC completi."] : []),
    ...(!discoveryClean ? ["Chiudere tutti i blocker Discovery prima di aumentare la priorità."] : []),
    ...(!dcfUsable ? ["Rendere la valutazione confrontabile oppure documentare perché il DCF non è applicabile."] : []),
    ...(!radarUsable ? ["Ottenere un profilo Radar con confidenza almeno MEDIA e rischio non ESTREMO."] : []),
    ...(radar && radar.action !== "ACCUMULA" ? ["Non promuovere il timing finché Radar non conferma ACCUMULA secondo le proprie regole."] : []),
    ...(!verifiedEvent ? ["Verificare almeno un catalizzatore materiale con confidenza >=60 oppure documentare l'assenza di catalizzatori."] : []),
    "Revisione umana obbligatoria: il memo non autorizza ordini PAPER o LIVE.",
  ]);

  const nextReviewTriggers = unique([
    ...(company.filing?.filedAt ? [`Nuovo filing SEC successivo al ${company.filing.filedAt}.`] : ["Nuovo filing SEC o risultati societari."]),
    ...(events.length ? events.slice(0, 3).map((event) => `Aggiornamento catalizzatore: ${event.title}.`) : []),
    ...(radar ? [`Cambio azione Radar da ${radar.action} o variazione materiale della readiness (${radar.entryReadiness}/100).`] : ["Ingresso del titolo nella shortlist Radar."]),
    ...(dcf?.status === "disponibile" ? ["Scostamento rilevante tra prezzo e range DCF o revisione di FCF/costo del capitale."] : ["DCF che passa a stato disponibile/confrontabile."]),
    ...(discovery ? [`Cambio stato Discovery da ${discovery.status} o rimozione dei blocker.`] : ["Comparsa di un candidato Discovery verificato."]),
  ]).slice(0, 10);

  return { company, discovery, radar, dcf, events, state, support, falsifiers, missingEvidence, promotionGates, nextReviewTriggers };
}

function ListBlock({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "emerald" | "rose" | "amber" | "cyan" | "slate" }) {
  const tones = {
    emerald: "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-100",
    rose: "border-rose-400/15 bg-rose-400/[0.05] text-rose-100",
    amber: "border-amber-300/15 bg-amber-300/[0.05] text-amber-100",
    cyan: "border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-100",
    slate: "border-white/10 bg-white/[0.03] text-slate-300",
  };
  return (
    <section className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <h3 className="text-xs font-black uppercase tracking-[0.16em]">{title}</h3>
      <div className="mt-3 space-y-2 text-sm leading-6">
        {(items.length ? items : ["Nessun elemento strutturato disponibile."]).map((item) => <p key={item}>• {item}</p>)}
      </div>
    </section>
  );
}

export default function InvestmentCommitteeMemos() {
  const [research, setResearch] = useState<FundamentalResearchReport | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryReport | null>(null);
  const [mission, setMission] = useState<MissionControl | null>(null);
  const [dcf, setDcf] = useState<DcfReport | null>(null);
  const [events, setEvents] = useState<EventIntelligenceReport | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("TUTTI");

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
      const localWarnings: string[] = [];
      const [r, d, m, v, e] = results;
      if (r.status === "fulfilled") { setResearch(r.value); setError(""); } else setError(errorMessage(r.reason));
      if (d.status === "fulfilled") setDiscovery(d.value); else { setDiscovery(null); localWarnings.push(`Discovery: ${errorMessage(d.reason)}`); }
      if (m.status === "fulfilled") setMission(m.value); else { setMission(null); localWarnings.push(`Radar: ${errorMessage(m.reason)}`); }
      if (v.status === "fulfilled") setDcf(v.value); else { setDcf(null); localWarnings.push(`DCF: ${errorMessage(v.reason)}`); }
      if (e.status === "fulfilled") setEvents(e.value); else { setEvents(null); localWarnings.push(`Event Intelligence: ${errorMessage(e.reason)}`); }
      setWarnings(localWarnings);
    }
    void load();
    const timer = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const discoveryBySymbol = useMemo(() => {
    const map = new Map<string, DiscoveryCandidate>();
    for (const candidate of discovery?.candidates ?? []) {
      const symbol = candidate.symbol.toUpperCase();
      const current = map.get(symbol);
      if (!current || candidate.priorityScore > current.priorityScore) map.set(symbol, candidate);
    }
    return map;
  }, [discovery]);

  const radarBySymbol = useMemo(() => new Map((mission?.rankedAssets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset])), [mission]);
  const dcfBySymbol = useMemo(() => new Map((dcf?.companies ?? []).map((company) => [company.symbol.toUpperCase(), company])), [dcf]);
  const eventsBySymbol = useMemo(() => {
    const map = new Map<string, IntelligenceEvent[]>();
    for (const event of events?.events ?? []) {
      if (!event.symbol) continue;
      const symbol = event.symbol.toUpperCase();
      map.set(symbol, [...(map.get(symbol) ?? []), event].sort((a, b) => b.relevance - a.relevance));
    }
    return map;
  }, [events]);

  const rows = useMemo(() => (research?.companies ?? []).map((company) => {
    const symbol = company.ticker.toUpperCase();
    return buildMemo(company, discoveryBySymbol.get(symbol), radarBySymbol.get(symbol), dcfBySymbol.get(symbol), eventsBySymbol.get(symbol) ?? []);
  }), [research, discoveryBySymbol, radarBySymbol, dcfBySymbol, eventsBySymbol]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rank: Record<ReviewState, number> = { "PRONTO PER REVISIONE": 3, "REVISIONE CAUTA": 2, "DA COMPLETARE": 1 };
    return rows
      .filter((row) => (!normalized || `${row.company.ticker} ${row.company.name} ${row.company.sector}`.toLowerCase().includes(normalized)) && (stateFilter === "TUTTI" || row.state === stateFilter))
      .sort((a, b) => rank[b.state] - rank[a.state] || b.company.scores.overall - a.company.scores.overall);
  }, [rows, query, stateFilter]);

  if (!research && !error) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta costruendo i memo del comitato…</main>;
  if (!research) return <main className="min-h-screen bg-slate-950 p-8 text-white">Errore Investment Committee Memo: {error}</main>;

  const ready = rows.filter((row) => row.state === "PRONTO PER REVISIONE").length;
  const cautious = rows.filter((row) => row.state === "REVISIONE CAUTA").length;
  const dcfAvailable = rows.filter((row) => row.dcf?.status === "disponibile").length;
  const eventCovered = rows.filter((row) => row.events.length > 0).length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-300">Fenice V7 · Investment Committee Memo</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Tesi, falsificatori e condizioni di promozione</h1>
          <p className="mt-4 max-w-4xl leading-7 text-slate-300">Il memo forza una lettura anti-bias: non basta elencare perché un titolo piace. Fenice deve mostrare anche cosa può smentire la tesi, quali prove mancano e cosa deve accadere prima della prossima revisione. Nessun memo autorizza ordini.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dossier" className="rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">Dossier 5 livelli</Link>
            <Link href="/research" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Research</Link>
            <Link href="/readiness" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm font-black text-rose-200">Sicurezza V6</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Memo", rows.length],
            ["Pronti per revisione", ready],
            ["Revisione cauta", cautious],
            ["DCF disponibile", dcfAvailable],
            ["Catalizzatori collegati", eventCovered],
          ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>)}
        </section>

        <section className="rounded-2xl border border-indigo-400/15 bg-indigo-400/[0.04] p-5 text-sm leading-6 text-indigo-100">
          <strong>Regola di governance:</strong> “PRONTO PER REVISIONE” significa soltanto che il caso ha abbastanza materiale per essere discusso. Non è BUY, non entra nell’OMS, non modifica PAPER V6 e non sblocca LIVE.
        </section>

        {warnings.length ? <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5">{warnings.map((warning) => <p key={warning} className="text-sm text-amber-100">• {warning}</p>)}</section> : null}

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:grid-cols-[1fr_260px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ticker, azienda o settore" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" />
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400">
            <option value="TUTTI">Tutti i memo</option>
            <option value="PRONTO PER REVISIONE">Pronti per revisione</option>
            <option value="REVISIONE CAUTA">Revisione cauta</option>
            <option value="DA COMPLETARE">Da completare</option>
          </select>
        </section>

        <section className="space-y-5">
          {filtered.map((row) => (
            <article key={row.company.ticker} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black text-indigo-200">{row.company.ticker}</h2><span className={`rounded-full border px-3 py-1 text-[11px] font-black ${stateClass(row.state)}`}>{row.state}</span></div>
                  <p className="mt-1 font-bold">{row.company.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{row.company.sector} · Research {row.company.decision} · score {row.company.scores.overall}/100</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <span className="rounded-lg bg-slate-900 px-3 py-2">Discovery {row.discovery?.status ?? "—"}</span>
                  <span className="rounded-lg bg-slate-900 px-3 py-2">Radar {row.radar?.action ?? "—"}</span>
                  <span className="rounded-lg bg-slate-900 px-3 py-2">DCF {row.dcf?.status ?? "—"}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ListBlock title="Evidenza a favore" items={row.support} tone="emerald" />
                <ListBlock title="Cosa può smentire la tesi" items={row.falsifiers} tone="rose" />
                <ListBlock title="Prove mancanti / non chiuse" items={row.missingEvidence} tone="amber" />
                <ListBlock title="Gate prima di una promozione" items={row.promotionGates} tone="cyan" />
              </div>

              <div className="mt-4"><ListBlock title="Trigger della prossima revisione" items={row.nextReviewTriggers} /></div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                {row.dcf?.status === "disponibile" ? <span>DCF base: <strong className="text-white">{money(row.dcf.fairValueBase, row.dcf.currency)}</strong> · upside {percent(row.dcf.upsideBasePercent)}</span> : <span>DCF non utilizzabile nel ciclo corrente</span>}
                {row.events.length ? <span>· {row.events.length} evento/i collegato/i</span> : <span>· nessun evento collegato</span>}
              </div>
            </article>
          ))}
          {!filtered.length ? <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessun memo corrisponde ai filtri.</div> : null}
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">Strato read-only di governance della ricerca. Nessun collegamento broker, nessun ordine automatico, nessuna modifica alle soglie PAPER V6 o al fingerprint certificante.</footer>
      </div>
    </main>
  );
}
