import Link from "next/link";
import terminal from "@/data/terminal-intelligence.json";
import committee from "@/data/investment-committee.json";
import { decisionGroup, type CommitteeDecision } from "@/lib/ui/committee-decision-display";
import globalCoverage from "@/data/global-reference-coverage.json";
import master from "@/data/instrument-master.json";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import { getAlpacaPaperClock } from "@/lib/market/alpaca-paper-clock-runtime.mjs";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";
import { describePersistedPaperQuoteHealth } from "@/lib/trading/paper-quote-diagnostics";
import { assessDecisionEvidence } from "@/lib/ui/decision-market-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Asset = {
  symbol: string; name: string; decision: string; unifiedScore?: number;
  confidence?: number; price?: number; currency?: string; reason?: string;
  warnings?: string[]; technical?: { observedAt?: string };
};
const data = terminal as { generatedAt: string; mode: string; assets: Asset[]; capitalEuro?: number };
const committeeReport = committee as {
  generatedAt: string;
  executionGate: string;
  buyCandidateCount: number;
  allDecisions: CommitteeDecision[];
};
const catalog = globalCoverage as { coverage: { matchedInstrumentReferences: number; providerMatchedCountries: number; targetCountries: number }; generatedAt: string };
const instruments = master as { instruments: Array<{status: string; ticker?: string; currency?: string; assetClass?: string; exchangeMic?: string | null }> };
const groups = [
  { key: "CANDIDATO", heading: "Candidati all'acquisto da studiare", explain: "Solo proposte del comitato con piano; NON sono ordini.", accent: "text-emerald-300" },
  { key: "OSSERVA", heading: "Osservare · non acquistare", explain: "Un segnale tecnico ACCUMULA non supera da solo il comitato.", accent: "text-sky-300" },
  { key: "ATTENDI", heading: "Attendere · nessun ingresso", explain: "Include analisi prive di decisione finale recente.", accent: "text-amber-300" },
  { key: "EVITA", heading: "Evitare · non equivale a vendere", explain: "Per una vendita serve la verifica della posizione presso il broker.", accent: "text-rose-300" },
];

function formatMoney(value?: number, currency?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: currency || "USD" }).format(value); }
  catch { return String(value); }
}
function isCurrent(now: number, timestamp?: string) {
  const parsed = Date.parse(String(timestamp || ""));
  return Number.isFinite(parsed) && parsed <= now && now - parsed <= 36 * 3600_000;
}
// Compute request time outside the React render body to preserve render purity.
function serverRequestTime() {
  return Date.now();
}
export default async function DecisioniPage() {
  const now = serverRequestTime();
  const researchCurrent = isCurrent(now, data.generatedAt);
  const assets = [...(data.assets || [])];
  const committeeCurrent = isCurrent(now, committeeReport.generatedAt);
  const committeeBySymbol = new Map(
    (committeeReport.allDecisions || []).map((row) => [row.symbol.toUpperCase(), row] as const),
  );
  const decisionGroupBySymbol = new Map(assets.map((asset) => [
    asset.symbol,
    decisionGroup(
      committeeBySymbol.get(asset.symbol.toUpperCase()),
      committeeCurrent,
      committeeReport.executionGate,
      committeeReport.buyCandidateCount,
    ),
  ] as const));
  const studyCandidates = [...decisionGroupBySymbol.values()].filter((group) => group === "CANDIDATO").length;
  const clock = await getAlpacaPaperClock(now);
  const quoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage, now);
  const quoteHealth = describePersistedPaperQuoteHealth(executionMarket, executionCoverage, now);
  const quoteBySymbol = new Map(quoteHealth.symbols.map((row) => [row.symbol, row]));
  const venueByMic = new Map([...new Set(instruments.instruments
    .map((item) => item.exchangeMic).filter((mic): mic is string => Boolean(mic)))]
    .map((mic) => [mic, resolveVenueSession(mic, clock, now)]));
  const evidenceBySymbol = new Map(assets.map((asset) => {
    const matched = instruments.instruments.filter((item) => item.status === "active"
      && item.ticker?.toUpperCase() === asset.symbol.toUpperCase());
    const venue = matched.length === 1
      ? venueByMic.get(matched[0].exchangeMic || "") : null;
    return [asset.symbol, assessDecisionEvidence({
      symbol: asset.symbol,
      researchCurrency: asset.currency,
      researchFresh: researchCurrent,
      instruments: instruments.instruments,
      quote: quoteBySymbol.get(asset.symbol) ?? null,
      quoteSnapshotCurrent: quoteHealth.snapshotCurrent,
      quoteGateReady: quoteGate.ready,
      venue,
    })] as const;
  }));
  const reviewCandidates = [...evidenceBySymbol.values()]
    .filter((row) => row.paperReviewCandidate).length;
  const monitoredExchanges = new Set(instruments.instruments.filter(x => x.status === "active").map(x => x.exchangeMic).filter(Boolean)).size;
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Fenice · Centro decisioni</p>
            <h1 className="mt-2 text-3xl font-black">Comprare, mantenere o vendere?</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Segnali di studio generati dal motore tecnico. Nessun acquisto o vendita è autorizzato da questa pagina.
              Controlla sempre prezzi eseguibili, posizione presso il broker e rischio prima di decidere.
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-white/20 px-4 py-2 text-sm">← Oggi</Link>
        </header>
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-bold text-amber-200">{researchCurrent ? "Ricerca giornaliera disponibile · NON prezzi eseguibili" : "RICERCA SCADUTA · NON AGIRE SU QUESTI SEGNALI"}</p>
          <p className="mt-1 text-sm text-slate-300">Ultimo calcolo ricerca: {data.generatedAt} · Ultimo archivio PAPER: {quoteHealth.snapshotObservedAt ?? "non disponibile"} · Controllo quorum: {quoteGate.ready ? "superato sul campione" : "NON verificato ora"} · Ordini REALI: BLOCCATI.</p>
        </section>
        <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
          <p className="font-bold text-cyan-100">
            {committeeCurrent ? "Decisione finale: Investment Committee" : "COMITATO NON AGGIORNATO · ATTENDERE"}
          </p>
          <p className="mt-1 text-sm text-slate-200">
            Candidati all&apos;acquisto da studiare: <strong>{studyCandidates}</strong> ·
            Gate: <strong>{committeeCurrent ? committeeReport.executionGate : "DATI SCADUTI"}</strong> ·
            Ordini reali: <strong>BLOCCATI</strong>.
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Le categorie sotto seguono la decisione del comitato, non la scritta ACCUMULA del motore tecnico.
            Nessuna proposta qui autorizza da sola un ordine Directa.
          </p>
        </section>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Titoli nel motore tecnico", String(assets.length)],
            ["Candidati comitato (solo studio)", String(studyCandidates)],
            ["Nucleo censito", String(instruments.instruments.filter(x => x.status === "active").length)],
            ["Sedi di negoziazione censite", String(monitoredExchanges)],
            ["Riferimenti mondiali (NON realtime)", catalog.coverage.matchedInstrumentReferences.toLocaleString("it-IT")],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}
        </section>
        <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-slate-300">
          <p className="font-bold text-cyan-200">Verifica operativa delle analisi</p>
          <p className="mt-2">Titoli con requisiti minimi di verifica PAPER in questa schermata: <strong className="text-white">{reviewCandidates}/{assets.length}</strong>.
            Questo non equivale a titoli acquistabili: serve anche una posizione broker verificata per valutare vendite, la verifica dell&apos;ordine e l&apos;autorizzazione umana.</p>
          <p className="mt-2">La pagina usa soltanto quotazioni PAPER già archiviate e un orologio Alpaca autenticato per le sedi USA; non scarica prezzi in tempo reale. Sulle altre borse lo stato OPEN non è dimostrato.</p>
        </section>
        <section aria-label="Directa stato portafoglio in sola lettura" className="rounded-xl border border-violet-400/25 bg-violet-400/[0.04] p-4 text-sm text-slate-200">
          <h2 className="font-black text-violet-200">Directa · prima si verificano le posizioni, poi si valuta</h2>
          <p className="mt-2">
            La connessione locale read-only è predisposta, ma il server cloud NON ha una prova autenticata
            del collegamento al tuo PC o della liquidità reale. Non posso confermare né il saldo,
            né i titoli posseduti, né se un segnale EVITA corrisponda a una vendita possibile.
          </p>
          <p className="mt-2 text-xs text-amber-100">
            Collegamento broker: NON VERIFICATO · Riconciliazione reale: NON VERIFICATA ·
            Nessun codice API o conto esposto sul browser · Ordini reali: BLOCCATI.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
            <Link href="/api/broker/status" className="text-violet-200 underline">Diagnostica integrazione broker (non verifica il conto)</Link>
            <Link href="/portfolio" className="text-violet-200 underline">Vai al portafoglio modello</Link>
            <Link href="/analista" className="text-violet-200 underline">Chiedi all&apos;analista</Link>
          </div>
        </section>
        <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">
          <p className="font-bold text-white">Significato delle categorie</p>
          <p className="mt-2">Le categorie sotto derivano dal comitato finale: i segnali tecnici sono mostrati solo come contesto, non come istruzioni di trading. Il numero di strumenti disponibili nel catalogo globale non rappresenta un controllo continuo di tutti i mercati. La vendita è valutabile solo per titoli effettivamente posseduti.</p>
          <div className="mt-3 flex flex-wrap gap-3"><Link className="text-cyan-300 underline" href="/mercati">Stato borse e quotazioni</Link><Link className="text-cyan-300 underline" href="/portfolio">Portafoglio</Link><Link className="text-cyan-300 underline" href="/readiness">Sicurezza</Link><Link className="text-cyan-300 underline" href="/global">Copertura globale</Link></div>
        </div>
        {groups.map(group => {
          const rows = assets.filter(item => decisionGroupBySymbol.get(item.symbol) === group.key).sort((a,b)=>(b.unifiedScore || 0)-(a.unifiedScore || 0));
          return <section key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className={`text-xl font-black ${group.accent}`}>{group.heading} ({rows.length})</h2><p className="text-xs text-slate-400">{group.explain}</p></div>
            {rows.length === 0 ? <p className="text-sm text-slate-400">Nessun titolo in questa categoria.</p> :
              <div className="grid gap-3 md:grid-cols-2">{rows.map(asset => {
                const committeeDecision = committeeBySymbol.get(asset.symbol.toUpperCase());
                const quoteDate = asset.technical?.observedAt;
                const fresh = researchCurrent && isCurrent(now, quoteDate);
                const evidence = evidenceBySymbol.get(asset.symbol);
                return <article key={asset.symbol} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{asset.symbol}</h3><p className="text-sm text-slate-400">{asset.name}</p></div><div className="text-right"><p className="text-lg font-bold">{formatMoney(asset.price,asset.currency)}</p><p className="text-xs text-slate-400">Prezzo campionato</p></div></div>
                  <div className="mt-3 rounded-lg border border-cyan-500/20 bg-slate-900 p-3 text-sm">
                    <p className="font-bold text-cyan-200">
                      {committeeCurrent && committeeDecision ? `Comitato: ${committeeDecision.decision}` : "Comitato: NON VERIFICATO · ATTENDI"}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      Tecnico: {asset.decision} · Score comitato: {committeeCurrent ? committeeDecision?.committeeScore ?? "—" : "—"} ·
                      {decisionGroupBySymbol.get(asset.symbol) === "CANDIDATO" ? " Solo proposta di studio; esecuzione LIVE vietata." : " Nessun ordine proposto."}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs"><span>Punteggio tecnico: {asset.unifiedScore ?? "—"}/100</span><span>Confidenza modello: {asset.confidence ?? "—"}%</span><span className={fresh ? "text-amber-300" : "text-rose-300"}>{fresh ? "Dati giornalieri, non eseguibili" : "Prezzo non verificato recente"}</span></div>
                  <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-xs">
                    <p className="font-bold text-white">{evidence?.paperReviewCandidate ? "PAPER: verifiche informative presenti" : "NESSUN INGRESSO OPERATIVO VERIFICATO"}</p>
                    <p className="mt-1 text-slate-300">{evidence?.marketStatus ?? "Borsa non verificata"}</p>
                    <p className="mt-1 text-slate-300">{evidence?.priceStatus ?? "Prezzi non verificati"}</p>
                    <p className="mt-1 text-slate-500">Sede: {evidence?.exchangeMic ?? "non disponibile"} · Portafoglio reale: non verificato · Ordini: bloccati</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{asset.reason || "Motivazione non disponibile."}</p>
                  {!!asset.warnings?.length && <p className="mt-2 text-xs text-amber-200">Avvertenza: {asset.warnings[0]}</p>}
                  <p className="mt-2 text-xs text-slate-500">Osservazione: {quoteDate || "non disponibile"} · Nessun ordine consentito.</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
                    <Link href={`/analista?symbol=${encodeURIComponent(asset.symbol)}`} className="text-cyan-300 underline">
                      Perché questa decisione? Analizza {asset.symbol} con Fenice IA →
                    </Link>
                    <Link href="/mercati" className="text-slate-300 underline">Verifica copertura dati</Link>
                  </div>
                </article>;
              })}</div>}
          </section>;
        })}
        <footer className="text-xs text-slate-500">La schermata non costituisce consulenza personalizzata. La dimensione del portafoglio modello non è il saldo del conto broker. Il sistema non dispone qui di conferma delle tue posizioni reali o di prezzi negoziabili aggiornati.</footer>
      </div>
    </main>
  );
}
