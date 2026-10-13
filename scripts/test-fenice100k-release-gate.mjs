import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessFenice100KRelease } from "../lib/ui/fenice100k-release-gate.mjs";

const now = new Date("2026-10-13T14:00:00.000Z");
const committee = {generatedAt:"2026-10-13T13:41:00.000Z",allDecisions:[
  {symbol:"SPY",priceEvidence:{price:779,observedAt:"2026-10-13T13:40:00.000Z",
    evidenceType:"YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY",executionEligible:false,liveTradingAllowed:false}},
  {symbol:"QQQ",priceEvidence:{price:null,observedAt:null,evidenceType:"NO_VERIFIED_REGULAR_TRADE"}},
]};
const sourceHealth = {generatedAt:"2026-10-13T13:55:00.000Z",gate:"GREEN",qualityScore:94};
const engineeringEvidence = {
  generatedAt:"2026-10-13T13:55:00.000Z",
  state:"VERIFIED",
  source:{branch:"main",conclusion:"success",validatedCommit:"abc123"},
  policy:{liveTradingAllowed:false,brokerConnectivityAllowed:false,ciEvidenceCannotAuthorizeLive:true},
};
const paperApproval = {approved:true,liveTradingAllowed:false,brokerConnectivityAllowed:false};
const paperWindow = {verifiedEvidenceDays:18,requiredEvidenceDays:25,reportedFills:7,requiredFills:10,
  elapsedDays:18,requiredDays:30,numericalTargetsMet:false,evidenceIntegrityReviewRequired:false,
  deadlineBeforeMaturity:true,preExpiryOperatorAttentionRequired:true,
  earliestMaturityAt:"2026-10-25T15:40:35.178Z",
  authorizationExpiresAt:"2026-10-24T21:59:59.000Z",liveTradingAllowed:false};
const shadow = {totalRecords:7,safety:{liveTradingAllowed:false,brokerSubmissionAllowed:false},
  forwardBenchmark:{matured:{"7d":{pairedSamples:0,independentEntryDays:0},
  "30d":{pairedSamples:0,independentEntryDays:0}}}};

const assess = (patch={}) => assessFenice100KRelease({
  sourceHealth,committee,engineeringEvidence,paperApproval,paperWindow,shadow,now,...patch,
});
const baseline=assess();
assert.equal(baseline.overall,"RESEARCH_USABLE_NOT_CERTIFIED");
assert.equal(baseline.completeForRealCapital,false);
assert.equal(baseline.verifiedProfit,false);
assert.equal(baseline.brokerAccountReconciled,false);
assert.equal(baseline.gates.dataQuality.state,"RESEARCH_DATA_CURRENT");
assert.equal(baseline.gates.dataQuality.score,94);
assert.equal(baseline.gates.dataQuality.timestampedSingleFamilyResearchQuotes,1);
assert.equal(baseline.gates.riskSystem.state,"HISTORICAL_MAIN_CI_VERIFIED");
assert.equal(baseline.gates.riskSystem.currentDeployedCommitVerified,false);
assert.equal(baseline.gates.paperCertification.state,"NOT_CERTIFIED");
assert.equal(baseline.gates.paperCertification.verifiedEvidenceDays,18);
assert.equal(baseline.gates.paperCertification.reportedFills,7);
assert.equal(baseline.gates.performance.state,"NOT_PROVEN");
assert.equal(baseline.gates.liveLock.state,"LOCKED");
assert.equal(baseline.gates.directa.state,"LOCAL_READ_ONLY_NOT_VERIFIED");
assert.equal(baseline.safety.liveTradingAllowed,false);
assert.equal(baseline.safety.paperCertificationEligible,false);
assert.equal(baseline.safety.automaticPaperRenewalAllowed,false);
assert(baseline.blockers.some(x=>x.id==="P0_PAPER_APPROVAL_WINDOW"));
assert(baseline.blockers.some(x=>x.id==="P1_INSUFFICIENT_FORWARD_ALPHA"));

for(const [name,patch] of [
  ["global source report stale", {sourceHealth:{...sourceHealth,generatedAt:"2026-10-11T13:55:00.000Z"}}],
  ["global source report future", {sourceHealth:{...sourceHealth,generatedAt:"2026-10-14T13:55:00.000Z"}}],
  ["false data gate", {sourceHealth:{...sourceHealth,gate:"GREEN",qualityScore:20}}],
  ["committee stale", {committee:{...committee,generatedAt:"2026-10-11T10:00:00.000Z"}}],
  ["committee missing", {committee:{...committee,allDecisions:[]}}],
]) assert.equal(assess(patch).gates.dataQuality.state,"UNVERIFIED_OR_STALE",name);
for(const [name,patch] of [
  ["stale CI", {engineeringEvidence:{...engineeringEvidence,generatedAt:"2026-10-09T10:00:00.000Z"}}],
  ["CI future timestamp", {engineeringEvidence:{...engineeringEvidence,generatedAt:"2026-10-15T10:00:00.000Z"}}],
  ["CI failure", {engineeringEvidence:{...engineeringEvidence,source:{...engineeringEvidence.source,conclusion:"failure"}}}],
  ["CI on feature branch", {engineeringEvidence:{...engineeringEvidence,source:{...engineeringEvidence.source,branch:"feature"}}}],
]) assert.equal(assess(patch).gates.riskSystem.state,"CI_EVIDENCE_STALE_OR_MISSING",name);

for(const [name,patch] of [
  ["approval unsafe", {paperApproval:{...paperApproval,liveTradingAllowed:true}}],
  ["CI unsafe", {engineeringEvidence:{...engineeringEvidence,policy:{...engineeringEvidence.policy,liveTradingAllowed:true}}}],
  ["shadow unsafe", {shadow:{...shadow,safety:{...shadow.safety,brokerSubmissionAllowed:true}}}],
]) {
  const result=assess(patch);
  assert.equal(result.overall,"SAFETY_BLOCKED",name);
  assert.equal(result.gates.liveLock.state,"SAFETY_FAILURE",name);
  assert.equal(result.safety.liveTradingAllowed,false,name);
  assert(result.blockers.some(x=>x.id==="P0_LIVE_GUARD_INCONSISTENT"),name);
}
const largeSample={...shadow,forwardBenchmark:{matured:{
  "7d":{pairedSamples:100,independentEntryDays:70},
  "30d":{pairedSamples:100,independentEntryDays:70},
}}};
const numericallyMature=assess({shadow:largeSample,paperWindow:{...paperWindow,numericalTargetsMet:true,
  verifiedEvidenceDays:30,reportedFills:20,elapsedDays:60,deadlineBeforeMaturity:false,
  preExpiryOperatorAttentionRequired:false}});
assert.equal(numericallyMature.gates.performance.state,"NUMERICALLY_MATURE_HUMAN_REVIEW_REQUIRED");
assert.equal(numericallyMature.gates.paperCertification.state,"NOT_CERTIFIED");
assert.equal(numericallyMature.completeForRealCapital,false);
assert.equal(numericallyMature.verifiedProfit,false);
assert.equal(numericallyMature.gates.liveLock.state,"LOCKED");
const correlated=assess({shadow:{...shadow,forwardBenchmark:{matured:{
  "7d":{pairedSamples:50,independentEntryDays:1},
  "30d":{pairedSamples:50,independentEntryDays:1}}}}});
assert.equal(correlated.gates.performance.state,"NOT_PROVEN","symbols from one day are not independent");

assert.throws(()=>assess({now:new Date("invalid")}),/Invalid release assessment/);

const readiness=await readFile(new URL("../app/readiness/page.tsx",import.meta.url),"utf8");
assert.match(readiness,/FENICE100K · Collaudo finale/);
assert.match(readiness,/assessFenice100KRelease/);
assert.match(readiness,/releaseGate\.gates/);
assert.match(readiness,/completeForRealCapital/);
assert.match(readiness,/releaseGate\.blockers/);
console.log("FENICE100K release acceptance tests: PASS (PAPER/LIVE/real profit fail closed)");
