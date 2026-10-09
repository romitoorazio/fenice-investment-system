import Link from "next/link";
import masterData from "@/data/instrument-master.json";
import { getAlpacaPaperClock } from "@/lib/market/alpaca-paper-clock-runtime.mjs";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import { type InstrumentMaster } from "@/lib/market/instrument-master";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { getNasdaqPublicMarketStatus } from "@/lib/market/nasdaq-public-market-status.mjs";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";

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
  const instruments = (masterData as InstrumentMaster).instruments.filter((row) => row.status === "active");
  const mics = [...new Set(instruments.map((row) => row.exchangeMic).filter((mic): mic is string => Boolean(mic)))];
  const sessions = mics.map((mic) => ({
    ...resolveVenueSession(mic, livePaperClock, now),
    publicUsMarketStatus: ["XNYS", "XNAS", "ARCX"].includes(mic)
      ? publicUsMarketStatus : null,
  }));
  const quoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage, now);
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
