import Link from "next/link";
import committee from "@/data/investment-committee.json";
import master from "@/data/instrument-master.json";
import terminal from "@/data/terminal-intelligence.json";
import reference from "@/data/global-reference-coverage.json";
import universe from "@/data/global-market-universe.json";
import {evaluateGlobalOpportunityAudit} from "@/lib/ui/global-opportunity-audit";
import fundamentals from "@/data/fundamental-research.json";
import {buildInternationalResearchQueue} from "@/lib/ui/international-research-queue";

export const dynamic="force-dynamic";
export const revalidate=0;
function serverRequestTime(){return Date.now()}
export default function GlobalOpportunitiesPage(){
  const report=evaluateGlobalOpportunityAudit(committee,master,terminal,reference,universe,serverRequestTime());
  const q=report.dataQuality;
  const international=buildInternationalResearchQueue(master,fundamentals,terminal,committee,reference,serverRequestTime());
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
