import Link from "next/link";
import type { DiscoveryReport } from "@/lib/discovery-engine";

function tone(status: DiscoveryReport["candidates"][number]["status"]) {
  if (status === "PRIORITARIA") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "DA STUDIARE") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  if (status === "OSSERVARE") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

export default function DiscoveryBoard({ report }: { report: DiscoveryReport }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Fenice Discovery Engine</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">Opportunità da approfondire</h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-300">Il motore ordina i candidati usando opportunità, rischio, freschezza e affidabilità delle fonti. Una priorità non equivale a un ordine di acquisto.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
            <Link href="/data-hub" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Data Hub</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Candidati", report.candidateCount],
            ["Prioritari", report.priorityCount],
            ["Da studiare", report.studyCount],
            ["Confidenza media", `${report.averageConfidence}/100`],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          {report.candidates.slice(0, 20).map((candidate, index) => (
            <article key={candidate.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500">#{index + 1} · {candidate.category}</p>
                  <h2 className="mt-1 text-2xl font-black">{candidate.symbol}</h2>
                  <p className="mt-1 text-sm text-slate-400">{candidate.name}</p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black ${tone(candidate.status)}`}>{candidate.status}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{candidate.thesis}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {[
                  ["Priorità", candidate.priorityScore],
                  ["Opportunità", candidate.opportunityScore],
                  ["Rischio", candidate.riskScore],
                  ["Confidenza", candidate.confidenceScore],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-1 font-black">{value}/100</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {candidate.evidence.map((item) => <span key={item} className="rounded-lg bg-white/5 px-2 py-1">{item}</span>)}
              </div>
              {candidate.blockers.length > 0 && (
                <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100">
                  {candidate.blockers.join(" ")}
                </div>
              )}
            </article>
          ))}
        </section>

        {report.warnings.length > 0 && (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
            <h2 className="font-black text-amber-200">Avvertenze dati</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {report.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
