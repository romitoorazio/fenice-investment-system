import assert from "node:assert/strict";
import { buildV7ProposalReadiness } from "../lib/intelligence/proposal-readiness.mjs";

const now = Date.parse("2026-10-06T17:40:00Z");
const approval = {
  approved: true,
  mode: "PAPER",
  expiresAt: "2026-10-24T21:59:59Z",
  minCommitteeScore: 70,
  minValidationDataConfidence: 90,
  maxRiskScore: 75,
  permittedDecisionStates: ["ACCUMULA", "MANTIENI", "OSSERVA", "COMPRA"],
  permittedCurrencies: ["USD", "EUR"],
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};
const committee = {
  generatedAt: "2026-10-06T17:35:00Z",
  sourceGate: "GREEN",
  executionGate: "PRONTO_CON_CONFERMA",
  allDecisions: [
    {
      rank: 1, symbol: "READY", name: "Ready Corp", currency: "USD", decision: "COMPRA", terminalDecision: "ACCUMULA",
      committeeScore: 82, confidence: 95, rawConfidenceBeforeCalibration: 98, riskScore: 40,
      entryPlan: { orderMode: "LIMITE", maxEntryPrice: 100, firstTrancheEuro: 250 },
    },
    {
      rank: 2, symbol: "PROBE", name: "Probe ETF", currency: "USD", decision: "OSSERVA", terminalDecision: "ACCUMULA",
      committeeScore: 75, confidence: 94, rawConfidenceBeforeCalibration: 98, riskScore: 30,
      entryPlan: { orderMode: "NESSUN ORDINE", maxEntryPrice: null, firstTrancheEuro: 0 },
    },
    {
      rank: 3, symbol: "LOW", name: "Low Confidence", currency: "USD", decision: "OSSERVA", terminalDecision: "ACCUMULA",
      committeeScore: 74, confidence: 84, rawConfidenceBeforeCalibration: 94, riskScore: 30,
      entryPlan: { orderMode: "NESSUN ORDINE", maxEntryPrice: null, firstTrancheEuro: 0 },
    },
  ],
};
const coverage = {
  generatedAt: "2026-10-06T17:39:00Z",
  policy: { requiredEligibility: "PAPER", liveTradingAllowed: false, minIndependentSourceFamilies: 2 },
  rows: [
    { symbol: "READY", state: "GREEN", paperEligible: true, independentSourceFamilies: 2 },
    { symbol: "PROBE", state: "GREEN", paperEligible: true, independentSourceFamilies: 2 },
    { symbol: "LOW", state: "GREEN", paperEligible: true, independentSourceFamilies: 2 },
  ],
};
const marketSession = {
  configured: true,
  liveTradingAllowed: false,
  decision: { allowed: true },
  evidence: { observedAt: "2026-10-06T17:39:30Z" },
};

const report = buildV7ProposalReadiness({ approval, committee, coverage, marketSession }, now);
assert.equal(report.safety.diagnosticOnly, true);
assert.equal(report.safety.queueWritesAllowed, false);
assert.equal(report.safety.paperCertificationEvidenceMutationAllowed, false);
assert.equal(report.safety.brokerSubmissionAllowed, false);
assert.equal(report.safety.liveTradingAllowed, false);
assert.equal(report.safety.userApprovalStillRequired, true);

const ready = report.rows.find((row) => row.symbol === "READY");
assert.equal(ready.paperProbeEligible, true);
assert.equal(ready.reviewProposalEligible, true);
assert.deepEqual(ready.reviewProposalBlockers, []);

const probe = report.rows.find((row) => row.symbol === "PROBE");
assert.equal(probe.paperProbeEligible, true, "OSSERVA may be a V6 validation probe when approval permits it");
assert.equal(probe.reviewProposalEligible, false, "a validation probe must not become a user BUY proposal");
assert(probe.reviewProposalBlockers.includes("COMMITTEE_NOT_BUY"));
assert(probe.reviewProposalBlockers.includes("ENTRY_PLAN_NOT_LIMIT"));

const low = report.rows.find((row) => row.symbol === "LOW");
assert.equal(low.paperProbeEligible, false);
assert(low.paperProbeBlockers.includes("CALIBRATED_CONFIDENCE_BELOW_PAPER_MINIMUM"));
assert.equal(low.gaps.calibratedConfidence, 6);

const unsafe = buildV7ProposalReadiness({
  approval: { ...approval, liveTradingAllowed: true },
  committee,
  coverage,
  marketSession,
}, now);
assert(unsafe.globalBlockers.includes("LIVE_LOCK_NOT_VERIFIED"));
assert(unsafe.rows.every((row) => row.paperProbeEligible === false && row.reviewProposalEligible === false));

const stale = buildV7ProposalReadiness({
  approval,
  committee,
  coverage: { ...coverage, generatedAt: "2026-10-06T16:00:00Z" },
  marketSession,
}, now);
assert(stale.globalBlockers.includes("EXECUTION_COVERAGE_STALE"));
assert(stale.rows.every((row) => row.reviewProposalEligible === false));

console.log("Fenice V7 proposal readiness fail-closed tests: PASS");
