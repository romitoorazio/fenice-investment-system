import Link from "next/link";
import intelligence from "@/data/intelligence-quality.json";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import paperCampaign from "@/data/paper-validation-campaign.json";
import { evaluateExecutionReadiness, type ExecutionReadinessState } from "@/lib/trading/execution-readiness";
import { buildInstitutionalReadiness } from "@/lib/trading/readiness-evidence";
import type { InstitutionalEvidence } from "@/lib/trading/institutional-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaperEvidenceView = {
  date?: string;
  paperCycles?: number;
  cumulativePaperFilled?: number;
  newPaperFills?: number;
  cumulativeRiskRejected?: number;
  openPositions?: number;
  killSwitchEngaged?: boolean;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  auditChainValid?: boolean;
  reconciliationBalanced?: boolean;
  validationFingerprint?: {
    digest?: string;
    complete?: boolean;
  };
  decisionDataGate?: {
    ready?: boolean;
    confidence?: number;
    crossChecks?: number;
    marketSources?: number;
    sourceConcentrationPercent?: number;
    reasons?: string[];
  };
  executionMarketCoverage?: {
    ready?: boolean;
    paperEligibleSymbols?: number;
    requestedSymbols?: number;
    paperEligiblePercent?: number;
    paperEligibleSourceFamilies?: number;
  };
  executionQuality?: {
    state?: string;
    fills?: number;
  };
};

type PaperCampaignView = {
  version?: number;
  startedAt?: string | null;
  baselineCommit?: string | null;
  baselineFingerprint?: {
    digest?: string;
    complete?: boolean;
  } | null;
  requiredDays?: number;
  minEvidenceDays?: number;
  minPaperFills?: number;
  liveTradingAllowed?: boolean;
  dailyEvidence?: PaperEvidenceView[];
  baselineEligibility?: {
    metrics?: {
      intelligenceConfidence?: number;
      crossChecks?: number;
      paperEligibleSymbols?: number;
      requestedExecutionSymbols?: number;
      paperEligiblePercent?: number;
      paperEligibleSourceFamilies?: number;
    };
  };
  evidencePolicy?: {
    preferredIndependentPaperSourceFamilies?: number;
    minimumIndependentPaperSourceFamilies?: number;
  };
};

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

const executionStateStyle: Record<ExecutionReadinessState, string> = {
  PASS: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  BLOCKED: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  STALE: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  UNCONFIGURED: "border-sky-400/25 bg-sky-400/10 text-sky-200",
};

const executionStateLabel: Record<ExecutionReadinessState, string> = {
  PASS: "QUORUM PAPER VERIFICATO",
  BLOCKED: "QUORUM PAPER BLOCCATO",
  STALE: "EVIDENZA DA AGGIORNARE",
  UNCONFIGURED: "FONTI GRATUITE DA CONFIGURARE",
};

function boundedPercent(value: number, target: number) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function elapsedCalendarDays(startedAt: string | null | undefined, now = Date.now()) {
  const startedAtMs = Date.parse(String(startedAt || ""));
  if (!Number.isFinite(startedAtMs)) return 0;
  return Math.max(0, Math.floor((now - startedAtMs) / 86_400_000));
}

export default function ReadinessPage() {
  const executionReadiness = evaluateExecutionReadiness(executionMarket, executionCoverage);
  const { report, metrics } = buildInstitutionalReadiness(intelligence, {
    executionMarketQuorumVerified: executionReadiness.verified,
  });
  const pass = report.controls.filter((control) => control.status === "PASS").length;
  const executionMetrics = executionReadiness.metrics;
  const paperCampaignView = paperCampaign as unknown as PaperCampaignView;
  const campaignVersion = Math.max(1, Number(paperCampaignView.version || 1));

  const paperEvidence = Array.isArray(paperCampaignView.dailyEvidence) ? paperCampaignView.dailyEvidence : [];
  const latestPaperEvidence = paperEvidence.at(-1);
  const evidenceDays = new Set(paperEvidence.map((item) => item.date).filter(Boolean)).size;
  const campaignAgeDays = elapsedCalendarDays(paperCampaignView.startedAt);
  const requiredDays = Number(paperCampaignView.requiredDays || 30);
  const minEvidenceDays = Number(paperCampaignView.minEvidenceDays || 25);
  const minPaperFills = Number(paperCampaignView.minPaperFills || 10);
  const paperFills = Number(latestPaperEvidence?.cumulativePaperFilled || 0);
  const riskRejected = Number(latestPaperEvidence?.cumulativeRiskRejected || 0);
  const preferredSourceFamilies = Number(paperCampaignView.evidencePolicy?.preferredIndependentPaperSourceFamilies || 3);
  const minimumSourceFamilies = Number(paperCampaignView.evidencePolicy?.minimumIndependentPaperSourceFamilies || 2);
  const executionQualityState = String(latestPaperEvidence?.executionQuality?.state || (paperCampaignView.startedAt ? "IN ATTESA" : "NON AVVIATA"));
  const executionQualityFills = Number(latestPaperEvidence?.executionQuality?.fills || 0);
  const baselineDigest = String(paperCampaignView.baselineFingerprint?.digest || "");
  const latestEvidenceDigest = String(latestPaperEvidence?.validationFingerprint?.digest || "");
  const fingerprintMatches = Boolean(
    baselineDigest
    && latestEvidenceDigest
    && paperCampaignView.baselineFingerprint?.complete === true
    && latestPaperEvidence?.validationFingerprint?.complete === true
    && baselineDigest === latestEvidenceDigest,
  );
  const campaignSafe = paperCampaignView.liveTradingAllowed === false
    && (!latestPaperEvidence || (latestPaperEvidence.liveTradingAllowed === false && latestPaperEvidence.brokerConnectivityAllowed === false));
  const protectedNoTrade = Boolean(
    latestPaperEvidence
    && Number(latestPaperEvidence.newPaperFills || 0) === 0
    && riskRejected > 0
    && latestPaperEvidence.auditChainValid === true
    && latestPaperEvidence.reconciliationBalanced === true
    && latestPaperEvidence.liveTradingAllowed === false
    && latestPaperEvidence.brokerConnectivityAllowed === false,
  );
  const baselineMetrics = paperCampaignView.baselineEligibility?.metrics;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Fenice Safety Center</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Prontezza istituzionale</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Questa pagina usa i gate reali disponibili nel repository. Un controllo implementato ma non ancora provato resta in collaudo; Directa può aggiungere evidenza read-only/shadow, ma il suo feed realtime a pagamento non è un requisito della certificazione PAPER.</p>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">Oggi</Link>
        </header>

        <section className="rounded-3xl border border-rose-400/25 bg-rose-400/[0.06] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Capitale reale</p>
              <p className="mt-2 text-3xl font-black text-rose-200">NON AUTORIZZATO</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Il live-lock di Fenice resta chiuso. Prima della certificazione servono quorum PAPER su fonti indipendenti, qualità dati e controlli di rischio verificati, recovery/audit e campagna PAPER maturata.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Engineering score</p>
              <p className="mt-1 text-4xl font-black">{report.engineeringScore}/100</p>
              <p className="mt-1 text-xs text-slate-500">{pass}/{report.controls.length} controlli PASS</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-violet-400/20 bg-violet-400/[0.05] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Campagna PAPER certificante</p>
                <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${campaignSafe ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`}>
                  {campaignSafe ? "LIVE LOCK OK" : "SAFETY CHECK"}
                </span>
                {paperCampaignView.startedAt && (
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${fingerprintMatches ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`}>
                    {fingerprintMatches ? `FINGERPRINT V${campaignVersion} OK` : "FINGERPRINT CHECK"}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-xl font-black">{paperCampaignView.startedAt ? "Evidenza operativa in maturazione" : "Nuova baseline PAPER da avviare"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">La campagna non viene retrodatata: deve accumulare giorni reali, fill PAPER e qualità di esecuzione mantenendo fingerprint, audit, riconciliazione e blocco LIVE invariati.</p>
              <p className="mt-2 text-xs text-slate-500">Baseline: <span className="font-mono text-slate-400">{String(paperCampaignView.baselineCommit || "n/d").slice(0, 10)}</span> · SHA-256: <span className="font-mono text-slate-400">{baselineDigest ? `${baselineDigest.slice(0, 10)}…` : "n/d"}</span> · Execution quality: <strong className="text-slate-300">{executionQualityState}</strong> ({executionQualityFills}/{minPaperFills} fill campione)</p>
              {baselineMetrics && (
                <p className="mt-2 text-xs leading-5 text-slate-500">Baseline fissata con intelligence <strong className="text-slate-300">{Number(baselineMetrics.intelligenceConfidence || 0)}/100</strong>, {Number(baselineMetrics.crossChecks || 0)} cross-check e copertura PAPER <strong className="text-slate-300">{Number(baselineMetrics.paperEligibleSymbols || 0)}/{Number(baselineMetrics.requestedExecutionSymbols || 0)} ({Number(baselineMetrics.paperEligiblePercent || 0)}%)</strong> su {Number(baselineMetrics.paperEligibleSourceFamilies || 0)} famiglie indipendenti.</p>
              )}
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Giorni evidenza</p><p className="mt-1 text-lg font-black">{evidenceDays}/{minEvidenceDays}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(evidenceDays, minEvidenceDays)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Durata campagna</p><p className="mt-1 text-lg font-black">{campaignAgeDays}/{requiredDays}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(campaignAgeDays, requiredDays)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Fill PAPER</p><p className="mt-1 text-lg font-black">{paperFills}/{minPaperFills}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(paperFills, minPaperFills)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Risk rejected</p><p className="mt-1 text-lg font-black">{riskRejected}</p><p className="mt-1 text-[10px] text-slate-500">tentativi bloccati in sicurezza</p></div>
            </div>
          </div>

          {latestPaperEvidence && (
            <div className={`mt-4 rounded-2xl border p-4 ${protectedNoTrade ? "border-amber-300/20 bg-amber-300/[0.05]" : "border-white/10 bg-black/20"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Ultima evidenza · {latestPaperEvidence.date || "n/d"}</p>
                  <p className="mt-1 text-sm font-black text-slate-200">{protectedNoTrade ? "NO-TRADE PROTETTO: nessun fill forzato" : "Ciclo PAPER registrato"}</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                    {protectedNoTrade
                      ? "Il risk engine ha rifiutato il tentativo perché la qualità dati locale era sotto soglia. Audit e riconciliazione restano validi: un blocco prudenziale senza fill non viene trasformato in una falsa esecuzione."
                      : "Lo stato del giorno deriva esclusivamente dall'evidenza PAPER persistita; nessun dato LIVE viene usato per maturare la campagna."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[9px] font-black">
                  <span className={`rounded-full border px-2 py-1 ${latestPaperEvidence.auditChainValid ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`}>AUDIT {latestPaperEvidence.auditChainValid ? "OK" : "CHECK"}</span>
                  <span className={`rounded-full border px-2 py-1 ${latestPaperEvidence.reconciliationBalanced ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`}>RECON {latestPaperEvidence.reconciliationBalanced ? "OK" : "CHECK"}</span>
                  <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-sky-200">POSIZIONI {Number(latestPaperEvidence.openPositions || 0)}</span>
                </div>
              </div>
              {latestPaperEvidence.decisionDataGate && (
                <p className="mt-3 text-[11px] leading-5 text-slate-500">Gate dati del ciclo: confidence <strong className="text-slate-300">{Number(latestPaperEvidence.decisionDataGate.confidence || 0)}/100</strong> · cross-check {Number(latestPaperEvidence.decisionDataGate.crossChecks || 0)} · fonti mercato {Number(latestPaperEvidence.decisionDataGate.marketSources || 0)} · concentrazione {Number(latestPaperEvidence.decisionDataGate.sourceConcentrationPercent || 0)}%{latestPaperEvidence.decisionDataGate.reasons?.[0] ? ` · ${latestPaperEvidence.decisionDataGate.reasons[0]}` : ""}</p>
              )}
            </div>
          )}
        </section>

        <section className={`rounded-3xl border p-5 ${executionStateStyle[executionReadiness.state]}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">PAPER execution data · stato corrente</p>
              <h2 className="mt-2 text-xl font-black">{executionStateLabel[executionReadiness.state]}</h2>
              <p className="mt-2 text-sm leading-6 opacity-90">
                {executionReadiness.ownerAction
                  ?? executionReadiness.reasons[0]
                  ?? "Due o più famiglie indipendenti con provenienza verificata stanno soddisfacendo il quorum PAPER."}
              </p>
              <p className="mt-2 text-xs opacity-70">Quorum minimo: <strong>{minimumSourceFamilies}</strong> famiglie. Ridondanza professionale preferita: <strong>{preferredSourceFamilies}</strong>. Directa realtime a pagamento richiesto: <strong>{executionMetrics.directaPaidRealtimeRequired ? "sì" : "no"}</strong>. Evidenza Directa opzionale per PAPER: <strong>{executionMetrics.directaEvidenceOptionalForPaperCertification ? "sì" : "no"}</strong>.</p>
              {paperCampaignView.startedAt && executionReadiness.state === "STALE" && (
                <p className="mt-3 rounded-xl border border-current/15 bg-black/15 px-3 py-2 text-[11px] leading-5 opacity-80">Le quote execution hanno una finestra stretta di freschezza e diventano intenzionalmente STALE dopo il limite operativo. Questo blocca nuovi fill finché il ciclo successivo non rigenera evidenza fresca, ma non modifica da solo la baseline v{campaignVersion} già fissata né il suo fingerprint.</p>
              )}
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-current/15 bg-black/15 p-3"><p className="text-[9px] font-bold uppercase opacity-60">Simboli PAPER</p><p className="mt-1 text-lg font-black">{executionMetrics.paperEligibleSymbols}/{executionMetrics.requestedSymbols}</p></div>
              <div className="rounded-xl border border-current/15 bg-black/15 p-3"><p className="text-[9px] font-bold uppercase opacity-60">Famiglie verificate</p><p className="mt-1 text-lg font-black">{executionMetrics.paperEligibleSourceFamilies}/{preferredSourceFamilies}</p><p className="mt-1 text-[9px] opacity-60">minimo {minimumSourceFamilies}</p></div>
              <div className="rounded-xl border border-current/15 bg-black/15 p-3"><p className="text-[9px] font-bold uppercase opacity-60">Fonti zero-cost</p><p className="mt-1 text-lg font-black">{executionMetrics.configuredZeroCostSourceFamilies}/{minimumSourceFamilies}</p></div>
              <div className="rounded-xl border border-current/15 bg-black/15 p-3"><p className="text-[9px] font-bold uppercase opacity-60">Copertura</p><p className="mt-1 text-lg font-black">{executionMetrics.paperEligiblePercent}%</p></div>
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
