import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { verifyAuditChain } from "../lib/trading/audit-chain.ts";
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
const campaign = JSON.parse(await readFile(campaignPath, "utf8"));
const state = JSON.parse(await readFile(statePath, "utf8"));
const executionCoverage = JSON.parse(await readFile(coveragePath, "utf8"));
const executionEvidence = JSON.parse(await readFile(executionEvidencePath, "utf8"));

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

// A daily row can be re-written by a manual rerun. The day's fill delta must
// therefore be measured against the latest PRIOR DAY, not against an earlier
// snapshot from the same date that will be replaced below.
const priorDayCumulativePaperFilled = existing
  .filter((item) => String(item?.date || "").slice(0, 10) < date)
  .reduce((max, item) => {
    const value = Number(item?.cumulativePaperFilled);
    return Number.isFinite(value) && value >= 0 ? Math.max(max, value) : max;
  }, 0);
if (paperFilled < priorDayCumulativePaperFilled) {
  throw new Error(`PAPER_CAMPAIGN_FILL_COUNTER_REGRESSION: current cumulative fills ${paperFilled} < prior-day ${priorDayCumulativePaperFilled}.`);
}
const newPaperFills = paperFilled - priorDayCumulativePaperFilled;
const coverageGeneratedAtMs = parseTime(executionCoverage?.generatedAt);
const coverageAgeMinutes = coverageGeneratedAtMs === null ? Number.POSITIVE_INFINITY : (nowMs - coverageGeneratedAtMs) / 60_000;
const coverageFresh = Number.isFinite(coverageAgeMinutes) && coverageAgeMinutes >= 0 && coverageAgeMinutes <= 30;
const coverageMatchesEvidence = timestampsMatch(executionCoverage?.evidenceGeneratedAt, executionEvidence?.generatedAt);
const coveragePolicyReady = Number(executionCoverage?.version || 0) >= 2
  && executionCoverage?.policy?.requiredEligibility === "PAPER"
  && Number(executionCoverage?.policy?.minIndependentSourceFamilies || 0) >= 2
  && Number(executionCoverage?.policy?.minimumDirectaPilotEligibleSymbols || 0) >= 3
  && executionCoverage?.policy?.cryptoCannotSatisfyDirectaPilotCoverage === true
  && executionCoverage?.policy?.liveTradingAllowed === false
  && executionEvidence?.policy?.liveTradingAllowed === false
  && executionEvidence?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true;
const broadCoverageReady = Number(executionCoverage?.requestedSymbols || 0) >= 3
  && Number(executionCoverage?.paperEligibleSymbols || 0) >= 3
  && Number(executionCoverage?.paperEligiblePercent || 0) >= 25;
const directaPilotCoverageReady = Number(executionCoverage?.directaPilotCandidateSymbols || 0) >= 3
  && Number(executionCoverage?.directaPilotEligibleSymbols || 0) >= 3;
const marketDataCoverageReady = coverageFresh
  && coverageMatchesEvidence
  && coveragePolicyReady
  && broadCoverageReady
  && directaPilotCoverageReady;
const marketDataCoverageRequiredForNewFills = newPaperFills > 0;
const marketDataCoverageSafe = !marketDataCoverageRequiredForNewFills || marketDataCoverageReady;
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
  paperCycles: 1,
  cumulativeExecutions: executions.length,
  cumulativePaperFilled: paperFilled,
  newPaperFills,
  cumulativeRiskRejected: riskRejected,
  openPositions: positions,
  killSwitchEngaged: state?.killSwitch?.engaged === true,
  reconciliationBalanced,
  reconciliationBreaks,
  auditChainValid: audit.valid === true,
  auditChainEntries: Array.isArray(state.auditChain) ? state.auditChain.length : 0,
  consecutiveExecutionErrors: Number(state?.consecutiveExecutionErrors || 0),
  executionMarketCoverage: {
    requiredForNewFills: marketDataCoverageRequiredForNewFills,
    safe: marketDataCoverageSafe,
    fresh: coverageFresh,
    matchesEvidence: coverageMatchesEvidence,
    policyReady: coveragePolicyReady,
    broadCoverageReady,
    directaPilotCoverageReady,
    ageMinutes: Number.isFinite(coverageAgeMinutes) ? Number(coverageAgeMinutes.toFixed(1)) : null,
    requestedSymbols: Number(executionCoverage?.requestedSymbols || 0),
    paperEligibleSymbols: Number(executionCoverage?.paperEligibleSymbols || 0),
    paperEligiblePercent: Number(executionCoverage?.paperEligiblePercent || 0),
    directaPilotCandidateSymbols: Number(executionCoverage?.directaPilotCandidateSymbols || 0),
    directaPilotEligibleSymbols: Number(executionCoverage?.directaPilotEligibleSymbols || 0),
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

if (marketDataCoverageRequiredForNewFills && !marketDataCoverageSafe) {
  throw new Error(`PAPER_CAMPAIGN_MARKET_DATA_EVIDENCE_INVALID: ${newPaperFills} new paper fill(s) lack fresh Directa-pilot execution coverage evidence.`);
}

const dailyEvidence = [...existing.filter((item) => item?.date !== date), row]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

await writeFile(campaignPath, `${JSON.stringify({ ...campaign, dailyEvidence }, null, 2)}\n`, "utf8");
console.log(`Fenice paper validation evidence recorded for ${date}; days=${dailyEvidence.length}, fills=${paperFilled}, newFills=${newPaperFills}, executionCoverage=${marketDataCoverageSafe ? "PASS" : "FAIL"}, executionQuality=${executionQuality.state}, reconciliation=${reconciliationBalanced ? "PASS" : "BREAK"}, audit=${audit.valid ? "PASS" : "FAIL"}, coreFingerprint=PASS, liveOrders=0.`);
