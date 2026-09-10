import { readFile } from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [sources, intelligence, governance] = await Promise.all([
  readJson("data/global-source-health.json"),
  readJson("data/intelligence-quality.json"),
  readJson("data/decision-governance.json"),
]);

const criticalFailures = Array.isArray(sources?.critical?.failures) ? sources.critical.failures : [];
const sourceFallbacksSafe = criticalFailures.every((id) => {
  const source = Array.isArray(sources?.sources) ? sources.sources.find((item) => item.id === id) : null;
  return Boolean(source?.stale === true && source?.lastSuccessfulAt);
});

const sourceReady = sources?.critical?.gate === "GREEN" || (criticalFailures.length > 0 && sourceFallbacksSafe);
const crossValidationReady = Number(intelligence?.crossSourceValidation?.checked || 0) > 0
  && Number(intelligence?.crossSourceValidation?.divergent || 0) === 0;
const dataQualityReady = Number(intelligence?.intelligenceConfidence || 0) >= 90
  && Number(intelligence?.coverage?.sourceConcentrationPercent || 100) <= 50
  && crossValidationReady;

const guardrails = governance?.guardrails || {};
const riskControlsReady = guardrails.blockAutonomousTrading === true
  && guardrails.requireHumanConfirmation === true
  && guardrails.blockSignalWhenDataDivergent === true
  && guardrails.blockSignalWhenSourceStale === true
  && Number(guardrails.minIndependentSources || 0) >= 3
  && Number(guardrails.maxSingleAssetWeightPercent || 100) <= 8;

const prohibited = new Set(governance?.prohibitedActions || []);
const liveTradingLocked = guardrails.blockAutonomousTrading === true
  && prohibited.has("inviare ordini")
  && prohibited.has("collegarsi a broker");

if (!liveTradingLocked) {
  throw new Error("SAFETY FAILURE: live-trading lock is not fully enforced.");
}
if (!riskControlsReady) {
  throw new Error("SAFETY FAILURE: required risk guardrails are not fully enforced.");
}

const paperModeEvidence = false; // Must be replaced only by explicit regression/stress evidence.
const ready = sourceReady && dataQualityReady && riskControlsReady && paperModeEvidence && liveTradingLocked;

const status = {
  ready,
  gates: {
    criticalSources: sourceReady ? "PASS" : "NOT_READY",
    dataQuality: dataQualityReady ? "PASS" : "NOT_READY",
    crossSourceValidation: crossValidationReady ? "PASS" : "NOT_READY",
    riskControls: riskControlsReady ? "PASS" : "NOT_READY",
    paperMode: paperModeEvidence ? "PASS" : "NOT_VALIDATED",
    liveTradingLocked: liveTradingLocked ? "PASS" : "FAIL",
  },
  metrics: {
    sourceGate: sources?.gate ?? "UNKNOWN",
    criticalReady: Number(sources?.critical?.ready || 0),
    criticalTotal: Number(sources?.critical?.total || 0),
    intelligenceConfidence: Number(intelligence?.intelligenceConfidence || 0),
    crossChecks: Number(intelligence?.crossSourceValidation?.checked || 0),
    sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent || 0),
  },
};

console.log(`Fenice certification readiness: ${ready ? "READY" : "NOT_READY"}`);
console.log(JSON.stringify(status, null, 2));
