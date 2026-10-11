import Link from "next/link";
import FeniceAnalystConsole from "@/components/FeniceAnalystConsole";
import { answerFeniceResearch } from "@/lib/ui/fenice-grounded-analyst";
import committee from "@/data/investment-committee.json";
import quality from "@/data/intelligence-quality.json";
import sourceHealth from "@/data/global-source-health.json";
import campaign from "@/data/paper-validation-campaign.json";
import calibration from "@/data/calibration-analysis.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Capture request time outside the rendering expression for React purity.
function serverRequestTime() { return Date.now(); }

export default function FeniceAnalystPage() {
  const initialReply = answerFeniceResearch("Stato Fenice oggi",
    { committee, quality, sources: sourceHealth, campaign, calibration },
    serverRequestTime());

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
        <FeniceAnalystConsole initialReply={initialReply} />
        <p className="text-xs text-slate-500">
          Il motore interpreta evidenze persistite, non osserva tutte le borse in realtime.
          La futura integrazione di un LLM generativo richiede configurazione e autorizzazione
          separata di accesso, costi e sicurezza. Nessun ordine eseguibile da questa pagina.
        </p>
      </div>
    </main>
  );
}
