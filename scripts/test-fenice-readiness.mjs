import assert from "node:assert/strict";
import { diagnoseFeniceReadiness } from "../lib/diagnostics/fenice-readiness.mjs";

const NOW = Date.parse("2026-10-23T19:00:00.000Z");
const execution = (status, filledAt, id) =>
  ({status, filledAt, clientOrderId: "fenice-paper-validation-v6-" + id});
const mock = {
  sources: {totalSources: 21, summary: {healthy: 21}, reliabilityScore: 100, critical: {ready: 9, total: 9}},
  campaign: {minPaperFills: 10, liveTradingAllowed: false,
    dailyEvidence: [{date: "2026-10-23", cumulativePaperFilled: 7}]},
  approval: {idPrefix: "fenice-paper-validation-v6-", targetPaperFills: 10, expiresAt: "2026-10-24T21:59:59.000Z",
    liveTradingAllowed: false, brokerConnectivityAllowed: false, minCommitteeScore: 70,
    minValidationDataConfidence: 90, maxRiskScore: 75,
    permittedDecisionStates: ["ACCUMULA","MANTIENI","OSSERVA"], permittedCurrencies: ["USD","EUR"]},
  oms: {mode: "PAPER", liveTradingAllowed: false, brokerConnectivityAllowed: false,
    reconciliation: {balanced: true, breaks: []},
    executions: [...Array.from({length: 7}, (_, i) => execution("PAPER_FILLED",
      "2026-10-12T18:00:00.000Z", "fill-" + i)),
      execution("RISK_REJECTED", null, "rejected-1"),
      execution("RISK_REJECTED", null, "rejected-2")]},
  queue: {mode:"PAPER", orders:[]},
  coverage: {requestedSymbols: 12, paperEligibleSymbols: 4,
    cautionSymbols: ["SPY"], blockedSymbols: ["ASML"],
    rows: [{symbol:"SPY", paperEligible:true, state:"CAUTION",
      independentSourceFamilies:2, medianPrice:760},
      {symbol:"ASML",paperEligible:false,state:"BLOCKED",independentSourceFamilies:1,medianPrice:1572}]},
  committee: {topDecisions:[
    {symbol:"SPY",decision:"ATTENDI",committeeScore:64,confidence:89,
      rawConfidenceBeforeCalibration:99,riskScore:30,currency:"USD"},
    {symbol:"ASML",decision:"ATTENDI",committeeScore:66,confidence:89,
      rawConfidenceBeforeCalibration:99,riskScore:59,currency:"USD"}]},
  terminal: {assets:[
    {symbol:"SPY",decision:"MANTIENI",confidence:99,riskScore:30,currency:"USD"},
    {symbol:"ASML",decision:"ATTENDI",confidence:99,riskScore:59,currency:"USD"}]},
  world: {paperEligible:false,summary:{certifiedPaperFills:0,venuesTracked:8,regions:["europe","asia-pacific"]},
    venues:{XMIL:{paperEligible:false},XTKS:{paperEligible:false}}},
  v7Gate: {state:"LOCKED",eligibleForHumanResearchReview:false,
    evidence:{sevenDay:{sampleSize:4,averageReturnPercent:-4.77},thirtyDay:{sampleSize:0}}},
  shadowCalibration: {researchCalibration:{"7d":{state:"POOR"}}},
  continuationPlan: {phase:"PREPARATION_NOT_EXECUTION"},
};
const report=diagnoseFeniceReadiness(mock,NOW);
const codes=report.alerts.map(x=>x.code);
assert.equal(report.sourceHealth.healthy,21);
assert.equal(report.marketCoverage.qualifiedPaperSymbols,4);
assert.equal(report.paper.recordedFills,7);
assert.equal(report.paper.ledgerMatchesCampaign,true);
assert.equal(report.paper.daysSinceLastFill,11);
assert.equal(report.paper.expired,false);
assert.equal(report.paper.safetyLocksIntact,true);
assert.equal(report.paper.attempts,9);
assert.equal(report.committee.preliminaryCandidates,0);
assert(report.committee.symbolBreakdown[0].preliminaryBlockers.includes("COMMITTEE_DECISION_NOT_PERMITTED"));
assert(report.committee.symbolBreakdown[0].preliminaryBlockers.includes("COMMITTEE_SCORE_BELOW_MINIMUM"));
assert(report.committee.symbolBreakdown[1].preliminaryBlockers.includes("PAPER_QUOTE_QUORUM_MISSING"));
for (const code of ["V6_APPROVAL_WINDOW","V6_FILL_SHORTFALL","NO_PRELIMINARY_PAPER_CANDIDATES",
  "PAPER_QUOTE_COVERAGE_GAP","GLOBAL_V7_RESEARCH_ONLY","V7_FORWARD_EDGE_NOT_PROVEN",
  "V7_CALIBRATION_POOR","HEALTH_NOT_TRADING_ENTITLEMENT"]) assert(codes.includes(code),code);
assert.equal(report.liveTradingAllowed,false);
assert.equal(report.brokerOrderSubmissionAllowed,false);
assert.equal(report.paperOrderSubmissionAuthorizedByThisReport,false);
assert.equal(report.v6FingerprintOrEvidenceModified,false);

const after=diagnoseFeniceReadiness(mock,Date.parse("2026-10-25T10:00:00Z"));
assert.equal(after.paper.expired,true);
assert(after.alerts.find(x=>x.code==="V6_APPROVAL_WINDOW").explanation.includes("NOT authorized"));
assert.equal(after.brokerOrderSubmissionAllowed,false);
const tampered=structuredClone(mock);
tampered.campaign.dailyEvidence[0].cumulativePaperFilled=10;
const mismatch=diagnoseFeniceReadiness(tampered,NOW);
assert.equal(mismatch.paper.ledgerMatchesCampaign,false);
assert.equal(mismatch.paper.recordedFills,7);
const unlocked=structuredClone(mock);
unlocked.oms.liveTradingAllowed=true;
assert.equal(diagnoseFeniceReadiness(unlocked,NOW).paper.safetyLocksIntact,false);
const hypothetical=structuredClone(mock);
hypothetical.committee.topDecisions[0].decision="OSSERVA";
hypothetical.committee.topDecisions[0].committeeScore=75;
assert.equal(diagnoseFeniceReadiness(hypothetical,NOW).committee.preliminaryCandidates,1);
assert.equal(diagnoseFeniceReadiness(hypothetical,NOW).brokerOrderSubmissionAllowed,false);
assert.throws(()=>diagnoseFeniceReadiness(mock,NaN),/INVALID_DIAGNOSTIC_CLOCK/);

console.log("FENICE read-only root-cause diagnostics: PASS; no broker writes, false approvals or fabricated fills");
