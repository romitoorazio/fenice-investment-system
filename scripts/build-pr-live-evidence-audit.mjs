import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [q, s, e, c] = await Promise.all([
  readJson("data/intelligence-quality.json"),
  readJson("data/global-source-health.json"),
  readJson("data/execution-market-evidence.json"),
  readJson("data/execution-market-coverage.json"),
]);

const now = Date.now();
const ageHours = (value) => {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : null;
};

const providerErrorCounts = new Map();
for (const error of Array.isArray(e.errors) ? e.errors : []) {
  const provider = String(error?.provider || "unknown").toLowerCase();
  const code = String(error?.code || "FETCH_FAILED").slice(0, 80);
  const key = `${provider}:${code}`;
  providerErrorCounts.set(key, (providerErrorCounts.get(key) || 0) + 1);
}
const executionProviderErrorSummary = [...providerErrorCounts.entries()]
  .map(([key, count]) => {
    const separator = key.indexOf(":");
    return {
      provider: separator >= 0 ? key.slice(0, separator) : key,
      code: separator >= 0 ? key.slice(separator + 1) : "FETCH_FAILED",
      count,
    };
  })
  .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider) || a.code.localeCompare(b.code));

const observations = Array.isArray(e.observations) ? e.observations : [];
const approvedPaperFamilies = Array.isArray(c.policy?.approvedIndependentPaperSourceFamilies)
  ? c.policy.approvedIndependentPaperSourceFamilies.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  : [];
const paperEligibleSourceFamilies = [...new Set(observations
  .filter((row) => (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified === true)
  .map((row) => String(row?.sourceFamily || "").trim().toLowerCase())
  .filter(Boolean))].sort();
const unverifiedPaperObservations = observations.filter((row) =>
  (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified !== true
).length;

const metrics = {
  generatedAt: new Date().toISOString(),
  auditedCommit: process.env.GITHUB_SHA || null,
  intelligenceConfidence: Number(q.intelligenceConfidence || 0),
  sourceConcentrationPercent: Number(q.coverage?.sourceConcentrationPercent || 100),
  marketSources: Number(q.coverage?.marketSources || 0),
  assetClasses: Array.isArray(q.coverage?.assetClasses) ? q.coverage.assetClasses.length : 0,
  crossChecks: Number(q.crossSourceValidation?.checked || 0),
  attention: Number(q.crossSourceValidation?.attention || 0),
  divergent: Number(q.crossSourceValidation?.divergent || 0),
  freshEvidenceObservations: Number(q.crossSourceValidation?.evidenceObservations || 0),
  excludedValidationEvidence: Number(q.crossSourceValidation?.staleEvidenceExcluded || 0),
  cryptoConflictEscalationTargets: Array.isArray(q.crossSourceValidation?.cryptoConflictEscalation?.targets)
    ? q.crossSourceValidation.cryptoConflictEscalation.targets.length
    : 0,
  cryptoConflictEscalationRecovered: Number(q.crossSourceValidation?.cryptoConflictEscalation?.additionalVenueObservations || 0),
  criticalGate: s.critical?.gate || "UNKNOWN",
  criticalReady: Number(s.critical?.ready || 0),
  criticalTotal: Number(s.critical?.total || 0),
  sourceReportAgeHours: ageHours(s.generatedAt),
  intelligenceReportAgeHours: ageHours(q.generatedAt),
  executionEvidenceAgeHours: ageHours(e.generatedAt),
  executionEvidenceVersion: Number(e.version || 0),
  executionCoverageVersion: Number(c.version || 0),
  executionObservations: observations.length,
  executionProviders: [...new Set(observations.map((row) => row.sourceFamily || row.source).filter(Boolean))].sort(),
  executionErrors: Array.isArray(e.errors) ? e.errors.length : 0,
  executionProviderErrorSummary,
  twelveDataConfigured: e.capabilities?.twelveDataConfigured === true,
  twelveDataProbeLimit: Number(e.capabilities?.twelveDataProbeLimit || 0),
  twelveDataPaperFreshObservations: Number(e.capabilities?.twelveDataPaperFreshObservations || 0),
  twelveDataValidationOnlyObservations: Number(e.capabilities?.twelveDataValidationOnlyObservations || 0),
  twelveDataRateLimitEvents: Number(e.capabilities?.twelveDataRateLimitEvents || 0),
  twelveDataRateLimitRetries: Number(e.capabilities?.twelveDataRateLimitRetries || 0),
  twelveDataMinIntervalMs: Number(e.capabilities?.twelveDataMinIntervalMs || 0),
  alpacaConfigured: e.capabilities?.alpacaConfigured === true,
  alpacaProbeLimit: Number(e.capabilities?.alpacaProbeLimit || 0),
  alpacaPaperFreshObservations: Number(e.capabilities?.alpacaPaperFreshObservations || 0),
  alpacaLatestTradeFallbackObservations: Number(e.capabilities?.alpacaLatestTradeFallbackObservations || 0),
  alphaVantageConfigured: e.capabilities?.alphaVantageConfigured === true,
  alphaVantageProbeLimit: Number(e.capabilities?.alphaVantageProbeLimit || 0),
  alphaVantagePaperFreshObservations: Number(e.capabilities?.alphaVantagePaperFreshObservations || 0),
  directaLocalSnapshotDetected: e.capabilities?.directaLocalSnapshotDetected === true,
  directaLocalSnapshotAccepted: e.capabilities?.directaLocalSnapshotAccepted === true,
  directaPaperFreshObservations: Number(e.capabilities?.directaPaperFreshObservations || 0),
  paperRequestedSymbols: Number(c.requestedSymbols || 0),
  paperEligibleSymbols: Number(c.paperEligibleSymbols || 0),
  paperEligiblePercent: Number(c.paperEligiblePercent || 0),
  paperEligibleSourceFamilies,
  unverifiedPaperObservations,
  approvedIndependentPaperSourceFamilies: approvedPaperFamilies,
  directaPaidRealtimeRequired: c.policy?.directaPaidRealtimeRequired === true,
  directaEvidenceOptionalForPaperCertification: c.policy?.directaEvidenceOptionalForPaperCertification === true,
  validationOnlyEvidenceCannotSatisfyPaperQuorum: c.policy?.validationOnlyEvidenceCannotSatisfyPaperQuorum === true,
  provenanceRequired: e.policy?.paperEligibilityRequiresVerifiedProvenance === true,
  coverageProvenanceRequired: c.policy?.paperEligibilityRequiresVerifiedProvenance === true,
  providerRateLimitsUsePacingAndBackoff: e.policy?.providerRateLimitsMustUsePacingAndBackoff === true,
  rateLimitRetriesNeverChangeEvidenceEligibility: e.policy?.rateLimitRetriesNeverChangeEvidenceEligibility === true,
  paperGreenSymbols: Array.isArray(c.greenSymbols) ? c.greenSymbols : [],
  paperCautionSymbols: Array.isArray(c.cautionSymbols) ? c.cautionSymbols : [],
  paperBlockedSymbols: Array.isArray(c.blockedSymbols) ? c.blockedSymbols : [],
  liveTradingAllowed: e.policy?.liveTradingAllowed === true,
};

const gates = {
  criticalSources: metrics.criticalGate === "GREEN" && metrics.criticalTotal > 0 && metrics.criticalReady === metrics.criticalTotal,
  confidence90: metrics.intelligenceConfidence >= 90,
  concentration50: metrics.sourceConcentrationPercent <= 50,
  marketSources3: metrics.marketSources >= 3,
  assetClasses3: metrics.assetClasses >= 3,
  crossChecks10: metrics.crossChecks >= 10,
  zeroDivergence: metrics.divergent === 0,
  hardenedExecutionSchema: metrics.executionEvidenceVersion >= 11 && metrics.executionCoverageVersion >= 6,
  providerNeutralPaperPolicy: metrics.directaPaidRealtimeRequired === false
    && metrics.directaEvidenceOptionalForPaperCertification === true
    && metrics.validationOnlyEvidenceCannotSatisfyPaperQuorum === true
    && metrics.provenanceRequired === true
    && metrics.coverageProvenanceRequired === true
    && metrics.approvedIndependentPaperSourceFamilies.length >= 2,
  zeroCostSourceRoutesPresent: metrics.approvedIndependentPaperSourceFamilies.includes("twelve-data")
    && metrics.approvedIndependentPaperSourceFamilies.includes("alpaca"),
  executionEvidencePresent: metrics.executionObservations > 0,
  provenanceClean: metrics.unverifiedPaperObservations === 0,
  providerRateBudgetHardened: metrics.providerRateLimitsUsePacingAndBackoff
    && metrics.rateLimitRetriesNeverChangeEvidenceEligibility
    && metrics.twelveDataMinIntervalMs >= 8_000,
  paidAlphaRealtimeDisabled: metrics.alphaVantageProbeLimit === 0,
  paperSourceRedundancy: metrics.paperEligibleSourceFamilies.length >= 2,
  paperExecutionCoverage: metrics.paperEligibleSymbols >= 3 && metrics.paperEligiblePercent >= 25,
  liveTradingLocked: metrics.liveTradingAllowed === false,
};
const dataQualityGateNames = ["criticalSources", "confidence90", "concentration50", "marketSources3", "assetClasses3", "crossChecks10", "zeroDivergence"];
const report = {
  version: 2,
  metrics,
  gates,
  cloudDataQualityReady: dataQualityGateNames.every((key) => gates[key] === true),
  hardenedExecutionPolicyReady: gates.hardenedExecutionSchema
    && gates.providerNeutralPaperPolicy
    && gates.zeroCostSourceRoutesPresent
    && gates.provenanceClean
    && gates.providerRateBudgetHardened
    && gates.liveTradingLocked,
  broadPaperExecutionCoverageReady: gates.executionEvidencePresent && gates.provenanceClean && gates.paperSourceRedundancy && gates.paperExecutionCoverage,
  zeroCostIndependentSourcesConfigured: metrics.twelveDataConfigured && metrics.alpacaConfigured,
  localDirectaEvidenceRequired: false,
  directaEvidenceRole: "optional-readonly-shadow",
  cloudRunnerCanCertifyDirectaLocalFeed: false,
  note: "PAPER certification is provider-neutral and fail-closed. Twelve Data + Alpaca IEX are the preferred zero-cost US source pair when configured. Rate-limit retries never weaken freshness or provenance. Directa local evidence remains optional for PAPER and useful for future read-only/shadow broker validation.",
};

await writeFile(path.join(root, "data", "pr-live-evidence-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`FENICE_PR_LIVE_EVIDENCE=${JSON.stringify(report)}`);
if (!gates.liveTradingLocked) throw new Error("SAFETY_FAILURE: execution evidence claims live trading allowed");
if (!gates.hardenedExecutionSchema
  || !gates.providerNeutralPaperPolicy
  || !gates.zeroCostSourceRoutesPresent
  || !gates.provenanceClean
  || !gates.providerRateBudgetHardened
  || !gates.paidAlphaRealtimeDisabled) {
  throw new Error("SAFETY_FAILURE: live audit is not using the hardened zero-cost provenance-safe PAPER policy");
}
