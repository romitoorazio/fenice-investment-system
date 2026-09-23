import assert from "node:assert/strict";
import { buildPaperValidationProbe } from "./paper-validation-stager.mjs";

const now = "2026-09-23T16:55:00.000Z";
const base = {
  campaign: {
    startedAt: "2026-09-23T14:03:50.751Z",
    baselineCommit: "a".repeat(40),
    baselineFingerprint: { complete: true },
    minPaperFills: 10,
    liveTradingAllowed: false,
  },
  approval: {
    approved: true,
    humanConfirmation: true,
    mode: "PAPER",
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    expiresAt: "2026-10-24T23:59:59Z",
    approvalId: "approval-1",
    idPrefix: "fenice-paper-validation-",
    targetPaperFills: 10,
    maxProbeAttemptsTotal: 20,
    maxOrdersPerDay: 1,
    maxNotionalEuroPerOrder: 100,
    riskFxToEuroByCurrency: { EUR: 1, USD: 2 },
    minCommitteeScore: 70,
    minConfidence: 90,
    maxRiskScore: 75,
    permittedDecisionStates: ["OSSERVA", "MANTIENI", "ACCUMULA"],
    permittedCurrencies: ["USD", "EUR"],
  },
  marketSession: {
    configured: true,
    evidence: { authoritative: true, state: "OPEN", observedAt: "2026-09-23T16:54:30.000Z" },
    decision: { allowed: true },
    liveTradingAllowed: false,
  },
  coverage: {
    generatedAt: "2026-09-23T16:50:00.000Z",
    paperEligibleSymbols: 4,
    paperEligiblePercent: 33.3,
    policy: { liveTradingAllowed: false, minIndependentSourceFamilies: 2 },
    rows: [{ symbol: "SPY", paperEligible: true, state: "CAUTION", independentSourceFamilies: 2, medianPrice: 773.5 }],
  },
  state: {
    mode: "PAPER",
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    killSwitch: { engaged: false },
    reconciliation: { balanced: true, breaks: [] },
    executions: [],
  },
  queue: { version: 1, mode: "PAPER", orders: [] },
  terminal: {
    generatedAt: "2026-09-23T06:07:57.492Z",
    capitalEuro: 10000,
    assets: [{ symbol: "SPY", currency: "USD", confidence: 95, riskScore: 30, decision: "ACCUMULA" }],
  },
  committee: {
    generatedAt: "2026-09-23T06:08:00.107Z",
    sourceGate: "GREEN",
    dataQuality: 98,
    topDecisions: [{ symbol: "SPY", currency: "USD", decision: "OSSERVA", committeeScore: 71, confidence: 95, riskScore: 30 }],
  },
  now,
};

const staged = buildPaperValidationProbe(base);
assert.equal(staged.staged, true, "CAUTION with paperEligible=true and two independent families must satisfy the minimum PAPER quorum");
assert.equal(staged.order.symbol, "SPY");
assert.equal(staged.order.humanConfirmed, true);
assert.equal(staged.order.validationProbe, true);
assert.equal(staged.order.fxToEuro, 2);
assert.equal(staged.order.validationRationale.coverageState, "CAUTION");
assert(staged.order.quantity * 773.5 * staged.order.fxToEuro <= 100.001);
assert.equal(staged.order.validationRationale.targetPaperFills, 10);
assert.equal(staged.queue.orders.length, 1);

const blockedCoverage = buildPaperValidationProbe({
  ...base,
  coverage: {
    ...base.coverage,
    rows: [{ ...base.coverage.rows[0], state: "BLOCKED" }],
  },
});
assert.equal(blockedCoverage.staged, false, "BLOCKED market-data state must stay fail-closed even if malformed input claims paperEligible=true");
assert.equal(blockedCoverage.reason, "no-eligible-validation-candidate");

const unknownCoverageState = buildPaperValidationProbe({
  ...base,
  coverage: {
    ...base.coverage,
    rows: [{ ...base.coverage.rows[0], state: "UNKNOWN" }],
  },
});
assert.equal(unknownCoverageState.staged, false, "unknown market-data states must fail closed");
assert.equal(unknownCoverageState.reason, "no-eligible-validation-candidate");

const duplicate = buildPaperValidationProbe({ ...base, queue: staged.queue });
assert.equal(duplicate.staged, false);
assert.equal(duplicate.reason, "probe-already-pending");

const closed = buildPaperValidationProbe({
  ...base,
  marketSession: {
    ...base.marketSession,
    evidence: { ...base.marketSession.evidence, state: "CLOSED" },
    decision: { allowed: false },
  },
});
assert.equal(closed.staged, false);
assert.equal(closed.reason, "market-session-not-open");

const noApproval = buildPaperValidationProbe({ ...base, approval: { ...base.approval, humanConfirmation: false } });
assert.equal(noApproval.staged, false);
assert.equal(noApproval.reason, "operator-approval-missing");

const staleCoverage = buildPaperValidationProbe({ ...base, coverage: { ...base.coverage, generatedAt: "2026-09-23T15:00:00.000Z" } });
assert.equal(staleCoverage.staged, false);
assert.equal(staleCoverage.reason, "execution-coverage-stale");

const badRisk = buildPaperValidationProbe({
  ...base,
  terminal: { ...base.terminal, assets: [{ ...base.terminal.assets[0], riskScore: 90 }] },
});
assert.equal(badRisk.staged, false);
assert.equal(badRisk.reason, "no-eligible-validation-candidate");

const liveLeak = buildPaperValidationProbe({ ...base, state: { ...base.state, liveTradingAllowed: true } });
assert.equal(liveLeak.staged, false);
assert.equal(liveLeak.reason, "oms-not-paper-only");

const priorRejects = Array.from({ length: 10 }, (_, index) => ({
  clientOrderId: `fenice-paper-validation-2026-09-${String(index + 1).padStart(2, "0")}-SPY`,
  status: "RISK_REJECTED",
  createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T16:55:00.000Z`,
  validationProbe: true,
}));
const rejectBudgetDoesNotFakeFills = buildPaperValidationProbe({
  ...base,
  state: { ...base.state, executions: priorRejects },
});
assert.equal(rejectBudgetDoesNotFakeFills.staged, true, "risk rejects must not satisfy the PAPER fill target");

const targetFills = Array.from({ length: 10 }, (_, index) => ({
  clientOrderId: `other-paper-${index}`,
  status: "PAPER_FILLED",
  createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T16:55:00.000Z`,
}));
const targetComplete = buildPaperValidationProbe({ ...base, state: { ...base.state, executions: targetFills } });
assert.equal(targetComplete.staged, false);
assert.equal(targetComplete.reason, "campaign-paper-fill-target-complete");

const attemptCeiling = Array.from({ length: 20 }, (_, index) => ({
  clientOrderId: `fenice-paper-validation-attempt-${index}`,
  status: "RISK_REJECTED",
  createdAt: `2026-08-${String((index % 20) + 1).padStart(2, "0")}T16:55:00.000Z`,
  validationProbe: true,
}));
const attemptsExhausted = buildPaperValidationProbe({ ...base, state: { ...base.state, executions: attemptCeiling } });
assert.equal(attemptsExhausted.staged, false);
assert.equal(attemptsExhausted.reason, "probe-attempt-budget-exhausted");

console.log("paper validation stager tests: PASS");
