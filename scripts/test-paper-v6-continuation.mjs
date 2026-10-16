import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessPaperV6ContinuationPreparation as assess } from "../lib/ui/paper-v6-continuation-preflight.ts";

const plan=JSON.parse(readFileSync(new URL("../data/paper-v6-continuation-plan.json",import.meta.url),"utf8"));
const approval=JSON.parse(readFileSync(new URL("../data/paper-validation-approval.json",import.meta.url),"utf8"));
const now=Date.parse("2026-10-16T20:00:00.000Z");
const digest=plan.v6.baselineDigest;
const evidence=(date,fill,newFill)=>({
  date,observedAt:date+"T18:00:00.000Z",
  cumulativePaperFilled:fill,newPaperFills:newFill,
  validationFingerprint:{complete:true,digest},
  liveTradingAllowed:false,brokerConnectivityAllowed:false,
  auditChainValid:true,reconciliationBalanced:true,reconciliationBreaks:0,
  fillEvidenceProof:{complete:true,requiredFills:newFill,coveredFills:newFill},
});
const historicalDates = Array.from({length:22},(_,i)=>
  new Date(Date.UTC(2026,8,25)+i*86400000).toISOString().slice(0,10));
const campaign={version:6,startedAt:plan.v6.startedAt,baselineCommit:plan.v6.baselineCommit,
  baselineFingerprint:{complete:true,algorithm:"sha256",digest},
  requiredDays:30,minEvidenceDays:25,minPaperFills:10,liveTradingAllowed:false,
  dailyEvidence:historicalDates.map((date,i)=>evidence(date,i===21?7:0,i===21?7:0))};
const ledger={mode:"PAPER",liveTradingAllowed:false,brokerConnectivityAllowed:false,
  reconciliation:{balanced:true,breaks:[]},
  executions:[...Array.from({length:7},()=>({status:"PAPER_FILLED"})),{status:"RISK_REJECTED"},{status:"RISK_REJECTED"}],
  auditChain:Array.from({length:9},(_,i)=>({sequence:i+1}))};
const queue={mode:"PAPER",orders:[]};
const fingerprint={version:1,complete:true,algorithm:"sha256",digest};
const input={plan,campaign,approval,ledger,queue,fingerprint,now};
const clean=assess(input);
assert.equal(clean.status,"ORIGINAL_V6_APPROVAL_ONLY",clean.reasons.join("|"));
assert.equal(clean.carriedHistoricalFills,7);
assert.equal(clean.evidenceDaysVerified,22);
assert.equal(assess({...input,campaign:{...campaign,dailyEvidence:campaign.dailyEvidence.slice(1)}}).status,"BLOCKED_INTEGRITY_REVIEW","dropping 25 September historical day is not a continuation");
assert.equal(assess({...input,ledger:{...ledger,auditChain:ledger.auditChain.slice(1)}}).status,"BLOCKED_INTEGRITY_REVIEW","audit history must be preserved");
assert.equal(clean.remainingOriginalFillTarget,3);
assert.equal(clean.originalBaselineFingerprintMatches,true);
assert.equal(clean.authorizationToStageNewProbesFromPlan,false);
assert.equal(clean.authorizationToRenewOriginalV6,false);
assert.equal(clean.liveTradingAllowed,false);
assert.equal(clean.brokerOrderSubmissionAllowed,false);
const after=assess({...input,now:Date.parse("2026-10-25T00:00:00.000Z")});
assert.equal(after.status,"SEPARATE_PHASE_B_REQUIRED",after.reasons.join("|"));
assert.equal(after.carriedHistoricalFills,7,"expired evidence preserved");
assert.equal(after.postExpiryProbeAllowedFromPlan,false);
const historicalFillBeforeExpiry = evidence("2026-10-20",10,3);
const completedBeforeExpiry = assess({...input,now:Date.parse("2026-10-25T00:00:00Z"),
  campaign:{...campaign,dailyEvidence:[...campaign.dailyEvidence,historicalFillBeforeExpiry]},
  ledger:{...ledger,executions:[...ledger.executions,...Array.from({length:3},()=>({status:"PAPER_FILLED"}))],
    auditChain:[...ledger.auditChain,...Array.from({length:3},(_,i)=>({sequence:10+i}))]}});
assert.equal(completedBeforeExpiry.status,"PASSIVE_CONTINUATION_ONLY");
assert.equal(completedBeforeExpiry.authorizationToStageNewProbesFromPlan,false);

assert.equal(assess({...input, now:Date.parse("2026-10-25T16:00:00.000Z")}).status,
  "SEPARATE_PHASE_B_REQUIRED","30 days do not mint missing fills");
const tests=[
  ["fingerprint changed",{fingerprint:{...fingerprint,digest:"b".repeat(64)}}],
  ["approval expiry forged",{approval:{...approval,expiresAt:"2026-11-03T22:59:59.000Z"}}],
  ["notional widened",{approval:{...approval,maxNotionalEuroPerOrder:301}}],
  ["max attempts widened",{approval:{...approval,maxProbeAttemptsTotal:21}}],
  ["LIVE unlocked",{approval:{...approval,liveTradingAllowed:true}}],
  ["broker unlocked",{ledger:{...ledger,brokerConnectivityAllowed:true}}],
  ["historical fills mismatched",{ledger:{...ledger,executions:[]}}],
  ["history altered",{campaign:{...campaign,dailyEvidence:[...campaign.dailyEvidence.slice(0,1),{...campaign.dailyEvidence[1],validationFingerprint:{complete:true,digest:"b".repeat(64)}}]}}],
  ["fake new scope",{plan:{...plan,phase:"EXECUTE_NEW_PROBES"}}],
  ["unsafe restriction",{plan:{...plan,absoluteRestrictions:{...plan.absoluteRestrictions,mayRenewV6Approval:true}}}],
  ["bad clock",{now:NaN}],
];
for(const [label,override] of tests){
  const result=assess({...input,...override});
  assert.equal(result.status,"BLOCKED_INTEGRITY_REVIEW",label);
  assert(result.reasons.length>0,label);
  assert.equal(result.liveTradingAllowed,false,label);
  assert.equal(result.authorizationToStageNewProbesFromPlan,false,label);
}
const queued=assess({...input,now:Date.parse("2026-10-25T00:00:00.000Z"),
  queue:{mode:"PAPER",orders:[{clientOrderId:"pending-v6"}]}});
assert.equal(queued.status,"BLOCKED_INTEGRITY_REVIEW");
assert(queued.reasons.includes("POST_EXPIRY_PENDING_ORDERS_REQUIRE_QUARANTINE"));
const fakeFill=assess({...input,now:Date.parse("2026-10-26T00:00:00.000Z"),
  campaign:{...campaign,dailyEvidence:[...campaign.dailyEvidence,evidence("2026-10-25",8,1)]},
  ledger:{...ledger,executions:[...ledger.executions,{status:"PAPER_FILLED"}]}});
assert.equal(fakeFill.status,"BLOCKED_INTEGRITY_REVIEW");
assert(fakeFill.reasons.includes("HISTORICAL_V6_CHECKPOINT_REGRESSION")===false,
  "post-expiry counterfeit fill is rejected by expiry check, not confused with lost history");
assert(fakeFill.reasons.includes("HISTORICAL_EVIDENCE_REVIEW_REQUIRED"));
console.log("FENICE V6 continuation preparation: all fail-closed, no-renewal and history tests PASS");
