import Link from "next/link";
import committee from "@/data/investment-committee.json";
import master from "@/data/instrument-master.json";
import terminal from "@/data/terminal-intelligence.json";
import reference from "@/data/global-reference-coverage.json";
import universe from "@/data/global-market-universe.json";
import {evaluateGlobalOpportunityAudit} from "@/lib/ui/global-opportunity-audit";
import fundamentals from "@/data/fundamental-research.json";
import {buildInternationalResearchQueue} from "@/lib/ui/international-research-queue";
import globalSeeds from "@/data/world-paper-v7-research-seeds.json";
import worldEod from "@/data/world-v7-eod-research.json";
import worldLedger from "@/data/world-v7-validation-ledger.json";
import {auditOneGlobalCommitteeWorldCoverage} from "@/lib/intelligence/one-global-committee-world-coverage.mjs";
import forwardResearch from "@/data/one-global-forward-research-ledger.json";
import {buildOneGlobalPublicTacticalView} from "@/lib/ui/one-global-world-radar.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
function serverRequestTime(){return Date.now()}

/**
 * Fetch current GitHub main snapshots SERVER-SIDE, never broker endpoints.
 * A response is accepted only after the research-only radar policy and the
 * forward ledger's SHA256 hash chain validate. If the site was last deployed
 * before the latest World Terminal run, source labels distinguish embedded
 * snapshots from current main. Never emit the source OHLC/close in HTML.
 */
async function readLatestWorldTacticalEvidence(){
  const nowIso=new Date(serverRequestTime()).toISOString();
  try {
    const files=["terminal-intelligence.json","one-global-forward-research-ledger.json"];
    const payloads=await Promise.all(files.map(async name=>{
      const url="https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/"+name;
      const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(3500)});
      if(!response.ok)throw Error("WORLD_RADAR_SOURCE_HTTP_"+response.status);
      const declared=Number(response.headers.get("content-length"));
      if(Number.isFinite(declared)&&declared>3_000_000)throw Error("WORLD_RADAR_SOURCE_TOO_LARGE");
      const raw=await response.text();
      if(raw.length>3_000_000)throw Error("WORLD_RADAR_SOURCE_TOO_LARGE");
      return JSON.parse(raw) as unknown;
    }));
    const radar=buildOneGlobalPublicTacticalView({
      terminal:payloads[0],ledger:payloads[1],nowIso,
    });
    return {radar,source:"Ultimo GitHub main (verificato)"};
  }catch {
    try{
      const radar=buildOneGlobalPublicTacticalView({
        terminal,ledger:forwardResearch,nowIso,
      });
      return {radar,source:"Snapshot incluso nel sito; aggiornamento GitHub non raggiungibile"};
    }catch{return {radar:null,source:"Dati non verificabili: radar sospeso"};}
  }
}
export default async function GlobalOpportunitiesPage(){
  const latest=await readLatestWorldTacticalEvidence();
  const radar=latest.radar;
  const report=evaluateGlobalOpportunityAudit(committee,master,terminal,reference,universe,serverRequestTime());
  const q=report.dataQuality;
  const international=buildInternationalResearchQueue(master,fundamentals,terminal,committee,reference,serverRequestTime());
  const committeeWorld=auditOneGlobalCommitteeWorldCoverage({
    master,seeds:globalSeeds,committee,terminal,fundamentals,
    eod:worldEod,world:worldLedger,nowIso:new Date(serverRequestTime()).toISOString(),
  });
  const researchGapLabels:Record<string,string>={
    VERIFY_EXACT_TICKER_MIC_ISIN_CURRENCY:"Verificare identità del titolo e Borsa",
    FIND_PRIMARY_ISSUER_FINANCIALS:"Reperire bilanci e documenti ufficiali",
    VERIFY_DAILY_PRICE_SERIES_AND_SYMBOL:"Verificare prezzi giornalieri e simbolo",
    BUILD_EXACT_LISTING_COMMITTEE_RESEARCH:"Inserire la Borsa nel comitato di ricerca",
    VERIFY_INDEPENDENT_REALTIME_QUOTE_RIGHTS:"Verificare due fonti autorizzate",
    VERIFY_EXACT_VENUE_OPEN_SESSION:"Verificare la sessione della Borsa",
    VERIFY_EXECUTABLE_FX_TO_EUR:"Verificare cambio valuta in euro",
    SEPARATE_FORWARD_STRATEGY_PAPER_APPROVAL:"Autorizzazione PAPER separata ancora mancante",
  };
  return <main className="min-h-screen bg-slate-950 px-4 py-8 pb-28 text-slate-100 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-3">
        <Link className="text-sm font-bold text-cyan-300 hover:underline" href="/global">← Mondo</Link>
        <p className="text-xs font-black uppercase tracking-widest text-cyan-300">FENICE100K · Audit opportunità mondiale</p>
        <h1 className="text-3xl font-black">Dove cercare opportunità — con evidenze</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">
          Classifica di <strong>priorità di analisi</strong> del comitato attuale, NON classifica di rendimento mondiale:
          i cataloghi esteri non contengono ancora analisi, prezzi e spread verificati per singolo titolo.
          Una società europea quotata come ADR USA viene associata al suo effettivo mercato di negoziazione.
        </p>
        <Link className="text-xs font-semibold text-cyan-300 underline" href="/api/research/global-opportunities">Diagnostica JSON delle evidenze</Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Titoli analizzati",report.summary.reviewedInCommittee],
          ["Ricerche da esaminare",report.summary.rankedResearchReviews],
          ["Identità mercato note",report.summary.instrumentIdentitiesVerified],
          ["Acquisti autorizzati",report.summary.tradeReady]
        ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p>
        </div>)}
      </section>
      <section className="space-y-4 rounded-2xl border border-emerald-300/25 bg-slate-900 p-5" aria-label="Radar mondiale opportunità tecniche di ricerca">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Radar ONE GLOBAL · opportunità da studiare</p>
            <h2 className="mt-2 text-xl font-black">Titoli da osservare a breve — tutte le Borse</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Segnali tecnici osservati su candele giornaliere già raccolte. Il punteggio misura
              una <strong>priorità di ricerca</strong>, non la probabilità di guadagno né un ordine COMPRA.
              Nessun mercato, incluso quello USA, riceve una priorità automatica.
            </p>
          </div>
          <span className="rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-bold text-amber-200">Ricerca · nessun acquisto autorizzato</span>
        </div>
        <p className="text-xs text-slate-400" aria-label="Fonte e data del radar">
          Fonte: {latest.source}. Snapshot mondiale: {radar?.terminalAsOf??"non verificato"}.
          Solo dati storici giornalieri, non prezzi in tempo reale.
        </p>
        {radar?<>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Strumenti valutati",radar.screenSize],
              ["Titoli tecnicamente esaminabili",radar.researchEligible],
              ["Momentum da approfondire",radar.momentumCount],
              ["Osservazioni prospettiche",radar.forwardObservations],
            ].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>)}
          </div>
          {radar.stale?<p className="rounded-lg border border-amber-400/25 p-3 text-sm text-amber-200">
            Le candele disponibili non sono abbastanza recenti: nessun candidato tecnico viene mostrato come attuale.
          </p>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {radar.watchlist.map((item:{
              key:string;venueMic:string|null;region:string;symbol:string;name:string;
              shortScore:number;shortAttention:string;mediumAttention:string;
              mediumScore:number;evidence:string[];historicalBarBucketAt:string;
            },index:number)=><article key={item.key}
              className="rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">#{index+1} · {item.venueMic??"Mercato da verificare"} · {item.region}</p>
                  <h3 className="mt-1 text-base font-bold">{item.symbol}</h3>
                  <p className="text-xs text-slate-400">{item.name}</p>
                </div>
                <span className="rounded-lg border border-emerald-300/20 px-2 py-1 text-xs font-bold text-emerald-200">
                  {item.shortScore}/100
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-emerald-200">2–10 sedute: {item.shortAttention}</p>
                <p className="text-sky-200">2–8 settimane: {item.mediumAttention} · {item.mediumScore}/100</p>
              </div>
              <p className="mt-3 text-xs text-slate-300">{item.evidence.length?item.evidence.join(" · "):"Nessuna conferma favorevole sufficiente"}</p>
              <p className="mt-2 text-xs text-slate-500">Candela storica: {item.historicalBarBucketAt} · Prezzo eseguibile non verificato</p>
              <p className="mt-1 text-xs text-amber-200">Non è un segnale COMPRA; PAPER e Directa bloccati</p>
            </article>)}
          </div>}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <h3 className="font-bold">Risultati osservati dopo i segnali, non guadagni di trading</h3>
            <p className="mt-2 text-slate-300">
              {radar.forwardSignals} segnali prospettici registrati · {radar.forwardObservations} candele osservate.
              Dopo almeno due <strong>nuove osservazioni effettive</strong> sul medesimo titolo:
              {" "}{radar.measuredPositive} variazioni positive,
              {" "}{radar.measuredNegative} negative,
              {" "}{radar.measuredUnchanged} invariate
              su {radar.measuredAfterTwoNewDailySnapshots} misurazioni completate.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              I giorni di Borsa non osservati non vengono inventati. Questi conteggi non sono
              operazioni, rendimenti netti in euro, previsioni o prove di strategia PAPER certificata.
              Ultima osservazione registrata: {radar.lastForwardObservationAt??"nessuna"}.
            </p>
          </div>
        </>:<p className="rounded-lg border border-amber-400/25 p-3 text-sm text-amber-200">
          Non posso verificare le evidenze o l&apos;integrità del registro: nessun radar viene presentato.
        </p>}
      </section>
      <section className="space-y-4 rounded-2xl border border-sky-300/25 bg-slate-900 p-5" aria-label="Copertura mondiale del comitato FENICE">
        <h2 className="text-xl font-black">Copertura reale del comitato: borse mondiali</h2>
        <p className="text-sm leading-6 text-slate-300">
          Una società straniera negoziata sul Nasdaq resta un titolo con sede di negoziazione USA:
          non sostituisce l&apos;analisi di Milano, Francoforte o Tokyo. Qui FENICE confronta le
          azioni censite con quelle effettivamente esaminate dal comitato.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Azioni quotate su borse non USA",committeeWorld.summary.nonUSVenueEquities],
            ["Con analisi nel comitato",committeeWorld.summary.nonUSVenueCommitteeCovered],
            ["Ancora fuori dal comitato",committeeWorld.summary.nonUSVenueExcludedFromCommittee],
          ].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
          </div>)}
        </div>
        <p className="text-xs text-amber-200">
          {committeeWorld.summary.foreignIssuerUSListings} società estere con negoziazione USA
          sono escluse dal conteggio delle borse non statunitensi. Nessuna di queste analisi
          abilita compravendite PAPER o LIVE.
        </p>
        <h3 className="text-sm font-bold text-sky-200">Coda di ricerca bilanciata per mercato</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {committeeWorld.researchQueue.slice(0,12).map(item=><article key={item.key}
            className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
            <p className="font-bold">{item.key} <span className="font-normal text-slate-400">({item.currency})</span></p>
            <p className="text-xs text-slate-400">{item.region}</p>
            <p className="mt-2 text-xs text-amber-200">Ricerca necessaria, non segnale COMPRA</p>
            <p className="mt-1 text-xs text-slate-300">
              {item.missingTasks.slice(0,3).map(task=>researchGapLabels[task]??task).join(" · ")}
            </p>
          </article>)}
        </div>
        <p className="text-xs text-slate-400">
          Snapshot del comitato: {committeeWorld.committeeAsOf??"non disponibile"}.
          La coda alterna le regioni; non ordina i titoli per rendimento previsto.
          Anche un comitato completo richiederà dati di Borsa, gestione rischio e autorizzazione PAPER separati.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-300/25 bg-slate-900 p-5">
        <h2 className="text-lg font-black">Qualità dei dati mondiali</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Comitato: {q.committeeCurrent?"aggiornato per la ricerca":"da aggiornare"} ·
          {" "}catalogo estero: {q.referenceCurrent?"riferimenti recenti":"aggiornamento richiesto"}.
          {" "}Età catalogo: {q.referenceAgeHours??"non verificata"} ore.
          {" "}Questi riferimenti non sono quotazioni operative.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {report.regions.map(x=><div key={x.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="font-bold">{x.name}</p>
            <p className="mt-1 text-xs text-slate-400">Paesi con riferimenti: {x.coveredCountries??"?"}/{x.targetCountries}</p>
            <p className="text-xs text-slate-400">Azioni ordinarie censite: {x.ordinaryStockReferences?.toLocaleString("it-IT")??"non verificato"}</p>
            <p className="mt-1 text-xs text-amber-200">{x.state==="SOURCE_REFRESH_REQUIRED"?"Catalogo da aggiornare":x.state==="EVIDENCE_INVALID"?"Prova insufficiente":"Solo riferimenti"}</p>
          </div>)}
        </div>
      </section>
      <section className="rounded-2xl border border-cyan-300/25 bg-slate-900 p-5" aria-label="Ricerca azioni internazionali">
        <h2 className="text-xl font-black">Azioni europee e asiatiche: piano dati mancante</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Coda di ricerca sui titoli esteri del catalogo iniziale. Ordine per <strong>documentazione esistente</strong>,
          mai per rendimento atteso. I riferimenti Twelve Data per Paese non provano la copertura del singolo titolo.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-black/30 p-3"><p className="text-xs text-slate-400">Azioni estere iniziali</p><p className="text-2xl font-black">{international.summary.internationalSeedEquities}</p></div>
          <div className="rounded-lg bg-black/30 p-3"><p className="text-xs text-slate-400">Documenti SEC disponibili</p><p className="text-2xl font-black">{international.summary.withIssuerDocuments}</p></div>
          <div className="rounded-lg bg-black/30 p-3"><p className="text-xs text-slate-400">Quotazioni certificate</p><p className="text-2xl font-black">{international.summary.executionGradeInternationalQuotes}</p></div>
        </div>
        <p className="mt-3 text-xs text-amber-200">Riferimenti esteri: {international.catalogueRecent?"recenti per sola ricerca":"da aggiornare"}. Nessuna posizione operativa internazionale autorizzata.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {international.rows.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-xs text-slate-400">{item.symbol} · {item.venueMic??"Borsa non verificata"} · {item.currency} · Paese {item.issuerCountry}</p></div>
              <span className="shrink-0 text-xs font-bold text-cyan-300">{item.evidenceCount}/4 prove</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{item.listingType==="LOCAL_LISTING"?"Quotazione locale":"Quotazione estera / ADR"} ·
             {" "}Documenti emittente: {item.issuerDocumentObserved?"presenti":"mancanti"} ·
             {" "}Serie prezzi storica: {item.researchCandleAvailable?"presente":"mancante"}</p>
            <p className="mt-2 text-xs text-amber-200">Da verificare: {item.nextDataActions.slice(0,4).join(" · ")}</p>
            <p className="mt-2 text-xs text-slate-500">Prezzi operativi assenti · Ordini e PAPER internazionale bloccati</p>
          </article>)}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-black">Priorità del comitato · ricerca, non ordini</h2>
        {report.rows.map((x,index)=><article key={x.symbol} className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div><p className="text-xs text-slate-400">#{index+1} · {x.symbol} · {x.venueMic??"mercato non verificato"}</p>
              <h3 className="mt-1 text-lg font-bold">{x.name}</h3>
              <p className="mt-1 text-xs text-slate-400">Sede/emittente: {x.issuerRegion??"non verificata"} · Borsa negoziata: {x.venueRegion??"non verificata"}</p>
            </div>
            <div className="text-right"><p className="font-semibold text-cyan-200">{x.committeeDecision}</p>
              <p className="text-xs text-slate-400">Score comitato: {x.committeeScore??"non verificato"}/100</p>
              <p className="text-xs text-slate-400">{x.possibleResearchReview?"Ricerca prioritaria":"Analisi bloccata/in attesa"}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
            <p>Motivo favorevole: {x.thesisPositive??"non disponibile"}</p>
            <p>Rischio/controtesi: {x.thesisNegative??"non disponibile"}</p>
          </div>
          <p className="mt-3 text-xs text-amber-200">Dati/limiti: {x.blocks.join(" · ")||"Nessun gap diagnostico, ma trading sempre bloccato"}.</p>
          <p className="mt-2 text-xs text-slate-400">Prezzo verificato adesso: NO · Ordini: BLOCCATI · Rendimenti futuri: non stimati.</p>
        </article>)}
      </section>
      <footer className="text-xs leading-6 text-slate-400">
        Le analisi derivano da snapshot salvati; questa pagina non consulta i mercati in streaming.
        I 7 fill PAPER V6 già registrati e il blocco totale degli ordini reali non vengono modificati.
      </footer>
    </div>
  </main>;
}
