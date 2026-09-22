import { readFile } from "node:fs/promises";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";

const requireReady = process.argv.includes("--require-ready");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [sources, intelligence, executionMarket, executionCoverage, governance, ledger, terminal, research, strategyLab, paperCampaign] = await Promise.all([
  readJson("data/global-source-health.json"),
  readJson("data/intelligence-quality.json"),
  readJson("data/execution-market-evidence.json"),
  readJson("data/execution-market-coverage.json"),
  readJson("data/decision-governance.json"),
  readJson("data/decision-ledger.json"),
  readJson("data/terminal-intelligence.json"),
  readJson("data/fundamental-research.json"),
  readJson("data/strategy-lab.json"),
  readJson("data/paper-validation-campaign.json"),
]);

const now = Date.now();
const ageHours = (timestamp) => {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : Number.POSITIVE_INFINITY;
};

const reportAgeHours = ageHours(sources?.generatedAt);
const sourceReportFresh = reportAgeHours >= 0 && reportAgeHours <= 24;
const intelligenceReportAgeHours = ageHours(intelligence?.generatedAt);
const intelligenceReportFresh = intelligenceReportAgeHours >= 0 && intelligenceReportAgeHours <= 24;
const criticalFailures = Array.isArray(sources?.critical?.failures) ? sources.critical.failures : [];
const sourceFallbacksSafe = criticalFailures.every((id) => {
  const source = Array.isArray(sources?.sources) ? sources.sources.find((item) => item.id === id) : null;
  if (!source || source.status !== "degraded" || source.stale !== true || !source.lastSuccessfulAt) return false;
  const staleAgeHours = ageHours(source.lastSuccessfulAt);
  return staleAgeHours >= 0 && staleAgeHours <= 24;
});

const criticalSourceRows = Array.isArray(sources?.sources)
  ? sources.sources.filter((source) => source?.critical === true)
  : [];
const criticalSourcesFresh = criticalSourceRows.length > 0
  && criticalSourceRows.every((source) => {
    const checkedAge = ageHours(source?.checkedAt);
    const successfulAge = ageHours(source?.lastSuccessfulAt);
    const checkedFresh = checkedAge >= 0 && checkedAge <= 24;
    const successFresh = successfulAge >= 0 && successfulAge <= 24;

    if (source?.status === "healthy") return checkedFresh && successFresh;
    if (source?.status === "degraded" && source?.stale !== true) return checkedFresh && successFresh;
    if (source?.status === "degraded" && source?.stale === true) return successFresh;
    return false;
  });

const criticalCountMatches = Number(sources?.critical?.total || 0) > 0
  && criticalSourceRows.length === Number(sources?.critical?.total || 0)
  && Number(sources?.critical?.ready || 0) <= criticalSourceRows.length;
const sourceReady = sourceReportFresh
  && criticalSourcesFresh
  && criticalCountMatches
  && (sources?.critical?.gate === "GREEN" || (criticalFailures.length > 0 && sourceFallbacksSafe));

const crossChecks = Number(intelligence?.crossSourceValidation?.checked || 0);
const crossDivergent = Number(intelligence?.crossSourceValidation?.divergent || 0);
const validationFreshnessPolicyReady = intelligence?.policy?.unknownTimestampEvidenceExcluded === true
  && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.crypto) > 0
  && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.crypto) <= 4
  && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.traditional) > 0
  && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.traditional) <= 96;
const crossValidationReady = intelligenceReportFresh && crossChecks >= 10 && crossDivergent === 0;
const dataQualityReady = intelligenceReportFresh
  && Number(intelligence?.intelligenceConfidence || 0) >= 90
  && Number(intelligence?.coverage?.sourceConcentrationPercent || 100) <= 50
  && Number(intelligence?.coverage?.marketSources || 0) >= 3
  && Array.isArray(intelligence?.coverage?.assetClasses)
  && intelligence.coverage.assetClasses.length >= 3
  && validationFreshnessPolicyReady
  && crossValidationReady;

const executionEvidenceAgeMinutes = ageHours(executionMarket?.generatedAt) * 60;
const executionCoverageAgeMinutes = ageHours(executionCoverage?.generatedAt) * 60;
const executionEvidenceFresh = executionEvidenceAgeMinutes >= 0 && executionEvidenceAgeMinutes <= 30;
const executionCoverageFresh = executionCoverageAgeMinutes >= 0 && executionCoverageAgeMinutes <= 30;
const executionEvidenceTimestamp = Date.parse(String(executionMarket?.generatedAt || ""));
const coverageEvidenceTimestamp = Date.parse(String(executionCoverage?.evidenceGeneratedAt || ""));
const executionCoverageMatchesEvidence = Number.isFinite(executionEvidenceTimestamp)
  && Number.isFinite(coverageEvidenceTimestamp)
  && Math.abs(executionEvidenceTimestamp - coverageEvidenceTimestamp) <= 1000;
const requestedExecutionSymbols = Math.max(0, Number(executionCoverage?.requestedSymbols || 0));
const paperEligibleSymbols = Math.max(0, Number(executionCoverage?.paperEligibleSymbols || 0));
const paperEligiblePercent = Math.max(0, Number(executionCoverage?.paperEligiblePercent || 0));
const executionObservations = Array.isArray(executionMarket?.observations) ? executionMarket.observations : [];
const unverifiedPaperObservations = executionObservations.filter((row) =>
  (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified !== true,
);
const paperEligibleSourceFamilies = new Set(
  executionObservations
    .filter((row) => (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified === true)
    .map((row) => String(row?.sourceFamily || "").trim().toLowerCase())
    .filter(Boolean),
);
const approvedIndependentPaperSourceFamilies = Array.isArray(executionCoverage?.policy?.approvedIndependentPaperSourceFamilies)
  ? executionCoverage.policy.approvedIndependentPaperSourceFamilies.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  : [];
const preferredZeroCostPaperSourceFamilies = Array.isArray(executionCoverage?.policy?.preferredZeroCostPaperSourceFamilies)
  ? executionCoverage.policy.preferredZeroCostPaperSourceFamilies.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  : [];
const executionEvidencePolicyReady = Number(executionMarket?.version || 0) >= 10
  && executionMarket?.policy?.liveTradingAllowed === false
  && executionMarket?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true
  && executionMarket?.policy?.untaggedLegacyEvidenceDefaultsToValidationOnly === true
  && executionMarket?.policy?.providerVenueMustBeVerifiedBeforePaperEligibility === true
  && executionMarket?.policy?.delayedIntradayEvidenceNeverSatisfiesPaperQuorum === true
  && executionMarket?.policy?.paperEligibilityRequiresExplicitRealtimeAndEntitlement === true
  && executionMarket?.policy?.paperEligibilityRequiresVerifiedProvenance === true;
const zeroCostCoveragePolicyReady = Number(executionCoverage?.version || 0) >= 6
  && executionCoverage?.policy?.requiredEligibility === "PAPER"
  && Number(executionCoverage?.policy?.minIndependentSourceFamilies || 0) >= 2
  && Number(executionCoverage?.policy?.preferredIndependentSourceFamilies || 0) >= 3
  && executionCoverage?.policy?.directaPaidRealtimeRequired === false
  && executionCoverage?.policy?.directaEvidenceOptionalForPaperCertification === true
  && executionCoverage?.policy?.validationOnlyEvidenceCannotSatisfyPaperQuorum === true
  && executionCoverage?.policy?.paperEligibilityRequiresVerifiedProvenance === true
  && approvedIndependentPaperSourceFamilies.length >= 2
  && preferredZeroCostPaperSourceFamilies.includes("twelve-data")
  && preferredZeroCostPaperSourceFamilies.includes("alpaca")
  && executionCoverage?.policy?.liveTradingAllowed === false;
const executionMarketCoverageReady = executionEvidenceFresh
  && executionCoverageFresh
  && executionCoverageMatchesEvidence
  && executionEvidencePolicyReady
  && unverifiedPaperObservations.length === 0
  && paperEligibleSourceFamilies.size >= 2
  && zeroCostCoveragePolicyReady
  && requestedExecutionSymbols >= 3
  && paperEligibleSymbols >= 3
  && paperEligiblePercent >= 25;

const coverageRows = Array.isArray(executionCoverage?.rows) ? executionCoverage.rows : [];
const directaOptionalEvidenceSymbols = coverageRows.filter((row) => row?.directaOptionalEvidence === true).length;

const guardrails = governance?.guardrails || {};
const prohibited = new Set(governance?.prohibitedActions || []);
const numericRiskControlsSane = Number.isFinite(Number(guardrails.minIndependentSources))
  && Number(guardrails.minIndependentSources) >= 2
  && Number.isFinite(Number(guardrails.maxSingleAssetWeightPercent))
  && Number(guardrails.maxSingleAssetWeightPercent) > 0
  && Number(guardrails.maxSingleAssetWeightPercent) <= 15
  && Number.isFinite(Number(guardrails.maxSignalConfidence))
  && Number(guardrails.maxSignalConfidence) > 0
  && Number(guardrails.maxSignalConfidence) <= 85;
const riskControlsReady = guardrails.blockAutonomousTrading === true
  && guardrails.requireHumanConfirmation === true
  && guardrails.blockSignalWhenDataDivergent === true
  && guardrails.blockSignalWhenSourceStale === true
  && numericRiskControlsSane
  && prohibited.has("usare leva automaticamente")
  && prohibited.has("considerare investibile un segnale da una sola fonte");

const liveTradingLocked = guardrails.blockAutonomousTrading === true
  && guardrails.requireHumanConfirmation === true
  && prohibited.has("inviare ordini")
  && prohibited.has("collegarsi a broker");

if (!liveTradingLocked) {
  throw new Error("SAFETY FAILURE: live-trading lock is not fully enforced.");
}
if (!riskControlsReady) {
  throw new Error("SAFETY FAILURE: required risk guardrails are not fully enforced or outside producer bounds.");
}

const terminalAssets = Array.isArray(terminal?.assets) ? terminal.assets : [];
const researchCompanies = Array.isArray(research?.companies) ? research.companies : [];
const systemTestsReady = terminalAssets.length >= 10
  && terminalAssets.every((asset) => asset?.symbol && asset?.technical && Number.isFinite(asset?.unifiedScore) && Number.isFinite(asset?.riskScore))
  && researchCompanies.length >= 8
  && strategyLab && typeof strategyLab === "object"
  && Number.isFinite(governance?.stressScore)
  && governance.stressScore >= 0
  && governance.stressScore <= 100;

const records = Array.isArray(ledger?.records) ? ledger.records : [];
const markedRecords = records.filter((record) => Number.isFinite(record?.entryReferencePrice)
  && Number.isFinite(record?.lastPrice)
  && record?.lastMarkedAt);
const checkpoint7d = markedRecords.filter((record) => record?.checkpoints?.["7d"]?.measuredAt).length;
const checkpoint30d = markedRecords.filter((record) => record?.checkpoints?.["30d"]?.measuredAt).length;
const decisionClasses = new Set(markedRecords.map((record) => record?.decision).filter(Boolean));
const unsafeExecutionEvidence = records.some((record) => /live|broker|ordine inviato|executed/i.test(String(record?.executionGate || "")));
const historicalPaperEvidence = records.length >= 100
  && markedRecords.length >= 75
  && checkpoint7d >= 30
  && checkpoint30d >= 10
  && decisionClasses.size >= 3
  && !unsafeExecutionEvidence;
const paperCampaignStatus = evaluatePaperValidationCampaign(paperCampaign, now);
const paperCoreFingerprintReady = paperCampaignStatus.fingerprintMismatchDays === 0
  && paperCampaignStatus.fingerprintEvidenceDays >= paperCampaignStatus.minEvidenceDays;
const paperMarketDataEvidenceReady = paperCampaignStatus.evidenceDays > 0
  && paperCampaignStatus.marketDataCoverageFailureDays === 0;
const paperFillAccountingReady = paperCampaignStatus.evidenceDays > 0
  && paperCampaignStatus.fillAccountingMismatchDays === 0;
const paperModeEvidence = historicalPaperEvidence && paperCampaignStatus.matured;

const ready = sourceReady
  && intelligenceReportFresh
  && dataQualityReady
  && executionMarketCoverageReady
  && systemTestsReady
  && riskControlsReady
  && paperModeEvidence
  && liveTradingLocked;

const status = {
  ready,
  gates: {
    criticalSources: sourceReady ? "PASS" : "NOT_READY",
    sourceReportFreshness: sourceReportFresh && criticalSourcesFresh && criticalCountMatches ? "PASS" : "NOT_READY",
    intelligenceReportFreshness: intelligenceReportFresh ? "PASS" : "NOT_READY",
    dataQuality: dataQualityReady ? "PASS" : "NOT_READY",
    validationEvidenceFreshness: validationFreshnessPolicyReady ? "PASS" : "NOT_READY",
    crossSourceValidation: crossValidationReady ? "PASS" : "NOT_READY",
    executionMarketCoverage: executionMarketCoverageReady ? "PASS" : "NOT_READY",
    executionMarketProvenancePolicy: executionEvidencePolicyReady ? "PASS" : "NOT_READY",
    verifiedPaperProvenance: unverifiedPaperObservations.length === 0 ? "PASS" : "NOT_READY",
    zeroCostPaperCoveragePolicy: zeroCostCoveragePolicyReady ? "PASS" : "NOT_READY",
    paperSourceRedundancy: paperEligibleSourceFamilies.size >= 2 ? "PASS" : "NOT_READY",
    directaCoveragePolicy: "NOT_REQUIRED",
    directaPilotCoverage: "NOT_REQUIRED",
    systemTests: systemTestsReady ? "PASS" : "NOT_READY",
    riskControls: riskControlsReady ? "PASS" : "NOT_READY",
    historicalPaperEvidence: historicalPaperEvidence ? "PASS" : "NOT_VALIDATED",
    paperCampaign30d: paperCampaignStatus.matured ? "PASS" : paperCampaignStatus.state,
    paperCoreFingerprint: paperCoreFingerprintReady ? "PASS" : paperCampaignStatus.state === "INVALID" ? "INVALID" : "NOT_VALIDATED",
    paperMarketDataEvidence: paperMarketDataEvidenceReady ? "PASS" : paperCampaignStatus.state === "INVALID" ? "INVALID" : "NOT_VALIDATED",
    paperFillAccounting: paperFillAccountingReady ? "PASS" : paperCampaignStatus.state === "INVALID" ? "INVALID" : "NOT_VALIDATED",
    paperExecutionQuality: paperCampaignStatus.executionQualityReady ? "PASS" : "NOT_VALIDATED",
    paperSafetyEvidence: paperCampaignStatus.safetyEvidenceDays >= paperCampaignStatus.minEvidenceDays ? "PASS" : "NOT_VALIDATED",
    paperMode: paperModeEvidence ? "PASS" : "NOT_VALIDATED",
    liveTradingLocked: liveTradingLocked ? "PASS" : "FAIL",
  },
  metrics: {
    sourceGate: sources?.gate ?? "UNKNOWN",
    sourceReportAgeHours: Number.isFinite(reportAgeHours) ? Number(reportAgeHours.toFixed(2)) : null,
    criticalReady: Number(sources?.critical?.ready || 0),
    criticalTotal: Number(sources?.critical?.total || 0),
    criticalRowsObserved: criticalSourceRows.length,
    criticalDegradedFresh: criticalSourceRows.filter((source) => source?.status === "degraded" && source?.stale !== true).length,
    intelligenceReportAgeHours: Number.isFinite(intelligenceReportAgeHours) ? Number(intelligenceReportAgeHours.toFixed(2)) : null,
    intelligenceConfidence: Number(intelligence?.intelligenceConfidence || 0),
    minimumCrossChecksRequired: 10,
    crossChecks,
    crossDivergent,
    marketSources: Number(intelligence?.coverage?.marketSources || 0),
    assetClasses: Array.isArray(intelligence?.coverage?.assetClasses) ? intelligence.coverage.assetClasses.length : 0,
    sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent || 0),
    staleEvidenceExcluded: Number(intelligence?.crossSourceValidation?.staleEvidenceExcluded || 0),
    executionEvidenceAgeMinutes: Number.isFinite(executionEvidenceAgeMinutes) ? Number(executionEvidenceAgeMinutes.toFixed(1)) : null,
    executionCoverageAgeMinutes: Number.isFinite(executionCoverageAgeMinutes) ? Number(executionCoverageAgeMinutes.toFixed(1)) : null,
    executionCoverageMatchesEvidence,
    executionEvidenceVersion: Number(executionMarket?.version || 0),
    executionCoverageVersion: Number(executionCoverage?.version || 0),
    paperEligibleSourceFamilies: paperEligibleSourceFamilies.size,
    unverifiedPaperObservations: unverifiedPaperObservations.length,
    approvedIndependentPaperSourceFamilies,
    preferredZeroCostPaperSourceFamilies,
    directaPaidRealtimeRequired: executionCoverage?.policy?.directaPaidRealtimeRequired === true,
    directaEvidenceOptionalForPaperCertification: executionCoverage?.policy?.directaEvidenceOptionalForPaperCertification === true,
    directaOptionalEvidenceSymbols,
    requestedExecutionSymbols,
    paperEligibleSymbols,
    paperEligiblePercent,
    minimumPaperEligibleSymbols: 3,
    minimumPaperEligiblePercent: 25,
    terminalAssets: terminalAssets.length,
    researchCompanies: researchCompanies.length,
    paperRecords: records.length,
    markedPaperRecords: markedRecords.length,
    checkpoint7d,
    checkpoint30d,
    paperDecisionClasses: decisionClasses.size,
    paperCampaignState: paperCampaignStatus.state,
    paperCampaignElapsedDays: paperCampaignStatus.elapsedCalendarDays,
    paperCampaignEvidenceDays: paperCampaignStatus.evidenceDays,
    paperCampaignSafetyEvidenceDays: paperCampaignStatus.safetyEvidenceDays,
    paperCampaignFingerprintEvidenceDays: paperCampaignStatus.fingerprintEvidenceDays,
    paperCampaignFingerprintMismatchDays: paperCampaignStatus.fingerprintMismatchDays,
    paperCampaignMarketDataCoverageFailureDays: paperCampaignStatus.marketDataCoverageFailureDays,
    paperCampaignFillAccountingMismatchDays: paperCampaignStatus.fillAccountingMismatchDays,
    paperCampaignBaselineFingerprintAlgorithm: paperCampaign?.baselineFingerprint?.algorithm || null,
    paperCampaignRequiredDays: paperCampaignStatus.requiredDays,
    paperCampaignMinimumEvidenceDays: paperCampaignStatus.minEvidenceDays,
    paperCampaignMinimumPaperFills: paperCampaignStatus.minPaperFills,
    paperCampaignCumulativePaperFills: paperCampaignStatus.cumulativePaperFills,
    paperCampaignExecutionQualityReady: paperCampaignStatus.executionQualityReady,
    paperCampaignUnsafeLiveOrders: paperCampaignStatus.unsafeLiveOrders,
    paperCampaignUnsafeBrokerDays: paperCampaignStatus.unsafeBrokerDays,
    paperCampaignReconciliationBreakDays: paperCampaignStatus.reconciliationBreakDays,
    paperCampaignAuditFailureDays: paperCampaignStatus.auditFailureDays,
  },
};

console.log(`Fenice certification readiness: ${ready ? "READY" : "NOT_READY"}`);
console.log(JSON.stringify(status, null, 2));

if (requireReady && !ready) {
  console.error("Fenice certification gate failed: one or more READY criteria are not satisfied.");
  process.exitCode = 2;
}
