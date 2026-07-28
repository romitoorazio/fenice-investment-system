import Link from "next/link";
import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildEventIntelligence } from "@/lib/event-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tone(priority: string) {
  if (priority === "CRITICA") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (priority === "ALTA") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (priority === "MEDIA") return "border-sky-400/30 bg-sky-400/10 text-sky-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export default function EventsPage() {
  const report = buildEventIntelligence(snapshot as AutonomySnapshot);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-fuchsia-300">Fenice Event Intelligence</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">Notizie, eventi e catalizzatori</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Gli eventi vengono ordinati per rilevanza e qualità della prova. Nessuna notizia isolata può generare da sola una decisione operativa.</p>
          </div>
          <Link href="/discovery" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black">← Scoperte</Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          {[
            ["Eventi", report.coverage.totalSignals],
            ["Critici", report.criticalCount],
            ["Alta priorità", report.highPriorityCount],
            ["Con fonte diretta", report.coverage.withUrl],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        {report.events.length === 0 ? (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-6 text-amber-100">
            Nessun evento strutturato disponibile nell’ultimo ciclo. Fenice mantiene quindi invariati i segnali e non inventa catalizzatori.
          </section>
        ) : (
          <section className="space-y-4">
            {report.events.map((event) => (
              <article key={event.id} className={`rounded-2xl border p-6 ${tone(event.priority)}`}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">{event.category} · {event.priority}</p>
                    <h2 className="mt-2 text-xl font-black">{event.title}</h2>
                    <p className="mt-2 text-sm leading-6 opacity-90">{event.summary}</p>
                  </div>
                  <div className="text-sm font-bold">Rilevanza {event.relevance}/100</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-black/20 px-2 py-1">Impatto {event.impact}</span>
                  <span className="rounded-lg bg-black/20 px-2 py-1">Confidenza {event.confidence}/100</span>
                  <span className="rounded-lg bg-black/20 px-2 py-1">Rischio {event.risk}/100</span>
                  {event.symbol ? <span className="rounded-lg bg-black/20 px-2 py-1">Ticker {event.symbol}</span> : null}
                  <span className="rounded-lg bg-black/20 px-2 py-1">Fonte {event.source}</span>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-black uppercase tracking-wider opacity-70">Controlli richiesti</p>
                  <ul className="mt-2 space-y-1 text-sm opacity-90">
                    {event.requiredChecks.map((check) => <li key={check}>• {check}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
