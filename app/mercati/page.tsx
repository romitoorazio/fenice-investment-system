import Link from "next/link";
import masterData from "@/data/instrument-master.json";
import paperClock from "@/data/paper-market-session.json";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import { type InstrumentMaster } from "@/lib/market/instrument-master";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server-only request clock; this page is explicitly dynamic/no-store.
function serverRequestTime() {
  return Date.now();
}

export default function MercatiPage() {
  const now = serverRequestTime();
  const instruments = (masterData as InstrumentMaster).instruments.filter((row) => row.status === "active");
  const mics = [...new Set(instruments.map((row) => row.exchangeMic).filter((mic): mic is string => Boolean(mic)))];
  const sessions = mics.map((mic) => resolveVenueSession(mic, paperClock, now));
  const quoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage, now);
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

        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">
          LIVE e broker bloccati. Un orario compatibile con l&apos;apertura non autorizza trading:
          servono prova della sessione, dati realtime verificati per simbolo e gate di rischio.
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((market) => {
            const liveLabel = market.state === "OPEN" && market.authoritative
              ? "APERTO · VERIFICATO"
              : market.state === "CLOSED" && market.authoritative
                ? "CHIUSO · VERIFICATO"
                : "NON VERIFICATO";
            return (
              <article key={market.mic} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-black">{market.name}</h2>
                  <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-xs text-slate-400">{market.mic}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-slate-200">{liveLabel}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {market.indicativePhase === "REGULAR_WINDOW"
                    ? "Nella finestra oraria normale (non è prova di apertura)"
                    : market.indicativePhase === "OUTSIDE_REGULAR_WINDOW"
                      ? "Fuori dalla finestra oraria normale"
                      : "Orari non disponibili"}
                </p>
                <p className="mt-2 text-xs text-slate-500">{market.timeZone ?? "Fuso non censito"}</p>
                <p className="mt-3 text-xs font-semibold text-cyan-200">
                  {market.paperQuoteRefreshCandidate ? "Controllare Alpaca + Twelve Data (PAPER)" : "Analisi e ricerca soltanto"}
                </p>
                {market.regularHoursSource && (
                  <a href={market.regularHoursSource} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-slate-400 underline underline-offset-2">
                    Orari della borsa
                  </a>
                )}
              </article>
            );
          })}
        </section>
        <p className="text-xs text-slate-500">
          Catalogo strumenti: {instruments.length} titoli attivi, copertura {masterData.coverage}.
          I dati in repository sono snapshot storici: anche una precedente prova valida diventa non valida
          dopo 120 secondi. Le borse senza calendario/provider certificato restano NON VERIFICATE.
        </p>
      </div>
    </main>
  );
}
