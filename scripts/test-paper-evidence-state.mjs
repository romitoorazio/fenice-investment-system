import assert from "node:assert/strict";
import { classifyPaperEvidenceState } from "../lib/ui/paper-evidence-state.ts";

const closedSafeEvidence = {
  newPaperFills: 0,
  cumulativeRiskRejected: 0,
  auditChainValid: true,
  reconciliationBalanced: true,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  marketSession: {
    evidence: { state: "CLOSED", authoritative: true },
    decision: { allowed: false },
  },
};

assert.equal(classifyPaperEvidenceState(closedSafeEvidence), "MARKET_CLOSED_NO_RISK");
assert.equal(
  classifyPaperEvidenceState({
    ...closedSafeEvidence,
    marketSession: { ...closedSafeEvidence.marketSession, evidence: { state: "CLOSED", authoritative: false } },
  }),
  "RECORDED",
  "unverified closed-market state must not be presented as protected evidence",
);
assert.equal(
  classifyPaperEvidenceState({ ...closedSafeEvidence, newPaperFills: 1 }),
  "RECORDED",
  "a cycle with a fill must not be presented as closed-market no-risk evidence",
);
assert.equal(
  classifyPaperEvidenceState({ ...closedSafeEvidence, reconciliationBalanced: false }),
  "RECORDED",
  "unbalanced reconciliation must fail closed in the UI classification",
);
assert.equal(
  classifyPaperEvidenceState({
    ...closedSafeEvidence,
    cumulativeRiskRejected: 2,
    marketSession: undefined,
  }),
  "RISK_REJECTED_NO_TRADE",
);

const previous = { ...closedSafeEvidence, cumulativeRiskRejected: 2 };
const sameTotalToday = { ...closedSafeEvidence, cumulativeRiskRejected: 2, marketSession: undefined };
assert.equal(classifyPaperEvidenceState(sameTotalToday, previous), "RECORDED",
  "a prior-day rejection must not falsely classify a new zero-activity day");
assert.equal(classifyPaperEvidenceState({ ...sameTotalToday, cumulativeRiskRejected: 3 }, previous),
  "RISK_REJECTED_NO_TRADE", "genuine new rejection remains visible");
assert.equal(classifyPaperEvidenceState({ ...sameTotalToday, cumulativeRiskRejected: 1 }, previous),
  "RECORDED", "decreasing counters must never fabricate a rejection");
assert.equal(classifyPaperEvidenceState({ ...sameTotalToday, cumulativeRiskRejected: null }, previous),
  "RECORDED", "invalid counters must fail closed");
console.log("Fenice PAPER evidence UI state tests: PASS");
