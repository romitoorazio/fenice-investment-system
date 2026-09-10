import { readFile } from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [sources, intelligence, governance, ledger, terminal, research, strategyLab] = await Promise.all([
  readJson("data/global-source-health.json"),
  readJson("data/intelligence-quality.json"),
  readJson("data/decision-governance.json"),
  readJson("data/decision-ledger.json"),
  readJson("data/terminal-intelligence.json"),
  readJson("data/fundamental-research.json"),
  readJson("data/strategy-lab.json"),
]);

const criticalFailures = Array.isArray(sources?.critical?.failures) ? sources.critical.failures : [];
const sourceFallbacksSafe = criticalFailures.every((id) => {
  const source = Array.isArray(sources?.sources) ? sources.sources.find((item) => item.id === id) : null;
  if (!source || source.status !== "degraded" || source.stale !== true || !source.lastSuccessfulAt) return false;
  const staleAgeHours = (Date.now() - Date.parse(source.lastSuccessfulAt)) / 3_600_000;
  return Number.isFinite(staleAgeHours) && staleAgeHours >= 0 && staleAgeHours <= 24;
});

const sourceReady = sources?.critical?.gate === "GREEN"
  || (criticalFailures.length > 0 && sourceFallbacksSafe);

const crossChecks = Number(intelligence?.crossSourceValidation?.checked || 0);
const crossDivergent = Number(intelligence?.crossSourceValidation?.divergent || 0);
const crossValidationReady = crossChecks >= 3 && crossDivergent === 0;
const dataQualityReady = Number(intelligence?.intelligenceConfidence || 0) >= 90
  && Number(intelligence?.coverage?.sourceConcentrationPercent || 100) <= 50
  && Number(intelligence?.coverage?.marketSources || 0) >= 3
  && Array.isArray(intelligence?.coverage?.assetClasses)
  && intelligence.coverage.assetClasses.length >= 3
  && crossValidationReady;

const guardrails = governance?.guardrails || {};
const prohibited = new Set(governance?.prohibitedActions || []);
const riskControlsReady = guardrails.blockAutonomousTrading === true
  && guardrails.requireHumanConfirmation === true
  && guardrails.blockSignalWhenDataDivergent === true
  && guardrails.blockSignalWhenSourceStale === true
  && Number(guardrails.minIndependentSources || 0) >= 3
  && Number(guardrails.maxSingleAssetWeightPercent || 100) <= 8
  && Number(guardrails.maxSignalConfidence || 100) <= 50
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
  throw new Error("SAFETY FAILURE: required risk guardrails are not fully enforced.");
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
const paperModeEvidence = records.length >= 100
  && markedRecords.length >= 75
  && checkpoint7d >= 30
  && checkpoint30d >= 10
  && decisionClasses.size >= 3
  && !unsafeExecutionEvidence;

const ready = sourceReady
  && dataQualityReady
  && systemTestsReady
  && riskControlsReady
  && paperModeEvidence
  && liveTradingLocked;

const status = {
  ready,
  gates: {
    criticalSources: sourceReady ? "PASS" : "NOT_READY",
    dataQuality: dataQualityReady ? "PASS" : "NOT_READY",
    crossSourceValidation: crossValidationReady ? "PASS" : "NOT_READY",
    systemTests: systemTestsReady ? "PASS" : "NOT_READY",
    riskControls: riskControlsReady ? "PASS" : "NOT_READY",
    paperMode: paperModeEvidence ? "PASS" : "NOT_VALIDATED",
    liveTradingLocked: liveTradingLocked ? "PASS" : "FAIL",
  },
  metrics: {
    sourceGate: sources?.gate ?? "UNKNOWN",
    criticalReady: Number(sources?.critical?.ready || 0),
    criticalTotal: Number(sources?.critical?.total || 0),
    intelligenceConfidence: Number(intelligence?.intelligenceConfidence || 0),
    crossChecks,
    crossDivergent,
    marketSources: Number(intelligence?.coverage?.marketSources || 0),
    assetClasses: Array.isArray(intelligence?.coverage?.assetClasses) ? intelligence.coverage.assetClasses.length : 0,
    sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent || 0),
    terminalAssets: terminalAssets.length,
    researchCompanies: researchCompanies.length,
    paperRecords: records.length,
    markedPaperRecords: markedRecords.length,
    checkpoint7d,
    checkpoint30d,
    paperDecisionClasses: decisionClasses.size,
  },
};

console.log(`Fenice certification readiness: ${ready ? "READY" : "NOT_READY"}`);
console.log(JSON.stringify(status, null, 2));
