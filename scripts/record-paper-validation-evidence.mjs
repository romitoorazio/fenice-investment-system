import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { verifyAuditChain } from "../lib/trading/audit-chain.ts";
import { evaluateDecisionDataGate } from "../lib/trading/decision-data-gate.mjs";
import { evaluateExecutionQuality } from "../lib/trading/execution-quality.ts";
import { calculateTransactionCosts } from "../lib/trading/tca.ts";
import {
  computePaperValidationFingerprint,
  validationFingerprintMatches,
} from "../lib/trading/validation-fingerprint.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = path.join(root, "data", "paper-validation-campaign.json");
const statePath = path.join(root, "data", "paper-oms-state.json");
const coveragePath = path.join(root, "data", "execution-market-coverage.json");
const executionEvidencePath = path.join(root, "data", "execution-market-evidence.json");
const sourceHealthPath = path.join(root, "data", "global-source-health.json");
const intelligencePath = path.join(root, "data", "intelligence-quality.json");
const [campaign, state, executionCoverage, executionEvidence, sourceHealth, intelligence] = await Promise.all([
  readFile(campaignPath, "utf8").then(JSON.parse),
  readFile(statePath, "utf8").then(JSON.parse),
  readFile(coveragePath, "utf8").then(JSON.parse),
  readFile(executionEvidencePath, "utf8").then(JSON.parse),
  readFile(sourceHealthPath, "utf8").then(JSON.parse),
  readFile(intelligencePath, "utf8").then(JSON.parse),
]);

async function resolveCommit() {
  const envSha = String(process.env.GITHUB_SHA || "").trim();
  if (/^[a-f0-9]{40}$/i.test(envSha)) return envSha.toLowerCase();
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  const sha = String(stdout || "").trim();
  return /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampsMatch(left, right, toleranceMs = 1000) {
  const a = parseTime(left);
  const b = parseTime(right);
  return a !== null && b !== null && Math.abs(a - b) <= toleranceMs;
}

function summarizeExecutionCoverage(coverage, evidence, nowMs) {
  const coverageGeneratedAtMs = parseTime(coverage?.generatedAt);
  const age = coverageGeneratedAtMs === null ? Number.POSITIVE_INFINITY : (nowMs - coverageGeneratedAtMs) / 60_000;
  const fresh = Number.isFinite(age) && age >= 0 && age <= 30;
  const matchesEvidence = timestampsMatch(coverage?.evidenceGeneratedAt, evidence?.generatedAt);
  const policyReady = Number(coverage?.version || 0) >= 2
    && coverage?.policy?.requiredEligibility === "PAPER"
    && Number(coverage?.policy?.minIndependentSourceFamilies || 0) >= 2
    && Number(coverage?.policy?.minimumDirectaPilotEligibleSymbols || 0) >= 3
    && coverage?.policy?.cryptoCannotSatisfyDirectaPilotCoverage === true
    && coverage?.policy?.liveTradingAllowed === false
    && evidence?.policy?.liveTradingAllowed === false
    && evidence?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true;
  const broadCoverageReady = Number(coverage?.requestedSymbols || 0) >= 3
    && Number(coverage?.paperEligibleSymbols || 0) >= 3
    && Number(coverage?.paperEligiblePercent || 0) >= 25;
  const directaPilotCoverageReady = Number(coverage?.directaPilotCandidateSymbols || 0) >= 3
    && Number(coverage?.directaPilotEligibleSymbols || 0) >= 3;
  return {
    ready: fresh && matchesEvidence && policyReady && broadCoverageReady && directaPilotCoverageReady,
    fresh,
    matchesEvidence,
    policyReady,
    broadCoverageReady,
    directaPilotCoverageReady,
    ageMinutes: Number.isFinite(age) ? Number(age.toFixed(1)) : null,
    requestedSymbols: Number(coverage?.requestedSymbols || 0),
    paperEligibleSymbols: Number(coverage?.paperEligibleSymbols || 0),
    paperEligiblePercent: Number(coverage?.paperEligiblePercent || 0),
    directaPilotCandidateSymbols: Number(coverage?.directaPilotCandidateSymbols || 0),
    directaPilotEligibleSymbols: Number(coverage?.directaPilotEligibleSymbols || 0),
  };
}

function validateFillEvidenceWindows(windows, fromCumulative, toCumulative) {
  if (toCumulative < fromCumulative) return false;
  if (toCumulative === fromCumulative) return (windows || []).length === 0;
  const ordered = [...(Array.isArray(windows) ? windows : [])]
    .sort((a, b) => String(a?.observedAt || "").localeCompare(String(b?.observedAt || "")));
  let cursor = fromCumulative;
  for (const window of ordered) {
    const from = Number(window?.fromCumulativePaperFilled);
    const to = Number(window?.toCumulativePaperFilled);
    const count = Number(window?.newPaperFills);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(count)) return false;
    if (from !== cursor || to <= from || count !== to - from) return false;
    if (window?.decisionData?.ready !== true || window?.executionMarket?.ready !== true) return false;
    cursor = to;
  }
  return cursor === toCumulative;
}

if (!campaign?.startedAt || !campaign?.baselineCommit) {
  throw new Error("PAPER_CAMPAIGN_NOT_STARTED: select a stable baseline before recording evidence.");
}
if (!campaign?.baselineFingerprint) {
  throw new Error("PAPER_CAMPAIGN_FINGERPRINT_MISSING: campaign must be started with an immutable core fingerprint.");
}
if (campaign.liveTradingAllowed !== false) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: liveTradingAllowed must remain false.");
}
if (state?.mode !== "PAPER" || state?.liveTradingAllowed === true || state?.brokerConnectivityAllowed === true) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: OMS must remain PAPER-only with broker writes disabled.");
}

const currentFingerprint = await computePaperValidationFingerprint(root);
if (!currentFingerprint.complete) {
  throw new Error(`PAPER_CAMPAIGN_FINGERPRINT_INCOMPLETE: ${currentFingerprint.missingFiles.join(",")}`);
}
if (!validationFingerprintMatches(campaign.baselineFingerprint, currentFingerprint)) {
  throw new Error("PAPER_CAMPAIGN_CORE_DRIFT: validated trading/risk core changed after campaign start; evidence recording is blocked until a new campaign baseline is explicitly selected.");
}

const now = new Date();
const nowMs = now.getTime();
const date = now.toISOString().slice(0, 10);
const executions = Array.isArray(state.executions) ? state.executions : [];
const paperFilled = executions.filter((item) => item?.status === "PAPER_FILLED").length;
const riskRejected = executions.filter((item) => item?.status === "RISK_REJECTED").length;
const positions = Array.isArray(state.positions) ? state.positions.length : 0;
const reconciliationBreaks = Array.isArray(state?.reconciliation?.breaks) ? state.reconciliation.breaks.length : 0;
const reconciliationBalanced = state?.reconciliation?.balanced === true && reconciliationBreaks === 0;
const audit = verifyAuditChain(Array.isArray(state.auditChain) ? state.auditChain : []);
const tca = calculateTransactionCosts(executions);
const executionQuality = evaluateExecutionQuality(executions);
const existing = Array.isArray(campaign.dailyEvidence) ? campaign.dailyEvidence : [];
const existingToday = existing.find((item) => String(item?.date || "").slice(0, 10) === date) || null;
const priorDayCumulativePaperFilled = existing
  .filter((item) => String(item?.date || "").slice(0, 10) < date)
  .reduce((max, item) => {
    const value = Number(item?.cumulativePaperFilled);
    return Number.isFinite(value) && value >= 0 ? Math.max(max, value) : max;
  }, 0);
const priorTodayCumulativePaperFilled = Math.max(
  priorDayCumulativePaperFilled,
  Number.isFinite(Number(existingToday?.cumulativePaperFilled)) ? Number(existingToday.cumulativePaperFilled) : priorDayCumulativePaperFilled,
);
if (paperFilled < priorTodayCumulativePaperFilled) {
  throw new Error(`PAPER_CAMPAIGN_FILL_COUNTER_REGRESSION: current cumulative fills ${paperFilled} < previously evidenced ${priorTodayCumulativePaperFilled}.`);
}

const dailyNewPaperFills = paperFilled - priorDayCumulativePaperFilled;
const additionalPaperFills = paperFilled - priorTodayCumulativePaperFilled;
const decisionDataEvaluation = evaluateDecisionDataGate({ sourceHealth, intelligence, now: nowMs });
const decisionData = {
  ready: decisionDataEvaluation.ready,
  sourceReady: decisionDataEvaluation.sourceReady,
  dataReady: decisionDataEvaluation.dataReady,
  reasons: decisionDataEvaluation.reasons,
  ...decisionDataEvaluation.metrics,
};
const executionMarket = summarizeExecutionCoverage(executionCoverage, executionEvidence, nowMs);
const fillEvidenceWindows = Array.isArray(existingToday?.fillEvidenceProof?.windows)
  ? [...existingToday.fillEvidenceProof.windows]
  : [];

if (additionalPaperFills > 0) {
  if (!decisionData.ready) {
    throw new Error(`PAPER_CAMPAIGN_DECISION_DATA_INVALID: ${additionalPaperFills} new paper fill(s) lack fresh institutional decision-data evidence.`);
  }
  if (!executionMarket.ready) {
    throw new Error(`PAPER_CAMPAIGN_MARKET_DATA_EVIDENCE_INVALID: ${additionalPaperFills} new paper fill(s) lack fresh Directa-pilot execution coverage evidence.`);
  }
  fillEvidenceWindows.push({
    observedAt: now.toISOString(),
    fromCumulativePaperFilled: priorTodayCumulativePaperFilled,
    toCumulativePaperFilled: paperFilled,
    newPaperFills: additionalPaperFills,
    decisionData,
    executionMarket,
  });
}

const fillEvidenceComplete = validateFillEvidenceWindows(
  fillEvidenceWindows,
  priorDayCumulativePaperFilled,
  paperFilled,
);
if (dailyNewPaperFills > 0 && !fillEvidenceComplete) {
  throw new Error(`PAPER_CAMPAIGN_FILL_EVIDENCE_GAP: ${dailyNewPaperFills} daily paper fill(s) are not fully covered by contiguous decision/market evidence windows.`);
}

const softwareCommit = await resolveCommit();
const row = {
  date,
  observedAt: now.toISOString(),
  softwareCommit,
  validationFingerprint: {
    version: currentFingerprint.version,
    algorithm: currentFingerprint.algorithm,
    digest: currentFingerprint.digest,
    complete: currentFingerprint.complete,
  },
  paperCycles: Math.max(1, Number(existingToday?.paperCycles || 0) + 1),
  cumulativeExecutions: executions.length,
  cumulativePaperFilled: paperFilled,
  newPaperFills: dailyNewPaperFills,
  additionalPaperFillsThisRun: additionalPaperFills,
  cumulativeRiskRejected: riskRejected,
  openPositions: positions,
  killSwitchEngaged: state?.killSwitch?.engaged === true,
  reconciliationBalanced,
  reconciliationBreaks,
  auditChainValid: audit.valid === true,
  auditChainEntries: Array.isArray(state.auditChain) ? state.auditChain.length : 0,
  consecutiveExecutionErrors: Number(state?.consecutiveExecutionErrors || 0),
  decisionDataGate: {
    ...decisionData,
    newRiskAllowedThisRun: decisionData.ready && executionMarket.ready,
  },
  executionMarketCoverage: {
    ...executionMarket,
    requiredForAdditionalFills: additionalPaperFills > 0,
  },
  fillEvidenceProof: {
    version: 1,
    requiredFills: dailyNewPaperFills,
    coveredFills: fillEvidenceWindows.reduce((sum, window) => sum + Math.max(0, Number(window?.newPaperFills || 0)), 0),
    complete: fillEvidenceComplete,
    windows: fillEvidenceWindows,
  },
  executionQuality: {
    state: executionQuality.state,
    allowPilot: executionQuality.allowPilot,
    riskMultiplier: executionQuality.riskMultiplier,
    fills: executionQuality.fills,
    grossNotionalEuro: executionQuality.grossNotionalEuro,
    slippageCostBps: executionQuality.slippageCostBps,
    implementationShortfallBps: executionQuality.implementationShortfallBps,
    weightedDirectionalSlippageBps: executionQuality.weightedDirectionalSlippageBps,
    totalFeesEuro: tca.totalFeesEuro,
    totalSlippageEuro: tca.totalSlippageEuro,
    reasons: executionQuality.reasons,
  },
  liveOrders: 0,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};

const dailyEvidence = [...existing.filter((item) => item?.date !== date), row]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

await writeFile(campaignPath, `${JSON.stringify({ ...campaign, dailyEvidence }, null, 2)}\n`, "utf8");
console.log(`Fenice paper validation evidence recorded for ${date}; days=${dailyEvidence.length}, fills=${paperFilled}, dailyNewFills=${dailyNewPaperFills}, additionalThisRun=${additionalPaperFills}, decisionData=${decisionData.ready ? "PASS" : "BLOCK"}, executionCoverage=${executionMarket.ready ? "PASS" : "BLOCK"}, fillProof=${fillEvidenceComplete ? "PASS" : "FAIL"}, executionQuality=${executionQuality.state}, reconciliation=${reconciliationBalanced ? "PASS" : "BREAK"}, audit=${audit.valid ? "PASS" : "FAIL"}, coreFingerprint=PASS, liveOrders=0.`);
