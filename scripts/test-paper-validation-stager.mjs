import assert from "node:assert/strict";
import { buildPaperValidationProbe } from "./paper-validation-stager.mjs";

const now = "2026-09-23T16:55:00.000Z";
const base = {
  campaign: {
    startedAt: "2026-09-23T14:03:50.751Z",
    baselineCommit: "a".repeat(40),
    baselineFingerprint: { complete: true },
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
    maxOrdersTotal: 10,
    maxOrdersPerDay: 1,
    maxNotionalEuroPerOrder: 100,
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
    rows: [{ symbol: "SPY", paperEligible: true, state: "GREEN", independentSourceFamilies: 2, medianPrice: 773.5 }],
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
assert.equal(staged.staged, true);
assert.equal(staged.order.symbol, "SPY");
assert.equal(staged.order.humanConfirmed, true);
assert.equal(staged.order.validationProbe, true);
assert(staged.order.quantity * 773.5 <= 100.001);
assert.equal(staged.queue.orders.length, 1);

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

console.log("paper validation stager tests: PASS");
