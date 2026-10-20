import Link from "next/link";
import FeniceAnalystConsole from "@/components/FeniceAnalystConsole";
import { answerFeniceResearch } from "@/lib/ui/fenice-grounded-analyst";
import { feniceAnalystContext } from "@/lib/ui/fenice-analyst-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Capture request time outside the rendering expression for React purity.
function serverRequestTime() { return Date.now(); }

export default async function FeniceAnalystPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string | string[] }>;
}) {
  const requested = (await searchParams).symbol;
  const symbol = typeof requested === "string" ? requested.trim().toUpperCase() : "";
  // Deep links may select only a uniquely matched symbol already reviewed by
  // the committee. Unknown input never becomes an autonomous or paid AI request.
  const tracked = Array.isArray(feniceAnalystContext.committee.allDecisions)
    && feniceAnalystContext.committee.allDecisions.filter(item => item.symbol.toUpperCase() === symbol).length === 1;
  const initialQuestion = /^[A-Z0-9][A-Z0-9._-]{0,24}$/.test(symbol) && tracked
    ? `Analizza ${symbol}` : "Stato Fenice oggi";
  const initialReply = answerFeniceResearch(initialQuestion,
    feniceAnalystContext, serverRequestTime());

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-24 pt-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Fenice AI · Analista di ricerca</p>
            <h1 className="mt-2 text-3xl font-black">L&apos;intelligenza di Fenice, spiegata</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Domande su mercati, titoli, rischi e strategie con risposta ancorata alle decisioni
              del comitato, qualità delle fonti e prove PAPER.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm">← Oggi</Link>
        </header>
        <FeniceAnalystConsole initialReply={initialReply} initialQuestion={initialQuestion} />
        <p className="text-xs text-slate-500">
          Il motore interpreta evidenze persistite, non osserva tutte le borse in realtime.
          È stata aggiunta un’integrazione generativa AI Gateway opzionale: si attiva solo dopo configurazione
          dell’accesso proprietario e del budget. Nessun ordine eseguibile da questa pagina.
        </p>
      </div>
    </main>
  );
}
