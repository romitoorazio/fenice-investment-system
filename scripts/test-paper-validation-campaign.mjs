import assert from "node:assert/strict";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";

const now = Date.parse("2026-10-22T12:00:00Z");
const startedAt = "2026-09-21T12:00:00Z";
const baselineFingerprint = {
  version: 1,
  algorithm: "sha256",
  digest: "a".repeat(64),
  complete: true,
};
const validFingerprint = { ...baselineFingerprint };
const mismatchedFingerprint = { ...baselineFingerprint, digest: "b".repeat(64) };

const dailyEvidence = Array.from({ length: 26 }, (_, index) => ({
  date: new Date(Date.parse("2026-09-21T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10),
  softwareCommit: "c".repeat(40),
  validationFingerprint: validFingerprint,
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
  executionQuality: {
    state: index + 1 >= 10 ? "HEALTHY" : "INSUFFICIENT",
    allowPilot: index + 1 >= 10,
    fills: Math.min(12, index + 1),
  },
}));

function campaign(overrides = {}) {
  return {
    startedAt,
    baselineCommit: "abc123",
    baselineFingerprint,
    requiredDays: 30,
    minEvidenceDays: 25,
    minPaperFills: 10,
    liveTradingAllowed: false,
    dailyEvidence,
    ...overrides,
  };
}

const matured = evaluatePaperValidationCampaign(campaign(), now);
assert.equal(matured.matured, true, matured.reasons.join(" | "));
assert.equal(matured.state, "MATURED");
assert(matured.elapsedCalendarDays >= 30);
assert.equal(matured.safetyEvidenceDays, 26);
assert.equal(matured.fingerprintEvidenceDays, 26);
assert.equal(matured.fingerprintMismatchDays, 0);
assert.equal(matured.cumulativePaperFills, 12);
assert.equal(matured.executionQualityReady, true);

const immature = evaluatePaperValidationCampaign(campaign({
  startedAt: "2026-10-10T12:00:00Z",
  dailyEvidence: dailyEvidence.slice(0, 5),
}), now);
assert.equal(immature.matured, false);
assert.equal(immature.state, "ACTIVE");

const notStarted = evaluatePaperValidationCampaign({
  startedAt: null,
  baselineCommit: null,
  baselineFingerprint: null,
  liveTradingAllowed: false,
  dailyEvidence: [],
}, now);
assert.equal(notStarted.state, "NOT_STARTED");
assert.equal(notStarted.matured, false);

const startedWithoutFingerprint = evaluatePaperValidationCampaign(campaign({ baselineFingerprint: null }), now);
assert.equal(startedWithoutFingerprint.state, "INVALID");
assert.equal(startedWithoutFingerprint.matured, false);
assert(startedWithoutFingerprint.reasons.some((reason) => reason.includes("fingerprint")));

const unsafe = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: [...dailyEvidence, {
    date: "2026-10-20",
    validationFingerprint: validFingerprint,
    liveOrders: 1,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    reconciliationBalanced: true,
    reconciliationBreaks: 0,
    auditChainValid: true,
    cumulativePaperFilled: 12,
    executionQuality: { state: "HEALTHY", allowPilot: true, fills: 12 },
  }],
}), now);
assert.equal(unsafe.matured, false);
assert.equal(unsafe.state, "INVALID");
assert.equal(unsafe.unsafeLiveOrders, 1);

const reconciliationFailure = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row, index) => index === 3
    ? { ...row, reconciliationBalanced: false, reconciliationBreaks: 1 }
    : row),
}), now);
assert.equal(reconciliationFailure.matured, false);
assert.equal(reconciliationFailure.reconciliationBreakDays, 1);

const insufficientFills = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row) => ({
    ...row,
    cumulativePaperFilled: 3,
    executionQuality: { state: "INSUFFICIENT", allowPilot: false, fills: 3 },
  })),
}), now);
assert.equal(insufficientFills.matured, false);
assert.equal(insufficientFills.cumulativePaperFills, 3);
assert.equal(insufficientFills.executionQualityReady, false);

const poorExecutionQuality = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row, index) => index === dailyEvidence.length - 1
    ? { ...row, executionQuality: { state: "POOR", allowPilot: false, fills: 12 } }
    : row),
}), now);
assert.equal(poorExecutionQuality.matured, false);
assert.equal(poorExecutionQuality.executionQualityReady, false);

const coreDrift = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row, index) => index === 7
    ? { ...row, validationFingerprint: mismatchedFingerprint }
    : row),
}), now);
assert.equal(coreDrift.matured, false);
assert.equal(coreDrift.state, "INVALID");
assert.equal(coreDrift.fingerprintMismatchDays, 1);
assert.equal(coreDrift.fingerprintEvidenceDays, 25);
assert(coreDrift.reasons.some((reason) => reason.includes("immutable validated-core fingerprint")));

const invalidLiveMode = evaluatePaperValidationCampaign(campaign({ liveTradingAllowed: true }), now);
assert.equal(invalidLiveMode.state, "INVALID");

console.log("Fenice 30-day paper validation campaign tests: PASS");
