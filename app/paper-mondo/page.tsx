import Link from "next/link";
import master from "@/data/instrument-master.json";
import regionalSeeds from "@/data/world-paper-v7-research-seeds.json";
import funnel from "@/data/world-equity-funnel-status.json";
import reference from "@/data/global-reference-coverage.json";
import { runWorldPaperV7 } from "@/lib/trading/world-paper-v7.mjs";
import bakedObservations from "@/data/world-v7-provider-observation.json";
import bakedEod from "@/data/world-v7-eod-research.json";


type GlobalEodRecord={
  venue?:string;ticker?:string;status?:string;region?:string;researchSignal?:string;
  lastCompleteBarDate?:string|null;analyzedAt?:string|null;completeSessions?:number;
  paperFillCount?:number;licensedPaperSource?:boolean;
};
type GlobalEodBook={records?:Record<string,GlobalEodRecord>;liveTradingAllowed?:boolean;realtimePaperEligible?:boolean;
  fxHistory?: {source?:string;status?:string;observations?:number;dailyReferenceOnly?:boolean};
  historicalReplay?: {historicalResearchTransactions?:number;historicalResearchBuys?:number;
    historicalResearchSells?:number;estimatedNetReturnPct?:number|null;performanceStatus?:string;forwardVerifiedPaperFills?:number;
    marketDataRightsCertified?:boolean;liveTradingAllowed?:boolean};
};
async function readLatestEod(): Promise<GlobalEodBook> {
  const fallback:GlobalEodBook=bakedEod;
  try {
    const r=await fetch("https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/world-v7-eod-research.json",
      {cache:"no-store",signal:AbortSignal.timeout(3500)});
    if(!r.ok)return fallback;
    const json:unknown=await r.json();
    if(!json||typeof json!=="object"||Array.isArray(json))return fallback;
    const book=json as GlobalEodBook;
    if(book.liveTradingAllowed!==false || book.realtimePaperEligible!==false ||
      !book.records || typeof book.records!=="object" || Array.isArray(book.records))return fallback;
    return book;
  }catch {return fallback;}
}

type ProviderRecord = {
  recordedAt?: string; venue?: string;
  target?: {symbol?:string; providerMic?: string; mic?: string; canonicalSegmentProof?: boolean};
  state?: {status?: string; reportedOpen?: boolean | null};
  quote?: {status?: string; ageSeconds?: number | null; tradeTimestamp?: string | null};
  catalogue?: {status?: string; requiredPlan?: string; exactIdentity?: boolean};
  paperReady?: boolean; privatePricePublished?: boolean;
};
type ProviderObservations = {
  records?: Record<string, ProviderRecord>;
  liveTradingAllowed?: boolean; paperReady?: boolean;
};
const PROBED_VENUES = [
  {mic:"XTKS",name:"Tokyo",ticker:"7203"},
  {mic:"XMIL",name:"Milano",ticker:"ENEL"},
  {mic:"XETR",name:"Francoforte",ticker:"DTE"},
] as const;

async function readLatestProviderObservation(): Promise<ProviderObservations> {
  const fallback: ProviderObservations = bakedObservations;
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/world-v7-provider-observation.json",
      {cache:"no-store",signal:AbortSignal.timeout(3500)}
    );
    if (!response.ok) return fallback;
    const json: unknown = await response.json();
    if (!json || typeof json !== "object" || Array.isArray(json)) return fallback;
    const book = json as ProviderObservations;
    if (book.liveTradingAllowed !== false || book.paperReady !== false ||
        !book.records || typeof book.records !== "object" || Array.isArray(book.records)) return fallback;
    return book;
  } catch { return fallback; }
}


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Independent observation. This page never submits to the V6 OMS or any broker.
export default async function WorldPaperPilotPage() {
  const [providerBook,eodBook] = await Promise.all([readLatestProviderObservation(),readLatestEod()]);
  const report = runWorldPaperV7({
    nowIso: new Date().toISOString(), instruments: [...master.instruments, ...regionalSeeds.instruments],
    paperRunAuthorized: false, sessions: [], quotes: [], fx: [],
    entitlements: { sources: [], sessions: [], fx: [] },
  });
  const readAt = Date.parse(report.generatedAt);
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <Link href="/global" className="text-sm text-cyan-300 underline">← Ricerca mondiale</Link>
          <p className="text-xs font-black uppercase tracking-widest text-amber-300">FENICE World PAPER V7 · indipendente dal V6</p>
          <h1 className="text-3xl font-black">Trading simulato mondiale: prove e lacune</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Non aspettiamo Wall Street per osservare Asia, Europa e America. Ogni borsa deve però dimostrare
            con dati propri la sessione aperta, due quotazioni indipendenti autorizzate,
            la valuta e una decisione valida prima di produrre un fill PAPER.
            Gli orari indicativi non sono prova di mercato aperto.
          </p>
        </header>
        <section className="grid gap-3 sm:grid-cols-4" aria-label="Prove mondiali">
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Riferimenti ricerca</p><p className="text-2xl font-black">{funnel.selected}</p>
            <p className="text-xs text-slate-500">{funnel.regions} regioni, non prezzi negoziabili</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Mercati pilota censiti</p>
            <p className="text-2xl font-black">{new Set(report.listings.map((row: { mic: string }) => row.mic)).size}</p>
            <p className="text-xs text-slate-500">Strumenti identificati per MIC</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Quotazioni PAPER mondiali certificate</p>
            <p className="text-2xl font-black">{report.summary.independentlyVerifiedListings}</p>
            <p className="text-xs text-amber-200">Non scambiare cataloghi per feed realtime</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Fill mondiali V7 confermati</p>
            <p className="text-2xl font-black">{report.summary.filledPaperOrders}</p>
            <p className="text-xs text-amber-200">Separati dai 7 fill storici V6</p>
          </div>
        </section>
        <section className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-4">
          <h2 className="font-black">Cosa serve per iniziare a simulare in ogni Borsa</h2>
          <p className="mt-2 text-sm text-slate-300">
            Il motore V7 e la simulazione con limiti e audit possono funzionare con dati verificati.
            Attualmente le fonti internazionali non sono ammesse automaticamente al PAPER:
            senza licenza, provenienza certa, due famiglie indipendenti, orologio della Borsa e FX recente
            il sistema deve fermarsi. Nessun fill sintetico viene aggiunto allo storico operativo.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Riferimenti acquisiti: {funnel.generatedAt} · Copertura Paesi: {reference.coverage.providerMatchedCountries}/{reference.coverage.targetCountries}.
            Il refresh della pagina aggiorna la diagnosi di ammissibilità, non scarica nuove quotazioni né apre ordini.
          </p>
        </section>
        <section className="space-y-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/5 p-4" aria-label="Prove dati reali per le Borse estere">
          <h2 className="text-xl font-black">Accesso reale ai dati: Tokyo, Milano e Francoforte</h2>
          <p className="text-sm text-slate-300">
            Diagnostica Twelve Data con richieste limitate alle quotazioni e allo stato del listino.
            Mostra cosa risponde il provider, non certifica la Borsa o i diritti di utilizzo PAPER.
            Nessun prezzo proprietario è pubblicato.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROBED_VENUES.map(venue=>{
              const candidate = providerBook.records?.[venue.mic];
              // The ticker for a MIC can change in the EOD pilot. Never
              // relabel a previous instrument's diagnostic as the new one.
              const item = candidate?.target?.symbol===venue.ticker ? candidate : undefined;
              const ts = item?.recordedAt ? Date.parse(item.recordedAt) : NaN;
              const fresh = Number.isFinite(ts) && ts <= readAt && readAt - ts <= 24*60*60*1000;
              const valid = item?.paperReady === false && item?.privatePricePublished === false;
              return (
                <article key={venue.mic} className="rounded-xl border border-white/15 bg-slate-950/65 p-3 text-sm">
                  <p className="font-black text-white">{venue.name} · {venue.mic}</p>
                  <p className="text-xs text-slate-400">Titolo campione: {venue.ticker}</p>
                  {item?.target?.providerMic && item.target.providerMic !== venue.mic && <p className="text-xs text-amber-300">MIC del provider: {item.target.providerMic} (operativo, non prova del segmento {venue.mic})</p>}
                  <p className="mt-2 text-xs text-slate-200">Controllo: {valid ? (fresh ? "REGISTRATO" : "SCADUTO") : "NON ANCORA REGISTRATO"}</p>
                  <p className="mt-1 text-xs text-slate-300">Borsa secondo provider: {valid ? (item?.state?.status ?? "non disponibile") : "non disponibile"}</p>
                  <p className="text-xs text-slate-300">Aperta secondo provider: {valid && item?.state?.reportedOpen === true ? "sì (non certificato)" : valid && item?.state?.reportedOpen === false ? "no" : "non verificato"}</p>
                  <p className="mt-1 text-xs text-slate-300">Catalogo/identità: {valid ? (item?.catalogue?.status ?? "non verificato") : "non verificato"}</p>
                  <p className="text-xs text-slate-300">Piano dichiarato per il simbolo: {valid ? (item?.catalogue?.requiredPlan ?? "sconosciuto") : "sconosciuto"} (non è un diritto di utilizzo)</p>
                  <p className="mt-1 text-xs text-slate-300">Prezzo e ora: {valid ? (item?.quote?.status ?? "non disponibile") : "non verificati"}</p>
                  <p className="text-xs text-slate-400">Rilevamento: {valid ? item?.recordedAt : "nessuno"}</p>
                  <p className="mt-2 text-xs font-semibold text-amber-200">PAPER: NON AUTORIZZATO — manca certificazione delle fonti indipendenti</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-indigo-300/25 bg-indigo-400/5 p-4" aria-label="Ricerca mondiale di fine giornata">
          <h2 className="text-xl font-black">Seconda fonte: ricerca mondiale di fine giornata</h2>
          <p className="text-sm text-slate-300">
            Alpha Vantage è un canale EOD distinto da Twelve Data. Usa solo candele giornaliere
            completate e segnala il trend successivamente alla seduta; nessun prezzo grezzo viene
            ripubblicato. Non è una quotazione intraday, non crea fill PAPER e non prova
            automaticamente il listino MIC né i diritti per ordini.
          </p>
          <div className="rounded-xl border border-indigo-300/20 bg-slate-950/50 p-3 text-xs text-slate-300">
            <p className="font-bold text-indigo-200">Simulazione storica giornaliera (NON fill PAPER)</p>
            <p>Operazioni storiche ricostruite: {eodBook.historicalReplay?.marketDataRightsCertified===false &&
              eodBook.historicalReplay?.forwardVerifiedPaperFills===0 &&
              eodBook.historicalReplay?.liveTradingAllowed===false
              ? (eodBook.historicalReplay?.historicalResearchTransactions??0) : "non disponibili"}.
              Risultato economico: {eodBook.historicalReplay?.performanceStatus==="NO_VERIFIED_HISTORICAL_DATA"
                ? "NON CALCOLABILE (nessuna serie validata)"
                : "solo stima storica, non profitti reali"}.
              Cambio JPY/EUR storico: {eodBook.fxHistory?.status??"non disponibile"}.
              Nessuna esecuzione futura verificata: dati storici, MIC e diritti di utilizzo restano da convalidare.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROBED_VENUES.map(venue=>{
              const eodCandidate=eodBook.records?.[venue.mic];
              const eod=eodCandidate?.ticker===venue.ticker ? eodCandidate : undefined;
              const timestamp=eod?.analyzedAt ? Date.parse(eod.analyzedAt) : NaN;
              const recent=Number.isFinite(timestamp) && timestamp<=readAt && readAt-timestamp<=48*3600000;
              const valid=!!eod && eod.paperFillCount===0 && eod.licensedPaperSource===false;
              return (
                <div key={venue.mic} className="rounded-xl border border-white/15 bg-slate-950/65 p-3 text-sm">
                  <p className="font-bold">{venue.name} · {venue.mic}</p>
                  <p className="mt-1 text-xs text-slate-400">Analisi EOD: {valid ? eod.status : "IN ATTESA DEL PRIMO CONTROLLO"}</p>
                  <p className="text-xs text-slate-400">Ultima seduta completa: {valid ? (eod.lastCompleteBarDate??"non provata") : "non provata"}</p>
                  <p className="mt-1 text-xs text-indigo-200">Trend osservato: {valid && recent ? (eod.researchSignal??"NO_SIGNAL") : "NON DISPONIBILE / SCADUTO"}</p>
                  <p className="mt-1 text-xs text-amber-300">Solo ricerca; nessun acquisto o fill certificato</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-black">Stato del pilota per regione</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.regions.map((region: { region: string; listedInPilot: number; verifiedPaperListings: number; blockedListings: number }) => (
              <article key={region.region} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <h3 className="font-bold">{region.region}</h3>
                <p className="mt-1 text-sm">{region.listedInPilot} strumenti · {region.verifiedPaperListings} verificati PAPER</p>
                <p className="mt-1 text-xs text-amber-200">{region.blockedListings} richiedono prove di fonte/sessione/cambio</p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-white/15 p-4">
          <h2 className="font-black">Esito individuale, non soltanto USA</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.listings.map((row: { key: string; region: string; mic: string; currency: string; ready: boolean; reasons: string[] }) => (
              <div key={row.key} className="rounded-lg border border-white/10 p-3 text-sm">
                <p className="font-bold">{row.key} <span className="font-normal text-slate-400">({row.currency})</span></p>
                <p className="text-xs text-slate-400">{row.region}</p>
                <p className={row.ready ? "mt-1 text-xs text-emerald-300" : "mt-1 text-xs text-amber-200"}>
                  {row.ready ? "Dati PAPER verificati" : row.reasons.join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <Link href="/api/paper/world-v7" className="mt-4 inline-block text-sm text-cyan-300 underline">
            Apri il rapporto JSON verificabile
          </Link>
        </section>
        <p className="text-xs text-slate-500">
          Capitale reale, Directa e ordini LIVE non accessibili da questo modulo. Il motore non modifica
          dati o limiti del V6. Nessuna nuova posizione di trading è stata creata aprendo questa pagina.
        </p>
      </div>
    </main>
  );
}
