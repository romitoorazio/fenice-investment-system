import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessFenice100KRelease, assessProductionCommitEvidence } from "../lib/ui/fenice100k-release-gate.mjs";
import { assessHistoricalCredentialRotation } from "../lib/ui/credential-rotation-gate.mjs";
import { assessGitHubProductionChecks, readGitHubProductionChecks, REQUIRED_FENICE_CHECKS } from "../lib/ui/github-production-checks.mjs";

const now = new Date("2026-10-13T14:00:00.000Z");
const committee = {generatedAt:"2026-10-13T13:41:00.000Z",allDecisions:[
  {symbol:"SPY",priceEvidence:{price:779,observedAt:"2026-10-13T13:40:00.000Z",
    evidenceType:"YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY",executionEligible:false,liveTradingAllowed:false}},
  {symbol:"QQQ",priceEvidence:{price:null,observedAt:null,evidenceType:"NO_VERIFIED_REGULAR_TRADE"}},
]};
const sourceHealth = {generatedAt:"2026-10-13T13:55:00.000Z",gate:"GREEN",qualityScore:94};
const fullCiSha = "a".repeat(40);
const engineeringEvidence = {
  generatedAt:"2026-10-13T13:55:00.000Z",
  state:"VERIFIED",
  source:{branch:"main",conclusion:"success",validatedCommit:fullCiSha},
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
assert.equal(baseline.gates.credentialRotation.state,"HISTORICAL_ROTATION_UNVERIFIED");
assert.equal(baseline.gates.credentialRotation.credentialsRevokedAtProvidersVerified,false);
assert.equal(baseline.gates.credentialRotation.replacementKeysVerified,false);
assert.equal(baseline.gates.credentialRotation.brokerWritesAllowed,false);
assert.equal(baseline.gates.credentialRotation.liveTradingAllowed,false);
assert(baseline.blockers.some(x=>x.id==="P0_HISTORICAL_PROVIDER_KEYS_UNVERIFIED"));
for (const falseAssurance of [
  {sourceGate:"GREEN",rotationComplete:true,allKeysRotated:true},
  {currentTreeSecretScan:"PASS",historicalCredentialsInvalidated:true},
  {configuredSecrets:true,providerCredentialsVerified:true},
]) {
  const outcome = assessHistoricalCredentialRotation(falseAssurance);
  assert.equal(outcome.historicalExposureResolved,false,"self-declared flags never certify historical revocation");
  assert.equal(outcome.credentialsRevokedAtProvidersVerified,false);
  assert.equal(assess({credentialRotationEvidence:falseAssurance}).gates.credentialRotation.state,
    "HISTORICAL_ROTATION_UNVERIFIED");
}
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


const evidenceFor = (deploymentCommit, deploymentEnvironment = "production", patch = {}) =>
  assessProductionCommitEvidence({...engineeringEvidence,...patch}, {
    deploymentCommit, deploymentEnvironment, now,
  });
assert.equal(evidenceFor(fullCiSha).state, "MATCHES_RECORDED_MAIN_CI");
assert.equal(evidenceFor(fullCiSha).exactShaMatch, true);
assert.equal(evidenceFor(fullCiSha).independentlyAttested, false);
assert.equal(evidenceFor(fullCiSha).authorizesPaper, false);
assert.equal(evidenceFor(fullCiSha).authorizesLive, false);
for (const [name, commit, env, expected] of [
  ["mismatch", "b".repeat(40), "production", "PRODUCTION_CI_SHA_MISMATCH"],
  ["short", "abc123", "production", "PRODUCTION_SHA_MISSING_OR_INVALID"],
  ["empty", null, "production", "PRODUCTION_SHA_MISSING_OR_INVALID"],
  ["future", fullCiSha, "preview", "DEPLOYMENT_METADATA_UNAVAILABLE"],
  ["local", fullCiSha, null, "DEPLOYMENT_METADATA_UNAVAILABLE"],
]) {
  const assessed=evidenceFor(commit,env);
  assert.equal(assessed.state,expected,name);
  assert.equal(assessed.exactShaMatch,false,name);
}
for (const patch of [
  {source:{...engineeringEvidence.source,branch:"feature"}},
  {source:{...engineeringEvidence.source,validatedCommit:"short"}},
  {source:{...engineeringEvidence.source,conclusion:"failure"}},
  {generatedAt:"2026-10-10T00:00:00Z"},
  {generatedAt:"2026-10-18T00:00:00Z"},
  {policy:{...engineeringEvidence.policy,liveTradingAllowed:true}},
]) assert.equal(evidenceFor(fullCiSha,"production",patch).state,"CI_RECORD_MISSING_OR_STALE");
const productionBoard=assess({deploymentCommit:fullCiSha,deploymentEnvironment:"production"});
assert.equal(productionBoard.gates.riskSystem.productionCommitEvidence.exactShaMatch,true);
assert.equal(productionBoard.gates.riskSystem.currentDeployedCommitVerified,false,"metadata is not independent release verification");
assert.equal(productionBoard.completeForRealCapital,false);
assert.equal(productionBoard.gates.liveLock.state,"LOCKED");
assert.equal(assess({deploymentCommit:"b".repeat(40),deploymentEnvironment:"production"}).blockers
  .some(b=>b.id==="P0_PRODUCTION_SHA_CI_MISMATCH_OR_UNVERIFIED"),true);
assert.equal(assess({deploymentCommit:fullCiSha,deploymentEnvironment:"production"}).blockers
  .some(b=>b.id==="P0_PRODUCTION_SHA_CI_MISMATCH_OR_UNVERIFIED"),false);
assert.throws(()=>assessProductionCommitEvidence(engineeringEvidence,{now:new Date("invalid")}),/Invalid production/);

const checksNow = Date.parse("2026-10-13T14:00:00.000Z");
const goodChecks = (sha = fullCiSha) => ({
  total_count: REQUIRED_FENICE_CHECKS.length,
  check_runs: REQUIRED_FENICE_CHECKS.map((name,i)=>({
    id:i+1, name, head_sha:sha, app:{slug:"github-actions"},
    status:"completed", conclusion:"success", completed_at:"2026-10-13T13:59:00.000Z",
  })),
});
const observed = assessGitHubProductionChecks(goodChecks(), fullCiSha, checksNow);
assert.equal(observed.state,"EXACT_SHA_CHECKS_VERIFIED");
assert.equal(observed.verified,true);
assert.equal(observed.authorizesLive,false);
assert.equal(observed.authorizesPaper,false);
assert.equal(observed.verifiesVercelAlias,false);
const matchingBoard=assess({deploymentCommit:fullCiSha,deploymentEnvironment:"production",
  externalProductionCI:observed});
assert.equal(matchingBoard.gates.riskSystem.externalExactCIObserved,true);
assert.equal(matchingBoard.gates.riskSystem.currentDeployedCommitVerified,false);
assert.equal(matchingBoard.completeForRealCapital,false);
assert.equal(matchingBoard.gates.liveLock.state,"LOCKED");
const olderStored=assess({deploymentCommit:"b".repeat(40),deploymentEnvironment:"production",
  externalProductionCI:assessGitHubProductionChecks(goodChecks("b".repeat(40)),"b".repeat(40),checksNow)});
assert.equal(olderStored.gates.riskSystem.productionCommitEvidence.exactShaMatch,false);
assert.equal(olderStored.gates.riskSystem.externalExactCIObserved,true);
assert(!olderStored.blockers.some(x=>x.id==="P0_PRODUCTION_SHA_CI_MISMATCH_OR_UNVERIFIED"),
  "Independent exact Github checks should supersede an old persisted CI snapshot");
for(const [name,payload] of [
  ["one missing check",{...goodChecks(),check_runs:goodChecks().check_runs.slice(1)}],
  ["wrong SHA",goodChecks("b".repeat(40))],
  ["third party",{...goodChecks(),check_runs:goodChecks().check_runs.map((x,i)=>i?x:{...x,app:{slug:"other"}})}],
  ["latest failed rerun",{total_count:REQUIRED_FENICE_CHECKS.length+1,check_runs:[
    ...goodChecks().check_runs, {id:999,name:"quality",head_sha:fullCiSha,
      app:{slug:"github-actions"},status:"completed",conclusion:"failure",
      completed_at:"2026-10-13T13:59:50.000Z"}]}],
  ["future evidence",{...goodChecks(),check_runs:goodChecks().check_runs.map(x=>({...x,completed_at:"2026-10-14T13:59:00.000Z"}))}],
  ["partial API",{...goodChecks(),total_count:101}],
]) {
  assert.equal(assessGitHubProductionChecks(payload,fullCiSha,checksNow).verified,false,name);
}
const unverified=assess({deploymentCommit:"b".repeat(40),deploymentEnvironment:"production",
  externalProductionCI:observed});
assert(unverified.blockers.some(x=>x.id==="P0_PRODUCTION_SHA_CI_MISMATCH_OR_UNVERIFIED"),
  "Cannot certify a different SHA with unrelated remote checks");
const urls=[];
const probe=async (url,options) => {
  urls.push({url,options});
  return {ok:true,json:async()=>goodChecks()};
};
const fetched=await readGitHubProductionChecks({
  commit:fullCiSha,environment:"production",fetcher:probe,nowMs:checksNow,
});
assert.equal(fetched.verified,true);
assert.deepEqual(urls.map(x=>x.url),[
  `https://api.github.com/repos/romitoorazio/fenice-investment-system/commits/${fullCiSha}/check-runs?per_page=100`]);
assert.equal(urls[0].options.method,"GET");
assert.equal(urls[0].options.next.revalidate,300);
assert(!JSON.stringify(urls).includes("token"));
const emptyFetch=async()=>{throw new Error("offline");};
assert.equal((await readGitHubProductionChecks({
  commit:fullCiSha,environment:"production",fetcher:emptyFetch,nowMs:checksNow,
})).verified,false);
assert.equal((await readGitHubProductionChecks({
  commit:fullCiSha,environment:"preview",fetcher:probe,nowMs:checksNow,
})).verified,false);
assert.equal(urls.length,1,"Preview must never contact GitHub");


assert.throws(()=>assess({now:new Date("invalid")}),/Invalid release assessment/);

const readiness=await readFile(new URL("../app/readiness/page.tsx",import.meta.url),"utf8");
assert.match(readiness,/FENICE100K · Collaudo finale/);
assert.match(readiness,/assessFenice100KRelease/);
assert.match(readiness,/releaseGate\.gates/);
assert.match(readiness,/completeForRealCapital/);
assert.match(readiness,/releaseGate\.blockers/);
assert.match(readiness,/releaseGate\.gates\.credentialRotation/);
assert.match(readiness,/deploymentCommit: process\.env\.VERCEL_GIT_COMMIT_SHA/);
assert.match(readiness,/deploymentEnvironment: process\.env\.VERCEL_ENV/);
assert.match(readiness,/productionCommitEvidence/);
assert.match(readiness,/readGitHubProductionChecks/);
const api = await readFile(new URL("../app/api/trading/readiness/route.ts",import.meta.url),"utf8");
assert.match(api,/credentialRotation: assessHistoricalCredentialRotation\(\)/);
assert.match(api,/releaseCommitEvidence: assessProductionCommitEvidence/);
assert.match(api,/externalProductionCI/);
assert(!api.includes("credentialsRevokedAtProvidersVerified: true"),"API must not claim key revocation");
console.log("FENICE100K release acceptance tests: PASS (PAPER/LIVE/real profit fail closed)");
