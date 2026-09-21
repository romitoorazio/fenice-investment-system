import assert from "node:assert/strict";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";

const now = Date.parse("2026-10-22T12:00:00Z");
const startedAt = "2026-09-21T12:00:00Z";
const dailyEvidence = Array.from({ length: 26 }, (_, index) => ({
  date: new Date(Date.parse("2026-09-21T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10),
  paperCycles: 1,
  cumulativeExecutions: index + 1,
  cumulativePaperFilled: Math.min(12, index + 1),
  cumulativeRiskRejected: 0,
  liveOrders: 0,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  reconciliationBalanced: true,
  reconciliationBreaks: 0,
  auditChainValid: true,
}));

const matured = evaluatePaperValidationCampaign({
  startedAt,
  baselineCommit: "abc123",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  dailyEvidence,
}, now);
assert.equal(matured.matured, true, matured.reasons.join(" | "));
assert.equal(matured.state, "MATURED");
assert(matured.elapsedCalendarDays >= 30);
assert.equal(matured.safetyEvidenceDays, 26);
assert.equal(matured.cumulativePaperFills, 12);

const immature = evaluatePaperValidationCampaign({
  startedAt: "2026-10-10T12:00:00Z",
  baselineCommit: "abc123",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  dailyEvidence: dailyEvidence.slice(0, 5),
}, now);
assert.equal(immature.matured, false);
assert.equal(immature.state, "ACTIVE");

const notStarted = evaluatePaperValidationCampaign({
  startedAt: null,
  baselineCommit: null,
  liveTradingAllowed: false,
  dailyEvidence: [],
}, now);
assert.equal(notStarted.state, "NOT_STARTED");
assert.equal(notStarted.matured, false);

const unsafe = evaluatePaperValidationCampaign({
  startedAt,
  baselineCommit: "abc123",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  dailyEvidence: [...dailyEvidence, {
    date: "2026-10-20",
    liveOrders: 1,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    reconciliationBalanced: true,
    reconciliationBreaks: 0,
    auditChainValid: true,
    cumulativePaperFilled: 12,
  }],
}, now);
assert.equal(unsafe.matured, false);
assert.equal(unsafe.state, "INVALID");
assert.equal(unsafe.unsafeLiveOrders, 1);

const reconciliationFailure = evaluatePaperValidationCampaign({
  startedAt,
  baselineCommit: "abc123",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  dailyEvidence: dailyEvidence.map((row, index) => index === 3
    ? { ...row, reconciliationBalanced: false, reconciliationBreaks: 1 }
    : row),
}, now);
assert.equal(reconciliationFailure.matured, false);
assert.equal(reconciliationFailure.reconciliationBreakDays, 1);

const insufficientFills = evaluatePaperValidationCampaign({
  startedAt,
  baselineCommit: "abc123",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  dailyEvidence: dailyEvidence.map((row) => ({ ...row, cumulativePaperFilled: 3 })),
}, now);
assert.equal(insufficientFills.matured, false);
assert.equal(insufficientFills.cumulativePaperFills, 3);

const invalidLiveMode = evaluatePaperValidationCampaign({
  startedAt,
  baselineCommit: "abc123",
  liveTradingAllowed: true,
  dailyEvidence,
}, now);
assert.equal(invalidLiveMode.state, "INVALID");

console.log("Fenice 30-day paper validation campaign tests: PASS");
