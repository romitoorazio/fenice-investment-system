import Link from "next/link";
import masterData from "@/data/instrument-master.json";
import { getAlpacaPaperClock } from "@/lib/market/alpaca-paper-clock-runtime.mjs";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import europeCoverage from "@/data/europe-market-coverage.json";
import { buildMarketCoveragePlan } from "@/lib/ui/market-coverage-plan";
import { type InstrumentMaster } from "@/lib/market/instrument-master";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { getNasdaqPublicMarketStatus } from "@/lib/market/nasdaq-public-market-status.mjs";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";
import { describePersistedPaperQuoteHealth, paperQuoteDiagnosticMessage } from "@/lib/trading/paper-quote-diagnostics";


type PublicPaperDay = {
  date: string;
  observedAt: string;
  paperCycles?: number;
  cumulativePaperFilled?: number;
  newPaperFills?: number;
  liveOrders?: number;
  liveTradingAllowed?: boolean;
  reconciliationBalanced?: boolean;
  auditChainValid?: boolean;
  marketSession?: { evidence?: { authoritative?: boolean; state?: string; observedAt?: string } };
  executionMarketCoverage?: { ready?: boolean; paperEligibleSymbols?: number; requestedSymbols?: number; paperEligibleSourceFamilies?: number };
  decisionDataGate?: { ready?: boolean };
};
type PublicPaperCampaign = { dailyEvidence?: PublicPaperDay[]; minEvidenceDays?: number; minPaperFills?: number };
type PublicMarketCoverage = { generatedAt?: string; paperEligibleSymbols?: number; requestedSymbols?: number };
type PublicSourceHealth = { generatedAt?: string; gate?: string; summary?: { healthy?: number; degraded?: number }; critical?: { ready?: number; total?: number } };
type PublicCommittee = { generatedAt?: string; candidateCount?: number; buyCandidateCount?: number; executionGate?: string };
const PUBLIC_EVIDENCE_ROOT = "https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/";
const PUBLIC_EVIDENCE_FILES = [
  "paper-validation-campaign.json", "execution-market-coverage.json",
  "global-source-health.json", "investment-committee.json",
] as const;

// Read-only public GitHub source of record, NOT a Vercel build-time JSON snapshot.
// A network error never becomes an implicit PASS; no provider or broker call is made.
async function readCurrentPublishedEvidence<T>(file: typeof PUBLIC_EVIDENCE_FILES[number]): Promise<T | null> {
  try {
    const response = await fetch(PUBLIC_EVIDENCE_ROOT + file, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as T;
  } catch {
    return null;
  }
}
const nyPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function nySessionParts(raw: string | number | undefined) {
  const timestamp = typeof raw === "number" ? raw : Date.parse(raw ?? "");
  if (!Number.isFinite(timestamp)) return null;
  const parts = Object.fromEntries(nyPartsFormatter.formatToParts(timestamp).map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes };
}
function minutesOld(raw: string | undefined, now: number): number | null {
  const time = Date.parse(raw ?? "");
  return Number.isFinite(time) && time <= now ? (now - time) / 60000 : null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server-only request clock; this page is explicitly dynamic/no-store.
function serverRequestTime() {
  return Date.now();
}

export default async function MercatiPage() {
  const now = serverRequestTime();
  const [publicUsMarketStatus, livePaperClock] = await Promise.all([
    getNasdaqPublicMarketStatus(now),
    getAlpacaPaperClock(now),
  ]);
  const [publishedCampaign, publishedCoverage, publishedHealth, publishedCommittee] = await Promise.all([
    readCurrentPublishedEvidence<PublicPaperCampaign>("paper-validation-campaign.json"),
    readCurrentPublishedEvidence<PublicMarketCoverage>("execution-market-coverage.json"),
    readCurrentPublishedEvidence<PublicSourceHealth>("global-source-health.json"),
    readCurrentPublishedEvidence<PublicCommittee>("investment-committee.json"),
  ]);
  const todayNy = nySessionParts(now)?.day ?? null;
  const latestPaper = publishedCampaign?.dailyEvidence?.at(-1) ?? null;
  const cycleTimeNy = nySessionParts(latestPaper?.observedAt);
  const evidenceToday = !!(todayNy && latestPaper?.date === todayNy
    && cycleTimeNy?.day === todayNy && cycleTimeNy.minutes >= 9 * 60 + 30
    && (latestPaper.paperCycles ?? 0) > 0);
  const lastSessionClockMs = Date.parse(latestPaper?.marketSession?.evidence?.observedAt ?? "");
  const lastPaperCycleMs = Date.parse(latestPaper?.observedAt ?? "");
  const sessionClockAgeSeconds = Number.isFinite(lastSessionClockMs) && Number.isFinite(lastPaperCycleMs)
    ? (lastPaperCycleMs - lastSessionClockMs) / 1000 : null;
  const authoritativePaperOpening = !!(evidenceToday && latestPaper?.marketSession?.evidence?.authoritative
    && latestPaper?.marketSession?.evidence?.state === "OPEN"
    && nySessionParts(latestPaper?.marketSession?.evidence?.observedAt)?.day === todayNy
    && sessionClockAgeSeconds !== null && sessionClockAgeSeconds >= 0 && sessionClockAgeSeconds <= 120);
  const auditCoherent = !!(authoritativePaperOpening && latestPaper?.reconciliationBalanced
    && latestPaper?.auditChainValid && latestPaper?.decisionDataGate?.ready === true
    && latestPaper?.liveOrders === 0 && latestPaper?.liveTradingAllowed === false);
  const paperCoverage = latestPaper?.executionMarketCoverage;
  const captureQuoteEligible = !!(auditCoherent && paperCoverage?.ready === true
    && (paperCoverage?.paperEligibleSymbols ?? 0) >= 3
    && (paperCoverage?.paperEligibleSourceFamilies ?? 0) >= 2);
  const coverageAgeMinutes = minutesOld(publishedCoverage?.generatedAt, now);
  const livePublishedQuoteEligible = coverageAgeMinutes !== null && coverageAgeMinutes <= 2
    && (publishedCoverage?.paperEligibleSymbols ?? 0) >= 3;
  const latestCommitteeNy = nySessionParts(publishedCommittee?.generatedAt);
  const committeeAfterOpen = !!(latestCommitteeNy && latestCommitteeNy.day === todayNy
    && latestCommitteeNy.minutes >= 9 * 60 + 30);
  const sourceHealthAge = minutesOld(publishedHealth?.generatedAt, now);
  const sourceHealthCurrent = sourceHealthAge !== null && sourceHealthAge <= 120;
  const instruments = (masterData as InstrumentMaster).instruments.filter((row) => row.status === "active");
  const mics = [...new Set(instruments.map((row) => row.exchangeMic).filter((mic): mic is string => Boolean(mic)))];
  const sessions = mics.map((mic) => ({
    ...resolveVenueSession(mic, livePaperClock, now),
    publicUsMarketStatus: ["XNYS", "XNAS", "ARCX"].includes(mic)
      ? publicUsMarketStatus : null,
  }));
  const quoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage, now);
  const quoteDiagnostics = describePersistedPaperQuoteHealth(executionMarket, executionCoverage, now);
  const coveragePlan = buildMarketCoveragePlan(executionCoverage, instruments, now, executionMarket.generatedAt);
  const europeanCalendarCount = sessions.filter((row) => ["XMIL", "XPAR", "XETR"].includes(row.mic)
    && row.calendarAnnualScheduleVerified).length;
  const officialClosedToday = sessions.filter((row) => row.calendarState === "OFFICIAL_CLOSED").length;
  const authoritativeOpen = sessions.filter((row) => row.authoritative && row.state === "OPEN").length;
  const freshPaperSession = sessions.some((row) => row.mic === "XNAS" && row.authoritative && row.state === "OPEN");
  const paperQuoteReadyNow = freshPaperSession && quoteGate.ready;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Fenice Market Brain</p>
            <h1 className="mt-2 text-3xl font-black">Mercati e fonti</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Orari indicativi per borsa, con fuso corretto. OPEN è mostrato soltanto con prova autorevole
              aggiornata. Festività, chiusure anticipate e sospensioni non sono dedotte dall&apos;orologio.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Oggi</Link>
        </header>


        <section aria-label="Prova operativa dopo l'apertura dei mercati" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-5 text-sm text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-white">Prova operativa dopo Wall Street · PAPER</h2>
            <span className={auditCoherent ? "text-emerald-300 font-bold" : "text-amber-200 font-bold"}>
              {auditCoherent ? "CICLO DOCUMENTATO" : "PROVA ODIERNA NON COMPLETA"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Controllo eseguito alle {new Date(now).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}.
            Fonte: file pubblici del ramo main GitHub letti senza cache; non i dati congelati nell&apos;ultimo deployment.
            La finestra oraria di New York è soltanto un riferimento temporale; l&apos;apertura verificata richiede l&apos;orologio Alpaca nel record PAPER.
          </p>
          {!publishedCampaign && (
            <p className="mt-3 text-rose-300 font-bold">Registro PAPER non raggiungibile: prova NON disponibile, nessun PASS presunto.</p>
          )}
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <dt className="font-bold text-white">Ciclo PAPER di oggi (New York {todayNy ?? "non determinabile"})</dt>
              <dd className="mt-1">{evidenceToday ? "Registrato dopo le 09:30 ET" : "NON ancora documentato dopo l’apertura"}</dd>
              <dd className="text-xs text-slate-400">Ultima registrazione: {latestPaper?.observedAt ?? "non disponibile"}</dd>
              <dd className="text-xs text-slate-400">Orologio Alpaca nel record: {authoritativePaperOpening ? "OPEN autorevole" : "assente, non OPEN o con età superiore a 120 secondi"}</dd>
              <dd className="text-xs text-slate-400">Riconciliazione e catena audit: {auditCoherent ? "coerenti" : "non dimostrate per oggi"}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <dt className="font-bold text-white">Esecuzioni simulate</dt>
              <dd className="mt-1">Fill PAPER cumulativi: {latestPaper?.cumulativePaperFilled ?? "non disponibili"}/{publishedCampaign?.minPaperFills ?? 10}</dd>
              <dd className="text-xs text-slate-400">Nuovi fill nell&apos;ultimo ciclo: {latestPaper?.newPaperFills ?? "non disponibili"} (zero può essere una decisione valida)</dd>
              <dd className="text-xs text-slate-400">Quote idonee nel ciclo di oggi: {captureQuoteEligible ? "SÌ, con audit coerente" : "NON provate"}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <dt className="font-bold text-white">Quotazioni di esecuzione · GitHub</dt>
              <dd className="mt-1">{livePublishedQuoteEligible ? "Campione corrente, soglia minimo 3 titoli" : "Campione scaduto, insufficiente o non disponibile"}</dd>
              <dd className="text-xs text-slate-400">Ultimo campione: {publishedCoverage?.generatedAt ?? "non disponibile"}</dd>
              <dd className="text-xs text-slate-400">Titoli idonei a raccolta: {publishedCoverage?.paperEligibleSymbols ?? "?"}/{publishedCoverage?.requestedSymbols ?? "?"}; durata massima 120 s</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <dt className="font-bold text-white">Analisi mondiale e qualità fonti</dt>
              <dd className="mt-1">{committeeAfterOpen ? "Comitato ricalcolato dopo l’apertura USA" : "Comitato NON ricalcolato dopo l’apertura USA"}</dd>
              <dd className="text-xs text-slate-400">Comitato: {publishedCommittee?.generatedAt ?? "non disponibile"} · {publishedCommittee?.candidateCount ?? "?"} titoli, {publishedCommittee?.buyCandidateCount ?? "?"} BUY</dd>
              <dd className="text-xs text-slate-400">Fonti: {publishedHealth?.summary?.healthy ?? "?"}/21 sane; gate {publishedHealth?.gate ?? "non disponibile"} ({sourceHealthCurrent ? "aggiornato" : "non recente o non disponibile"})</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-amber-100">
            Europa e Asia: il catalogo e i report non dimostrano esecuzioni PAPER su quelle borse.
            Questo pannello non effettua scambi né richieste di nuovi prezzi. LIVE resta bloccato.
            {" "}<a className="underline" target="_blank" rel="noopener noreferrer" href="https://github.com/romitoorazio/fenice-investment-system/actions/workflows/paper-validation.yml">Apri workflow PAPER</a>
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Borse monitorate</p>
            <p className="mt-1 text-2xl font-black">{sessions.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Aperture verificate</p>
            <p className="mt-1 text-2xl font-black">{authoritativeOpen}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Quorum PAPER (120 s)</p>
            <p className="mt-1 text-lg font-black">{paperQuoteReadyNow ? "DATI PAPER VERIFICATI" : "NON VERIFICATI ORA"}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <p className="font-bold text-white">Diagnosi quotazioni PAPER · limite 120 secondi</p>
          <p className="mt-2">
            {quoteDiagnostics.diagnosticState === "QUORUM_CURRENT"
              ? "Il quorum delle quotazioni salvate supera attualmente i controlli di freschezza."
              : quoteDiagnostics.diagnosticState === "SNAPSHOT_EXPIRED"
                ? "Campione di prezzi scaduto: il quorum attuale non è dimostrato."
                : "Campione recente, ma manca la verifica indipendente completa."}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Ultimo campione salvato: {quoteDiagnostics.snapshotObservedAt ?? "non disponibile"} (UTC).
            {" "}Età: {quoteDiagnostics.snapshotAgeSeconds !== null
              ? `${Math.max(0, Math.round(quoteDiagnostics.snapshotAgeSeconds / 60))} minuti`
              : "non determinabile"}.
            {" "}Titoli verificati quando registrati: {quoteDiagnostics.snapshotPaperEligibleSymbols}/{quoteDiagnostics.requestedSymbols}.
            {" "}Questi dati NON vengono aggiornati in streaming dal browser.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {quoteDiagnostics.symbols.slice(0, 8).map((row) => (
              <div key={row.symbol} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="font-bold text-white">{row.symbol}</p>
                <p className="mt-1 text-xs text-slate-300">
                  {paperQuoteDiagnosticMessage(row.state)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fonti PAPER nell&apos;ultimo campione: {row.historicalVerifiedFamilies.join(", ") || "nessuna"}
                </p>
                {row.freshTradeFallbackFamilies.length > 0 && (
                  <p className="mt-1 text-xs text-amber-200">
                    Il campione Alpaca proviene dall&apos;ultimo scambio, senza quotazione bid/ask verificata.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            L&apos;orologio Alpaca può essere aggiornato, ma non sostituisce prezzi recenti,
            concordanti e con provenienza verificata. LIVE e ordini restano bloccati.
          </p>
        </section>

        <section aria-label="Piano copertura titoli e fonti" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
          <h2 className="text-lg font-black text-cyan-100">Copertura mondiale: cosa possiamo davvero verificare</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Catalogo europeo: {europeCoverage.activePrimaryMarkets} mercati primari in {europeCoverage.coveredCountries} paesi;
            sono riferimenti di ricerca, non connessioni realtime certificate.
            Nucleo di quotazioni PAPER campionate: {coveragePlan.sampleEligibleAtCapture}/{coveragePlan.requestedSymbols}.
            In questo istante campioni ancora recenti: {coveragePlan.sampleEligibleNow}.
          </p>
          <p className="mt-2 text-xs text-amber-200">
            Ultima raccolta prezzi: {coveragePlan.snapshotGeneratedAt ?? "non verificabile"} UTC.
            {coveragePlan.snapshotCurrent ? " Campione recente, soltanto informativo." : " Campione scaduto: non mostra prezzi negoziabili adesso."}
            Nessuna richiesta aggiuntiva ai provider viene avviata aprendo questa pagina.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {coveragePlan.rows.map((row, index) => (
              <article key={row.symbol + index} className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-bold text-white">{row.symbol} <span className="text-xs font-normal text-slate-400">{row.exchangeMic ?? "MIC da verificare"}</span></p>
                    <p className="text-xs text-slate-400">{row.exchangeName ?? row.name ?? "Identità da verificare"} · {row.currency ?? "Valuta da verificare"}</p>
                  </div>
                  <span className={row.status === "RECENT_SAMPLE_ONLY" ? "text-xs font-bold text-emerald-300" : "text-xs font-bold text-amber-200"}>
                    {row.status === "RECENT_SAMPLE_ONLY" ? "CAMPIONE RECENTE"
                      : row.status === "EXPIRED_SAMPLE" ? "CAMPIONE SCADUTO"
                      : row.status === "IDENTITY_REVIEW" ? "IDENTITÀ DA VALIDARE" : "SOLO RICERCA"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-300">{row.action}</p>
                <p className="mt-1 text-xs text-slate-500">Fonti autorizzate al momento del campione: {row.verifiedFamiliesAtCapture.join(", ") || "nessuna"}
                  {row.reasons.length ? " · " + row.reasons[0] : ""}</p>
                <Link href={`/analista?symbol=${encodeURIComponent(row.symbol)}`}
                  className="mt-2 inline-block text-xs font-semibold text-cyan-300 underline">Analisi titolo, senza ordine →</Link>
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Per ampliare la copertura servono prove di licenza, MIC, valuta, freschezza e almeno due fonti indipendenti per ogni titolo candidato.
            Alcune borse sono coperte soltanto a livello di identità; nessun feed a pagamento viene attivato automaticamente.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <p className="font-bold">Alpaca PAPER · orologio USA</p>
          <p className="mt-1">
            {livePaperClock.evidence.authoritative
              ? (livePaperClock.evidence.state === "OPEN"
                ? "Sessione americana APERTA, verificata da Alpaca"
                : "Sessione americana CHIUSA, verificata da Alpaca")
              : livePaperClock.configured
                ? "Collegamento configurato, ma risposta non verificata"
                : "Chiavi Alpaca PAPER non ancora inserite nelle variabili protette di Vercel"}.
            {" "}Solo lettura; nessun ordine autorizzato.
          </p>
          {livePaperClock.evidence.authoritative && (
            <p className="mt-2 text-xs text-slate-400">
              Aggiornamento Alpaca: {livePaperClock.evidence.observedAt}
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-100">
          <p className="font-bold">Segnale pubblico Nasdaq USA</p>
          <p className="mt-1">
            {publicUsMarketStatus.state === "OPEN" ? "Nasdaq segnala mercato aperto" :
              publicUsMarketStatus.state === "CLOSED" ? "Nasdaq segnala mercato chiuso" :
                "Stato pubblico non disponibile o non sufficientemente aggiornato"}.
            {" "}Questo segnale è informativo e non certifica l&apos;apertura della singola borsa né autorizza ordini.
          </p>
          <a href={publicUsMarketStatus.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-block text-xs underline underline-offset-2">
            Fonte Nasdaq
          </a>
        </section>

        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">
          LIVE e broker bloccati. Un orario compatibile con l&apos;apertura non autorizza trading:
          servono prova della sessione, dati realtime verificati per simbolo e gate di rischio.
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-bold text-white">Calendari ufficiali europei 2026</p>
          <p className="mt-1">
            {europeanCalendarCount} calendari annuali disponibili per Milano, Parigi e Xetra;
            {" "}{officialClosedToday} piazze con chiusura da calendario oggi.
            {" "}Le festività e le sedute speciali sono distinte dai dati live.
            Una giornata non segnalata come festiva non equivale a mercato aperto.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((market) => {
            const liveLabel = market.state === "OPEN" && market.authoritative
              ? "APERTO · VERIFICATO"
              : market.state === "CLOSED" && market.authoritative
                ? "CHIUSO · VERIFICATO"
                : market.calendarState === "OFFICIAL_CLOSED"
                ? "CHIUSO · CALENDARIO 2026 (NON LIVE)"
                : market.calendarState === "SPECIAL_HOURS_UNCONFIRMED"
                  ? "SEDUTA SPECIALE · ORARIO NON CONFERMATO"
                  : market.publicUsMarketStatus?.state === "OPEN"
                  ? "NASDAQ USA: APERTO · NON CERTIFICANTE"
                  : market.publicUsMarketStatus?.state === "CLOSED"
                    ? "NASDAQ USA: CHIUSO · NON CERTIFICANTE"
                    : "NON VERIFICATO";
            return (
              <article key={market.mic} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-black">{market.name}</h2>
                  <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-xs text-slate-400">{market.mic}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-slate-200">{liveLabel}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {market.calendarState === "OFFICIAL_CLOSED"
                    ? "Chiusura ufficiale programmata. Non è una lettura live."
                    : market.calendarState === "SPECIAL_HOURS_UNCONFIRMED"
                      ? "Possibile seduta ridotta: controllare gli orari dell&apos;asta prima di qualunque valutazione."
                      : market.indicativePhase === "REGULAR_WINDOW"
                    ? "Nella finestra oraria normale (non è prova di apertura)"
                    : market.indicativePhase === "OUTSIDE_REGULAR_WINDOW"
                      ? "Fuori dalla finestra oraria normale"
                      : "Orari non disponibili"}
                </p>
                <p className="mt-2 text-xs text-slate-500">{market.timeZone ?? "Fuso non censito"}</p>
                <p className="mt-3 text-xs font-semibold text-cyan-200">
                  {market.paperQuoteRefreshCandidate ? "Controllare Alpaca + Twelve Data (PAPER)" : "Analisi e ricerca soltanto"}
                </p>
                {(market.calendarSource || market.regularHoursSource) && (
                  <a href={market.calendarSource || market.regularHoursSource || "#"} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-slate-400 underline underline-offset-2">
                    Orari e calendario della borsa
                  </a>
                )}
              </article>
            );
          })}
        </section>
        <p className="text-xs text-slate-500">
          Catalogo strumenti: {instruments.length} titoli attivi, copertura {masterData.coverage}.
          I dati in repository sono snapshot storici: anche una precedente prova valida diventa non valida
          dopo 120 secondi. Il calendario annuale 2026 è valido soltanto per le date pubblicate;
          non autorizza operazioni e non certifica l&apos;apertura reale.
        </p>
      </div>
    </main>
  );
}
