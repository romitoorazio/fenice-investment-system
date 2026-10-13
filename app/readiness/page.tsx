import Link from "next/link";
import { getAlpacaPaperClock } from "@/lib/market/alpaca-paper-clock-runtime.mjs";
import intelligence from "@/data/intelligence-quality.json";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";

import paperCampaign from "@/data/paper-validation-campaign.json";
import paperApproval from "@/data/paper-validation-approval.json";
import sourceHealth from "@/data/global-source-health.json";
import investmentCommittee from "@/data/investment-committee.json";
import forwardShadowEvidence from "@/data/v7-horizon-shadow-evaluation.json";
import { assessFenice100KRelease } from "@/lib/ui/fenice100k-release-gate.mjs";
import { assessDirectaServiceContinuity } from "@/lib/ui/directa-service-continuity";
import { summarizePaperCertificationWindow } from "@/lib/ui/paper-certification-window";
import paperOms from "@/data/paper-oms-state.json";
import engineeringValidation from "@/data/engineering-validation-evidence.json";
import { evaluateExecutionReadiness, type ExecutionReadinessState } from "@/lib/trading/execution-readiness";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { buildInstitutionalReadiness } from "@/lib/trading/readiness-evidence";
import type { InstitutionalEvidence } from "@/lib/trading/institutional-readiness";
import { executionReadinessCopy } from "@/lib/ui/execution-readiness-copy";
import { classifyPaperEvidenceState } from "@/lib/ui/paper-evidence-state";
import { derivePaperRuntimeEvidence } from "@/lib/ui/paper-runtime-evidence";
import { deriveEngineeringValidationEvidence } from "@/lib/ui/engineering-validation-evidence";
import { applyTemporalRiskReadiness } from "@/lib/ui/paper-temporal-risk";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaperEvidenceView = {
  date?: string;
  paperCycles?: number;
  cumulativePaperFilled?: number;
  newPaperFills?: number;
  reconciliationBreaks?: number;
  fillEvidenceProof?: { complete?: boolean; requiredFills?: number; coveredFills?: number };
  cumulativeRiskRejected?: number;
  openPositions?: number;
  killSwitchEngaged?: boolean;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  auditChainValid?: boolean;
  reconciliationBalanced?: boolean;
  marketSession?: {
    phase?: string;
    evidence?: {
      state?: string;
      authoritative?: boolean;
    };
    decision?: {
      allowed?: boolean;
      reasons?: string[];
    };
  };
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
  MISSING: "EVIDENZA MANCANTE",
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

function italianInstant(iso: string | null) {
  if (!iso) return "non verificabile";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Resolve the request instant outside React render calculation (same convention as /decisioni).
function serverRequestTime() {
  return Date.now();
}

export default async function ReadinessPage() {
  const livePaperClock = await getAlpacaPaperClock();
  const snapshotReadiness = evaluateExecutionReadiness(executionMarket, executionCoverage);
  const runtimeQuoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage);
  const usMarketSession = resolveVenueSession("XNAS", livePaperClock);
  const freshSessionOpen = usMarketSession.authoritative && usMarketSession.state === "OPEN";
  const executionState: ExecutionReadinessState = !runtimeQuoteGate.ready
    ? "STALE" : !freshSessionOpen ? "BLOCKED" : snapshotReadiness.state;
  const executionReadiness = {
    ...snapshotReadiness,
    state: executionState,
    verified: snapshotReadiness.verified && runtimeQuoteGate.ready && freshSessionOpen,
    reasons: [
      ...snapshotReadiness.reasons,
      ...runtimeQuoteGate.reasons,
      ...(!freshSessionOpen ? ["Apertura USA autorevole non disponibile o scaduta"] : []),
    ],
  };
  const paperRuntimeEvidence = derivePaperRuntimeEvidence(paperCampaign, paperOms);
  const engineeringEvidence = deriveEngineeringValidationEvidence(engineeringValidation);
  const persistentAuditVerified = engineeringEvidence.persistentAuditImplementationVerified
    && paperRuntimeEvidence.persistentAuditRuntimeVerified;
  const { report, metrics, temporalRiskSafety } = applyTemporalRiskReadiness(buildInstitutionalReadiness(intelligence, {
    executionMarketQuorumVerified: executionReadiness.verified,
    recoveryVerified: engineeringEvidence.crashRecoveryVerified,
    persistentAuditVerified,
    marketSessionControlsVerified: paperRuntimeEvidence.marketSessionControlsVerified,
    fxExposureVerified: paperRuntimeEvidence.fxExposureVerified,
    chaosTestsVerified: engineeringEvidence.chaosTestsVerified,
  }));
  const pass = report.controls.filter((control) => control.status === "PASS").length;
  const executionMetrics = executionReadiness.metrics;
  const paperCampaignView = paperCampaign as unknown as PaperCampaignView;
  const campaignVersion = Math.max(1, Number(paperCampaignView.version || 1));

  const paperEvidence = Array.isArray(paperCampaignView.dailyEvidence) ? paperCampaignView.dailyEvidence : [];
  const latestPaperEvidence = paperEvidence.at(-1);
  const calendar = summarizePaperCertificationWindow(paperCampaignView, paperApproval, serverRequestTime());
  // The cloud deployment cannot inspect a localhost Directa/Darwin session.
  const directaContinuity = assessDirectaServiceContinuity();
  const releaseGate = assessFenice100KRelease({
    sourceHealth,
    committee: investmentCommittee,
    shadow: forwardShadowEvidence,
    engineeringEvidence: engineeringValidation,
    paperWindow: calendar,
    paperApproval,
    now: new Date(),
  });
  const evidenceDays = calendar.evidenceDays;
  const campaignAgeDays = calendar.elapsedDays;
  const requiredDays = calendar.requiredDays ?? 30;
  const minEvidenceDays = calendar.requiredEvidenceDays ?? 25;
  const minPaperFills = calendar.requiredFills ?? 10;
  const paperFills = calendar.reportedFills;
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
  const latestPaperEvidenceState = latestPaperEvidence ? classifyPaperEvidenceState(latestPaperEvidence) : "RECORDED";
  const protectedNoTrade = latestPaperEvidenceState === "RISK_REJECTED_NO_TRADE";
  const marketClosedNoTrade = latestPaperEvidenceState === "MARKET_CLOSED_NO_RISK";
  const noRiskEvidence = protectedNoTrade || marketClosedNoTrade;
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
          <div className="flex flex-wrap gap-2">
            <Link href="/mercati" className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-bold text-cyan-200">Mercati</Link>
            <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">Oggi</Link>
          </div>
        </header>

        <section aria-label="FENICE100K release acceptance" className="rounded-3xl border border-cyan-400/25 bg-cyan-400/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">13–31 ottobre · audit di rilascio</p>
              <h2 className="mt-1 text-xl font-black">FENICE100K · Collaudo finale</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Stato: <strong>{releaseGate.overall === "RESEARCH_USABLE_NOT_CERTIFIED"
                  ? "Ricerca utilizzabile, certificazione incompleta"
                  : releaseGate.overall === "SAFETY_BLOCKED"
                    ? "Blocco di sicurezza da esaminare"
                    : "Verifiche ricerca ancora incomplete"}</strong>.
                {" "}Non siamo autorizzati a operare con capitale reale:
                {" "}<strong>{releaseGate.completeForRealCapital ? "SÌ" : "NO"}</strong>.
                Nessun guadagno reale verificato: <strong>{releaseGate.verifiedProfit ? "SÌ" : "N/D"}</strong>.
              </p>
            </div>
            <span className="rounded-xl border border-amber-400/30 px-3 py-2 text-xs font-bold text-amber-200">
              LIVE: {releaseGate.gates.liveLock.state === "LOCKED" ? "BLOCCATO" : "ANOMALIA SICUREZZA"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-bold text-white">1. Data Quality</p>
              <p className="mt-1 text-xs text-slate-300">
                {releaseGate.gates.dataQuality.state === "RESEARCH_DATA_CURRENT" ? "Dati ricerca aggiornati" : "Dati scaduti o non verificabili"}
                {" "}· punteggio {releaseGate.gates.dataQuality.score ?? "N/D"}/100
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {releaseGate.gates.dataQuality.analyzedSymbols} strumenti analizzati;
                {" "}{releaseGate.gates.dataQuality.timestampedSingleFamilyResearchQuotes} prezzi con timestamp Yahoo verificato.
                Una sola fonte di ricerca non abilita esecuzione.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-bold text-white">2. Risk/System Tests</p>
              <p className="mt-1 text-xs text-slate-300">
                {releaseGate.gates.riskSystem.state === "HISTORICAL_MAIN_CI_VERIFIED"
                  ? "CI storica verificata"
                  : "Prove CI non aggiornate"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                SHA provato: {releaseGate.gates.riskSystem.validatedCommit?.slice(0,8) ?? "N/D"}.
                Il deploy attuale richiede sempre una verifica separata dello stesso commit.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-bold text-white">3. PAPER Certification</p>
              <p className="mt-1 text-xs font-semibold text-amber-200">NON CERTIFICATA</p>
              <p className="mt-1 text-xs text-slate-400">
                {releaseGate.gates.paperCertification.verifiedEvidenceDays ?? "N/D"}/
                {releaseGate.gates.paperCertification.requiredEvidenceDays ?? "N/D"} giornate verificate,
                {" "}{releaseGate.gates.paperCertification.reportedFills ?? "N/D"}/
                {releaseGate.gates.paperCertification.requiredFills ?? "N/D"} fill riportati.
                Minimo temporale {italianInstant(releaseGate.gates.paperCertification.earliestMaturityAt)}.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-bold text-white">4. Vantaggio economico SHADOW</p>
              <p className="mt-1 text-xs font-semibold text-amber-200">
                {releaseGate.gates.performance.state === "NOT_PROVEN" ? "NON DIMOSTRATO" : "Campione da revisionare"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {releaseGate.gates.performance.researchRecords} esperimenti;
                {" "}7 giorni: {releaseGate.gates.performance.benchmark7d.pairs ?? "N/D"} confronti,
                {" "}30 giorni: {releaseGate.gates.performance.benchmark30d.pairs ?? "N/D"} confronti.
                Profitti del conto Directa: N/D.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 p-3">
            <h3 className="text-sm font-bold text-white">Cosa manca per completare Fenice100K</h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs leading-5 text-slate-300">
              {releaseGate.blockers.map((blocker) => (
                <li key={blocker.id}>
                  <strong>{blocker.severity}</strong> · {blocker.detail}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-500">
              Valutazione informativa al {italianInstant(releaseGate.assessedAt)}.
              Il cruscotto non può certificare PAPER, rinnovare autorizzazioni, verificare il conto Directa
              né impartire operazioni reali.
            </p>
          </div>
        </section>

        <section aria-label="Directa continuità dopo disservizi" className="rounded-2xl border border-amber-400/30 p-4">
          <h2 className="text-base font-black text-amber-200">Directa · continuità operativa</h2>
          <p className="mt-2 text-sm text-slate-200">
            Evidenza connessione locale: <strong>{directaContinuity.state === "NOT_VERIFIED" ? "NON VERIFICATA" : directaContinuity.state}</strong>.
            Dopo una disconnessione, il riavvio di Darwin o un disservizio, non presumere che gli ordini precedenti siano falliti:
            prima occorrono un nuovo snapshot, le liste complete di ordini e posizioni, la riconciliazione e la revisione dell&apos;operatore.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            L&apos;app online non può controllare la sessione dAPI localhost del tuo PC.
            I parametri configurati su Vercel non attestano liquidità, ordini o posizioni su Directa.
            Questo controllo è informativo: non sblocca PAPER, SHADOW o LIVE e non invia ordini.
          </p>
        </section>

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

        {calendar.preExpiryOperatorAttentionRequired && (
          <section aria-label="Revisione operatore prima della scadenza PAPER" className="rounded-2xl border border-amber-400/50 bg-amber-400/[0.08] p-4">
            <h2 className="text-base font-black text-amber-200">FENICE100K · Revisione umana prima della scadenza PAPER</h2>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Autorizzazione per NUOVI probe PAPER in scadenza entro{" "}
              <strong>{calendar.daysUntilProbeExpiry ?? "N/D"} giorni</strong>
              {" "}(termine: <strong>{italianInstant(calendar.authorizationExpiresAt)}</strong>).
              Nel registro risultano ancora <strong>{calendar.missingAuthorizedFills ?? "N/D"} fill PAPER mancanti</strong>
              {" "}rispetto al minimo richiesto. Giornate con prova di integrità ancora da raccogliere:
              {" "}<strong>{calendar.missingVerifiedEvidenceDays ?? "N/D"}</strong>.
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-100">
              È necessaria una revisione con il proprietario prima del termine: verificare la copertura delle fonti,
              la disponibilità di nuove operazioni PAPER consentite e, solo se indispensabile,
              una nuova approvazione esplicita secondo policy. Non prolungare la vecchia autorizzazione,
              non generare fill artificiali, non retrodatare prove e non modificare il fingerprint V6.
              Le osservazioni passive possono proseguire dopo la scadenza; il LIVE resta bloccato.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Avviso informativo basato sul registro: non rinnova approvazioni e non concede permessi.
              <a href="https://github.com/romitoorazio/fenice-investment-system/issues/226"
                className="ml-2 font-semibold text-amber-200 underline" target="_blank" rel="noopener noreferrer">
                Procedura e blocco #226
              </a>
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4" aria-label="Autorizzazione e durata PAPER">
          <p className="text-sm font-bold text-amber-200">
            {calendar.ownerActionRequired ? "Nuovi probe PAPER: intervento necessario" : "Nuovi probe PAPER e maturazione: finestre separate"}
          </p>
          <p className="mt-2 text-sm text-slate-200">
            Scadenza per nuovi probe: <strong>{italianInstant(calendar.authorizationExpiresAt)}</strong>.
            Prima maturazione possibile dei 30 giorni: <strong>{italianInstant(calendar.earliestMaturityAt)}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {calendar.state === "INVALID_POLICY"
              ? "Autorizzazione o calendario non verificabili: nessun nuovo probe consentito."
              : calendar.evidenceIntegrityReviewRequired
                ? "Almeno una giornata registrata non presenta tutte le prove di integrità richieste, o il conteggio dei fill non è coerente. Non viene conteggiata come giornata verificata; controllare l'audit V6."
              : calendar.fillCounterHistoryInvalid
                ? "Lo storico dei conteggi contiene valori invalidi o prove discordanti: verificare il registro prima di considerare completa la campagna."
              : calendar.fillCounterRegressionDetected
                ? "Il conteggio dei fill diminuisce rispetto alle prove precedenti: verificare il registro prima di considerare completa la campagna."
              : calendar.postExpiryFillIncreaseDetected
                ? "Il conteggio dei fill aumenta in una prova successiva alla scadenza: serve una verifica dell'autorizzazione e dei tempi effettivi. La maturazione non viene dichiarata completa."
              : calendar.approvalRenewalRequiredForMissingFills
                ? "La finestra dei nuovi probe è scaduta e il campione di fill è incompleto: per aggiungere fill serve una nuova approvazione verificata. Le prove storiche restano conservate."
                : calendar.authorizationExpired
                  ? "Nuovi probe sospesi. Le prove già raccolte e la maturazione passiva proseguono senza estendere l'autorizzazione. Nessuna certificazione automatica."
                  : "La scadenza riguarda i nuovi probe, non le prove già raccolte. La campagna può maturare dopo la scadenza: servono comunque tutti i fill, i giorni e i controlli previsti."}
          </p>
          <p className="mt-2 text-xs text-amber-100/80">
            Ultima evidenza registrata: {calendar.latestEvidenceDate ?? "non verificabile"} ·
            Giornate registrate {calendar.evidenceDays}/{minEvidenceDays} ·
            Con prova di integrità {calendar.verifiedEvidenceDays}/{minEvidenceDays} ·
            Fill dichiarati {calendar.reportedFills}/{minPaperFills} ·
            Nessuna modifica automatica alla V6; trading reale sempre bloccato.
          </p>
        </section>

        {!temporalRiskSafety.coreVerified && (
          <section className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.04] p-4" aria-label="Integrità temporale del rischio">
            <p className="text-sm font-bold text-rose-200">Controllo temporale del rischio: correzione del core in attesa</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              La revisione Sì/No blocca date future, invalide e scadute con un controllo aggiuntivo.
              Il modulo V6 congelato richiede ancora la correzione delle date future: il suo gate resta in collaudo.
              Le evidenze della campagna sono conservate e gli ordini reali rimangono bloccati.
            </p>
          </section>
        )}

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
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Evidenza runtime V6 persistita: sessioni <strong className="text-slate-300">{paperRuntimeEvidence.marketSessionControlsVerified ? `PASS (OPEN ${paperRuntimeEvidence.marketSessionOpenEvidenceDate || "n/d"} + blocco ${paperRuntimeEvidence.marketSessionBlockedEvidenceDate || "n/d"})` : "da verificare"}</strong> · FX exposure <strong className="text-slate-300">{paperRuntimeEvidence.fxExposureVerified ? `PASS (${paperRuntimeEvidence.fxTotalForeignExposurePercent ?? "n/d"}%)` : "da verificare"}</strong> · audit persistente <strong className="text-slate-300">{persistentAuditVerified ? `PASS (${paperRuntimeEvidence.auditChainEvents} eventi / ${paperRuntimeEvidence.auditEvidenceDays} giorni)` : "da verificare"}</strong>. Questi PASS aggiornano la completezza engineering senza aprire LIVE e senza modificare il fingerprint V6.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Giorni evidenza</p><p className="mt-1 text-lg font-black">{evidenceDays}/{minEvidenceDays}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(evidenceDays, minEvidenceDays)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Durata campagna</p><p className="mt-1 text-lg font-black">{campaignAgeDays}/{requiredDays}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(campaignAgeDays, requiredDays)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Fill PAPER</p><p className="mt-1 text-lg font-black">{paperFills}/{minPaperFills}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-300" style={{ width: `${boundedPercent(paperFills, minPaperFills)}%` }} /></div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">Risk rejected</p><p className="mt-1 text-lg font-black">{riskRejected}</p><p className="mt-1 text-[10px] text-slate-500">tentativi bloccati in sicurezza</p></div>
            </div>
          </div>

          {latestPaperEvidence && (
            <div className={`mt-4 rounded-2xl border p-4 ${noRiskEvidence ? "border-amber-300/20 bg-amber-300/[0.05]" : "border-white/10 bg-black/20"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Ultima evidenza · {latestPaperEvidence.date || "n/d"}</p>
                  <p className="mt-1 text-sm font-black text-slate-200">
                    {marketClosedNoTrade
                      ? "MERCATO CHIUSO: evidence no-risk registrata"
                      : protectedNoTrade
                        ? "NO-TRADE PROTETTO: nessun fill forzato"
                        : "Ciclo PAPER registrato"}
                  </p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                    {marketClosedNoTrade
                      ? "La sessione autorevole risulta chiusa e il gate operativo ha negato nuove esecuzioni. Zero fill, audit e riconciliazione sono persistiti: la giornata conta come evidence di sicurezza, non come attività di mercato."
                      : protectedNoTrade
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
                  ?? executionReadinessCopy(executionReadiness.reasons[0])
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

        <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Engineering validation evidence</p>
              <h2 className="mt-2 text-lg font-black">{engineeringEvidence.valid ? "CI MAIN CERTIFICATA" : "IN ATTESA DI PROVA CI PERSISTITA"}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Il registro accetta solo una Fenice Production CI conclusa con successo su <strong>main/push</strong>. La prova CI non può autorizzare LIVE né broker connectivity.
              </p>
              {engineeringEvidence.valid && (
                <p className="mt-2 text-xs text-slate-500">
                  Run <strong className="text-slate-300">#{engineeringEvidence.workflowRunId}</strong> · commit <span className="font-mono text-slate-300">{String(engineeringEvidence.validatedCommit || "").slice(0, 12)}</span> · recovery <strong className="text-slate-300">{engineeringEvidence.crashRecoveryVerified ? "PASS" : "CHECK"}</strong> · chaos <strong className="text-slate-300">{engineeringEvidence.chaosTestsVerified ? "PASS" : "CHECK"}</strong>.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
              <p className="text-[9px] font-bold uppercase text-slate-500">LIVE</p>
              <p className="mt-1 text-sm font-black text-rose-200">BLOCCATO</p>
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
          <div className="mb-4"><h2 className="text-xl font-black">Matrice dei controlli</h2><p className="mt-1 text-xs text-slate-500">PASS = evidenza automatizzata presente. IN COLLAUDO = implementato ma manca prova operativa. EVIDENZA MANCANTE = la prova certificante richiesta non è ancora disponibile; non significa necessariamente che il modulo software sia assente. BLOCCANTE = metrica corrente sotto soglia.</p></div>
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
