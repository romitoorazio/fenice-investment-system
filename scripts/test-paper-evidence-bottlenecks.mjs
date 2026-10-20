import assert from "node:assert/strict";
import { diagnosePaperEvidenceBottlenecks } from "../lib/ui/paper-evidence-bottlenecks.ts";
const now = Date.parse("2026-10-15T17:16:00.000Z");
const iso = (offsetSec) => new Date(now + offsetSec*1000).toISOString();
const evidence = { generatedAt: iso(-36), observations: [
  {sourceFamily:"alpaca",symbol:"SPY",eligibility:"VALIDATION_ONLY",provenanceVerified:true,observedAt:iso(-1200)},
  {sourceFamily:"twelve-data",symbol:"SPY",eligibility:"PAPER",provenanceVerified:true,observedAt:iso(-60)},
] };
const coverage = {generatedAt:iso(-10),evidenceGeneratedAt:iso(-36),requestedSymbols:12,paperEligibleSymbols:0};
const oms = {killSwitch:{engaged:false},executions:[
  {symbol:"SPY",status:"RISK_REJECTED",createdAt:iso(-86400),risk:{reasons:["kill-switch: engaged"],checks:[{code:"kill-switch",passed:false}]}},
  {symbol:"QQQ",status:"PAPER_FILLED",createdAt:iso(-30)}
]};
const diagnosis=diagnosePaperEvidenceBottlenecks(evidence,coverage,oms,now);
assert.equal(diagnosis.sources.alpaca.staleAtCollection,1);
assert.equal(diagnosis.sources.alpaca.paperAtCollection,0);
assert.equal(diagnosis.sources["twelve-data"].paperAtCollection,1);
assert.equal(diagnosis.paperEligibleSymbols,0);
assert.equal(diagnosis.currentPaperEligibleSymbols,0);
assert.equal(diagnosis.coverageSnapshotAt,iso(-10));
assert.equal(diagnosis.coverageEvidenceAligned,true);
const mismatchedBatch = diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,evidenceGeneratedAt:iso(-35),
},oms,now);
assert.equal(mismatchedBatch.coverageEvidenceAligned,false,
  "nearby timestamps from different quote batches are not identity proof");
assert.equal(mismatchedBatch.runtimeSnapshotFresh,false);
assert.equal(mismatchedBatch.currentPaperEligibleSymbols,null);
const missingBatchIdentity = diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,evidenceGeneratedAt:undefined,
},oms,now);
assert.equal(missingBatchIdentity.coverageEvidenceAligned,false);
assert.equal(missingBatchIdentity.runtimeSnapshotFresh,false,
  "legacy coverage without a source evidence identity fails closed");
assert.equal(missingBatchIdentity.currentPaperEligibleSymbols,null);
assert.equal(diagnosis.lastRiskRejection.symbol,"SPY");
assert.deepEqual(diagnosis.lastRiskRejection.reasons,["kill-switch: engaged"]);
assert.equal(diagnosis.currentKillSwitchEngaged,false);
assert.equal(diagnosis.currentKillSwitchProvesHistoricalCause,false);
assert.equal(diagnosis.historicalRejectedAttempts,1);
assert.equal(diagnosis.historicalCompositeVetoAttempts,1);
assert.equal(diagnosis.lastRiskRejection.attribution,"COMPOSITE_VETO_CAUSE_UNKNOWN");
assert.equal(diagnosis.lastRiskRejection.actualKillSwitchAtAttempt,null);
assert.equal(diagnosis.lastRiskRejection.operationalVetoAtAttempt,null);
assert.equal(diagnosis.lastRiskRejection.portfolioVetoAtAttempt,null);
// A current ON/OFF toggle cannot retrospectively prove what blocked V6.
const engagedNow=diagnosePaperEvidenceBottlenecks(evidence,coverage,
  {...oms,killSwitch:{engaged:true}},now);
assert.equal(engagedNow.currentKillSwitchEngaged,true);
assert.equal(engagedNow.lastRiskRejection.attribution,"COMPOSITE_VETO_CAUSE_UNKNOWN");
assert.equal(engagedNow.lastRiskRejection.actualKillSwitchAtAttempt,null);
const ordinaryReject=diagnosePaperEvidenceBottlenecks(evidence,coverage,{
  executions:[{symbol:"QQQ",status:"RISK_REJECTED",createdAt:iso(-100),
    risk:{checks:[{code:"data-confidence",passed:false}],reasons:["data-confidence: insufficient"]}}],
  killSwitch:{engaged:false},
},now);
assert.equal(ordinaryReject.historicalCompositeVetoAttempts,0);
assert.equal(ordinaryReject.lastRiskRejection.attribution,"OTHER_REPORTED_PRETRADE_REJECTION");
assert.equal(ordinaryReject.lastRiskRejection.actualKillSwitchAtAttempt,null);
const reasonOnly=diagnosePaperEvidenceBottlenecks(evidence,coverage,{
  executions:[{symbol:"SPY",status:"RISK_REJECTED",createdAt:iso(-80),
    risk:{reasons:["kill-switch engaged"],checks:[]}}],
  killSwitch:{engaged:false},
},now);
assert.equal(reasonOnly.lastRiskRejection.attribution,"COMPOSITE_VETO_CAUSE_UNKNOWN",
  "even a legacy reason string without a separate check must not claim actual emergency stop");
const noReject=diagnosePaperEvidenceBottlenecks(evidence,coverage,{executions:[]},now);
assert.equal(noReject.lastRiskRejection,null);
assert.equal(noReject.historicalRejectedAttempts,0);
assert.equal(diagnosis.runtimeSnapshotFresh,true);
assert.equal(diagnosis.liveTradingAllowed,false);
assert.equal(diagnosis.brokerSubmissionAllowed,false);
const aged = diagnosePaperEvidenceBottlenecks(evidence,coverage,oms,now+121_000);
assert.equal(aged.runtimeSnapshotFresh,false);
assert.equal(aged.paperEligibleSymbols,0,"historical counts remain preserved for audit");
assert.equal(aged.currentPaperEligibleSymbols,null,"historical quotes cannot be presented as a current trading-ready quorum");
const oldCoverage = diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,generatedAt:iso(-300),paperEligibleSymbols:5,
},oms,now);
assert.equal(oldCoverage.coverageEvidenceAligned,false);
assert.equal(oldCoverage.runtimeSnapshotFresh,false,
  "fresh quote evidence plus older incompatible coverage is NOT a fresh quorum");
assert.equal(oldCoverage.currentPaperEligibleSymbols,null);
const newerEvidence = diagnosePaperEvidenceBottlenecks({
  ...evidence,generatedAt:iso(-5),
},coverage,oms,now);
assert.equal(newerEvidence.runtimeSnapshotFresh,false,
  "coverage generated before quoted evidence cannot attest to that newer quote batch");
const futureCoverage = diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,generatedAt:iso(60),
},oms,now);
assert.equal(futureCoverage.runtimeSnapshotFresh,false,
  "future coverage timestamps must be rejected");
const inflatedCounts = diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,paperEligibleSymbols:13,
},oms,now);
assert.equal(inflatedCounts.runtimeSnapshotFresh,false);
assert.equal(inflatedCounts.currentPaperEligibleSymbols,null,
  "a claimed count higher than the requested symbol universe is not credible");
assert.equal(diagnosePaperEvidenceBottlenecks(evidence,{
  ...coverage,generatedAt:undefined,
},oms,now).runtimeSnapshotFresh,false,
  "missing coverage time cannot borrow freshness from quote evidence");
assert.equal(diagnosePaperEvidenceBottlenecks({...evidence,generatedAt:iso(60)},coverage,oms,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks(null,null,null,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks({generatedAt:"2026-02-30T17:16:00.000Z"},coverage,oms,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks(evidence,coverage,{executions:[]},now).currentKillSwitchEngaged,null);
console.log("Fenice PAPER saved quote age and historical risk diagnostic: PASS");
