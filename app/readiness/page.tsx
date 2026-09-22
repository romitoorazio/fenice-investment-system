import Link from "next/link";
import intelligence from "@/data/intelligence-quality.json";
import { buildInstitutionalReadiness } from "@/lib/trading/readiness-evidence";
import type { InstitutionalEvidence } from "@/lib/trading/institutional-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusStyle: Record<InstitutionalEvidence, string> = {
  PASS: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  TESTING: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  MISSING: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  BLOCKED: "border-rose-400/25 bg-rose-400/10 text-rose-200",
};

const statusLabel: Record<InstitutionalEvidence, string> = {
  PASS: "PASS",
  TESTING: "IN COLLAUDO",
  MISSING: "DA COSTRUIRE",
  BLOCKED: "BLOCCANTE",
};

export default function ReadinessPage() {
  const { report, metrics } = buildInstitutionalReadiness(intelligence);
  const pass = report.controls.filter((control) => control.status === "PASS").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Fenice Safety Center</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Prontezza istituzionale</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Questa pagina misura ciò che è realmente verificato. Un controllo implementato ma non ancora provato resta in collaudo; i controlli broker descrivono la futura fase live e non rendono il feed realtime Directa a pagamento un requisito della certificazione PAPER.</p>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">Oggi</Link>
        </header>

        <section className="rounded-3xl border border-rose-400/25 bg-rose-400/[0.06] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Capitale reale</p>
              <p className="mt-2 text-3xl font-black text-rose-200">NON AUTORIZZATO</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Il live-lock di Fenice resta chiuso. Prima della certificazione servono quorum PAPER su fonti indipendenti, qualità dati e controlli di rischio verificati, recovery/audit e campagna PAPER maturata. Directa può aggiungere evidenza read-only/shadow, ma il suo feed realtime a pagamento non è obbligatorio.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Engineering score</p>
              <p className="mt-1 text-4xl font-black">{report.engineeringScore}/100</p>
              <p className="mt-1 text-xs text-slate-500">{pass}/{report.controls.length} controlli PASS</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Intelligence</p><p className="mt-2 text-xl font-black">{metrics.intelligenceConfidence}/100</p><p className="mt-1 text-[11px] text-slate-500">soglia 90</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Concentrazione fonti</p><p className="mt-2 text-xl font-black">{metrics.sourceConcentrationPercent}%</p><p className="mt-1 text-[11px] text-slate-500">target ≤ 50%</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cross-check</p><p className="mt-2 text-xl font-black">{metrics.crossChecks}</p><p className="mt-1 text-[11px] text-slate-500">divergenti {metrics.divergentChecks}</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Critical controls</p><p className="mt-2 text-xl font-black">{report.criticalPassed}/{report.criticalTotal}</p><p className="mt-1 text-[11px] text-slate-500">engineering + futura fase live</p></article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4"><h2 className="text-xl font-black">Matrice dei controlli</h2><p className="mt-1 text-xs text-slate-500">PASS = evidenza automatizzata presente. IN COLLAUDO = implementato ma manca prova operativa. DA COSTRUIRE = controllo ancora incompleto. BLOCCANTE = metrica corrente sotto soglia.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.controls.map((control) => (
              <article key={control.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{control.domain}{control.critical ? " · CRITICO" : ""}</p><h3 className="mt-1 text-sm font-black text-slate-100">{control.label}</h3></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${statusStyle[control.status]}`}>{statusLabel[control.status]}</span></div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">Benchmark: {control.benchmark}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5">
          <h2 className="text-lg font-black text-amber-200">Controlli istituzionali ancora aperti</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Questa lista include anche controlli destinati alla futura fase broker/live. La certificazione PAPER resta provider-neutral e fail-closed.</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            {report.blockers.map((control) => <p key={control.id}>• {control.label} — {statusLabel[control.status]}</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
