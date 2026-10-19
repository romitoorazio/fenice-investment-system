import assert from "node:assert/strict";
import { planPaperV7ProbePriority, assessProviderFeasibilitySnapshot } from "./plan-paper-v7-probe-priority.mjs";

const diagnostic = {
  candidates: [
    { symbol: "A", failedGates: ["execution-coverage"], metrics: { committeeScore: 80, validationDataConfidence: 95, riskScore: 30, notionalCapacityEuro: 300 } },
    { symbol: "B", failedGates: ["execution-coverage", "committee-score"], metrics: { committeeScore: 69, validationDataConfidence: 96, riskScore: 20, notionalCapacityEuro: 300 } },
    { symbol: "C", failedGates: ["execution-coverage"], metrics: { committeeScore: 90, validationDataConfidence: 97, riskScore: 25, notionalCapacityEuro: 300 } },
    { symbol: "D", failedGates: ["execution-coverage", "committee-score", "data-confidence"], metrics: { committeeScore: 60, validationDataConfidence: 80, riskScore: 20, notionalCapacityEuro: 300 } },
  ],
};
const observedAt="2026-10-19T15:12:00.000Z";
const now="2026-10-19T15:12:20.000Z";
const feasibility = {
  state: "OPEN_SESSION_SAMPLED",
  generatedAt: observedAt,
  sessionFreshAtReport: true,
  quoteProvidersQueried: true,
  marketSession: { evidence: { authoritative: true, state: "OPEN", observedAt } },
  targets: [
    { symbol: "A", quorumCompatible: true, crossSourceSpreadPercent: 0.02 },
    { symbol: "B", quorumCompatible: true, crossSourceSpreadPercent: 0.03 },
    { symbol: "C", quorumCompatible: false, crossSourceSpreadPercent: 1.4 },
    { symbol: "D", quorumCompatible: true, crossSourceSpreadPercent: 0.04 },
    { symbol: "E", quorumCompatible: true, crossSourceSpreadPercent: 0.01 },
  ],
};

const report = planPaperV7ProbePriority({ diagnostic, feasibility, now });
assert.equal(report.providerSnapshotStatus,"RECENT_VERIFIED_OPEN_SESSION_SAMPLE");
assert.equal(report.providerSnapshotVerified,true);
assert.equal(report.providerSampleAgeSeconds,20);
assert.equal(report.plannedForVersion, 7);
assert.equal(report.activationAllowed, false);
assert.equal(report.currentV6Modified, false);
assert.equal(report.liveTradingAllowed, false);
assert.deepEqual(report.recommendedExpansionOrder, ["A", "B"]);
assert.equal(report.rows[0].symbol, "A");
assert.equal(report.rows[0].classification, "PROMOTE_COVERAGE_ONLY");
assert.equal(report.rows[1].symbol, "B");
assert.equal(report.rows[1].classification, "PROMOTE_ONE_STRUCTURAL_GATE");
assert.equal(report.rows.find((row) => row.symbol === "C").classification, "DEFER_PROVIDER_QUORUM");
assert.equal(report.rows.find((row) => row.symbol === "D").classification, "DEFER_MULTI_GATE");
assert.equal(report.rows.find((row) => row.symbol === "E").classification, "DEFER_MISSING_CANDIDATE");
assert.equal(report.recommendedExpansionOrder.includes("E"), false);
const missing=planPaperV7ProbePriority({diagnostic:{candidates:[]},feasibility:{targets:[
  {symbol:"Z",quorumCompatible:false,crossSourceSpreadPercent:null},
  {symbol:"Y",quorumCompatible:false,crossSourceSpreadPercent:""},
  {symbol:"X",quorumCompatible:false,crossSourceSpreadPercent:-2},
]}});
assert(missing.rows.every(row=>row.crossSourceSpreadPercent===null),
  "missing or negative provider spread must not be invented as 0 percent");
const closed={...feasibility,state:"SKIPPED_NO_OPEN_SESSION",quoteProvidersQueried:false,
  sessionFreshAtReport:false};
const closedPlan=planPaperV7ProbePriority({diagnostic,feasibility:closed,now});
assert.deepEqual(closedPlan.recommendedExpansionOrder,[],"closed provider sample must never promote");
assert(closedPlan.rows.every(x=>x.classification==="DEFER_UNOBSERVED_OR_STALE_SESSION"));
assert.equal(closedPlan.providerSnapshotStatus,"NO_VERIFIED_OPEN_SESSION_SAMPLE");
assert.equal(closedPlan.rows[0].sourceQuorumClaimUntrustedWhenStale,true);
const late=planPaperV7ProbePriority({diagnostic,feasibility,now:"2026-10-19T15:24:00.000Z"});
assert.deepEqual(late.recommendedExpansionOrder,[]);
assert.equal(late.providerSnapshotStatus,"EXPIRED_OR_INVALID_PROVIDER_SAMPLE");
const wrongName=planPaperV7ProbePriority({diagnostic,feasibility:{...feasibility,
  marketSession:{evidence:{authoritative:false,state:"OPEN"}}},now});
assert.deepEqual(wrongName.recommendedExpansionOrder,[]);
const future=planPaperV7ProbePriority({diagnostic,feasibility:{...feasibility,
  generatedAt:"2026-10-19T15:13:01.000Z"},now});
assert.deepEqual(future.recommendedExpansionOrder,[],"future provider report must be rejected");
assert.equal(assessProviderFeasibilitySnapshot({state:"OPEN_SESSION_SAMPLED",
  sessionFreshAtReport:true,quoteProvidersQueried:true},now).verifiedOpenSample,false);
assert.equal(assessProviderFeasibilitySnapshot(feasibility,"invalid").verifiedOpenSample,false);
console.log("paper V7 probe priority planner tests: PASS (closed/late/future checks fail closed)");
