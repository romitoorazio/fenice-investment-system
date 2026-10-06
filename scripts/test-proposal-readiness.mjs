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
  permittedDecisionStates: ["ACCUMULA", "MANTIENI", "OSSERVA"],
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
      rank: 1, symbol: "READY", name: "Ready Corp", currency: "USD", decision: "COMPRA",
      committeeScore: 82, confidence: 95, rawConfidenceBeforeCalibration: 98, riskScore: 40,
      entryPlan: { orderMode: "LIMITE", maxEntryPrice: 100, firstTrancheEuro: 250 },
    },
    {
      rank: 2, symbol: "PROBE", name: "Probe ETF", currency: "USD", decision: "OSSERVA",
      committeeScore: 75, confidence: 94, rawConfidenceBeforeCalibration: 98, riskScore: 30,
      entryPlan: { orderMode: "NESSUN ORDINE", maxEntryPrice: null, firstTrancheEuro: 0 },
    },
    {
      rank: 3, symbol: "LOW", name: "Low Calibrated Confidence", currency: "USD", decision: "OSSERVA",
      committeeScore: 74, confidence: 84, rawConfidenceBeforeCalibration: 94, riskScore: 30,
      entryPlan: { orderMode: "NESSUN ORDINE", maxEntryPrice: null, firstTrancheEuro: 0 },
    },
  ],
};
const terminal = {
  generatedAt: "2026-10-06T17:35:00Z",
  capitalEuro: 10000,
  assets: [
    { symbol: "READY", currency: "USD", confidence: 98, riskScore: 40, decision: "ACCUMULA" },
    { symbol: "PROBE", currency: "USD", confidence: 98, riskScore: 30, decision: "ACCUMULA" },
    { symbol: "LOW", currency: "USD", confidence: 98, riskScore: 30, decision: "ACCUMULA" },
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

const report = buildV7ProposalReadiness({ approval, committee, terminal, coverage, marketSession }, now);
assert.equal(report.safety.diagnosticOnly, true);
assert.equal(report.safety.queueWritesAllowed, false);
assert.equal(report.safety.paperCertificationEvidenceMutationAllowed, false);
assert.equal(report.safety.brokerSubmissionAllowed, false);
assert.equal(report.safety.liveTradingAllowed, false);
assert.equal(report.safety.userApprovalStillRequired, true);
assert.equal(report.safety.finalProposalRecheckStillRequired, true);

const ready = report.rows.find((row) => row.symbol === "READY");
assert.equal(ready.validationCandidateReady, false, "COMPRA is not one of the V6 validation-probe states");
assert(ready.validationCandidateBlockers.includes("DECISION_STATE_NOT_PERMITTED_FOR_V6_PROBE"));
assert.equal(ready.reviewProposalCandidateReady, true, "a true BUY with a LIMIT plan may be a review candidate");
assert.deepEqual(ready.reviewProposalCandidateBlockers, []);

const probe = report.rows.find((row) => row.symbol === "PROBE");
assert.equal(probe.validationStructurallyReady, true, "OSSERVA may pass candidate-specific V6 gates");
assert.equal(probe.validationCandidateReady, true, "OSSERVA may be a V6 validation candidate when the approval permits it");
assert.equal(probe.reviewProposalCandidateReady, false, "a V6 validation candidate must not become a user BUY proposal");
assert(probe.reviewProposalCandidateBlockers.includes("COMMITTEE_NOT_BUY"));
assert(probe.reviewProposalCandidateBlockers.includes("ENTRY_PLAN_NOT_LIMIT"));

const low = report.rows.find((row) => row.symbol === "LOW");
assert.equal(low.validationCandidateReady, true, "V6 probe cold-start gate uses high pre-calibration data quality");
assert.equal(low.validationDataConfidence, 94);
assert.equal(low.reviewProposalCandidateReady, false, "user proposal requires calibrated confidence");
assert(low.reviewProposalCandidateBlockers.includes("CALIBRATED_CONFIDENCE_BELOW_REVIEW_MINIMUM"));
assert.equal(low.gaps.calibratedConfidenceToReviewMinimum, 6);

const unsafe = buildV7ProposalReadiness({
  approval: { ...approval, liveTradingAllowed: true },
  committee,
  terminal,
  coverage,
  marketSession,
}, now);
assert(unsafe.sharedGlobalBlockers.includes("LIVE_LOCK_NOT_VERIFIED"));
assert(unsafe.rows.every((row) => row.validationCandidateReady === false && row.reviewProposalCandidateReady === false));

const stale = buildV7ProposalReadiness({
  approval,
  committee,
  terminal,
  coverage: { ...coverage, generatedAt: "2026-10-06T16:00:00Z" },
  marketSession,
}, now);
assert(stale.sharedGlobalBlockers.includes("EXECUTION_COVERAGE_STALE"));
assert(stale.rows.every((row) => row.reviewProposalCandidateReady === false));
const staleProbe = stale.rows.find((row) => row.symbol === "PROBE");
assert.equal(staleProbe.validationStructurallyReady, true, "transient freshness blockers must not erase structural candidate readiness");
assert.equal(staleProbe.validationCandidateReady, false, "current readiness must still fail closed while coverage is stale");

console.log("Fenice V7 proposal readiness semantic-separation tests: PASS");
