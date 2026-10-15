import assert from "node:assert/strict";
import { diagnosePaperEvidenceBottlenecks } from "../lib/ui/paper-evidence-bottlenecks.ts";
const now = Date.parse("2026-10-15T17:16:00.000Z");
const iso = (offsetSec) => new Date(now + offsetSec*1000).toISOString();
const evidence = { generatedAt: iso(-36), observations: [
  {sourceFamily:"alpaca",symbol:"SPY",eligibility:"VALIDATION_ONLY",provenanceVerified:true,observedAt:iso(-1200)},
  {sourceFamily:"twelve-data",symbol:"SPY",eligibility:"PAPER",provenanceVerified:true,observedAt:iso(-60)},
] };
const coverage = {generatedAt:iso(-10),requestedSymbols:12,paperEligibleSymbols:0};
const oms = {killSwitch:{engaged:false},executions:[
  {symbol:"SPY",status:"RISK_REJECTED",createdAt:iso(-86400),risk:{reasons:["kill-switch: engaged"],checks:[{code:"kill-switch",passed:false}]}},
  {symbol:"QQQ",status:"PAPER_FILLED",createdAt:iso(-30)}
]};
const diagnosis=diagnosePaperEvidenceBottlenecks(evidence,coverage,oms,now);
assert.equal(diagnosis.sources.alpaca.staleAtCollection,1);
assert.equal(diagnosis.sources.alpaca.paperAtCollection,0);
assert.equal(diagnosis.sources["twelve-data"].paperAtCollection,1);
assert.equal(diagnosis.paperEligibleSymbols,0);
assert.equal(diagnosis.lastRiskRejection.symbol,"SPY");
assert.deepEqual(diagnosis.lastRiskRejection.reasons,["kill-switch: engaged"]);
assert.equal(diagnosis.currentKillSwitchEngaged,false);
assert.equal(diagnosis.runtimeSnapshotFresh,true);
assert.equal(diagnosis.liveTradingAllowed,false);
assert.equal(diagnosis.brokerSubmissionAllowed,false);
assert.equal(diagnosePaperEvidenceBottlenecks(evidence,coverage,oms,now+121_000).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks({...evidence,generatedAt:iso(60)},coverage,oms,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks(null,null,null,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks({generatedAt:"2026-02-30T17:16:00.000Z"},coverage,oms,now).runtimeSnapshotFresh,false);
assert.equal(diagnosePaperEvidenceBottlenecks(evidence,coverage,{executions:[]},now).currentKillSwitchEngaged,null);
console.log("Fenice PAPER saved quote age and historical risk diagnostic: PASS");
