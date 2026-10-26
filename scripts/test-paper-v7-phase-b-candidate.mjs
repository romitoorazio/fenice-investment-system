import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessV7PhaseBCandidate as check } from "../lib/ui/paper-v7-phase-b-candidate-audit.mjs";

const read = async path => readFile(new URL("../" + path,import.meta.url),"utf8");
const [candidate,manifest,worldEngineSource] = await Promise.all([
  read("data/paper-v7-phase-b-candidate-reference.json").then(JSON.parse),
  read("data/paper-v7-phase-b-preparation.json").then(JSON.parse),
  read("lib/trading/world-paper-v7.mjs"),
]);
const current = {candidate, manifest, worldEngineSource,
  allPinnedGitBlobsMatch:true, v6FrozenUnchanged:true};
const result = check(current);
assert.equal(result.state,"CANDIDATE_BLOCKED_FOR_PHASE_B_EXECUTION");
assert.equal(result.referenceCommitSha,candidate.referenceCommitSha);
assert.equal(result.checkedPinnedGitBlobs,true);
assert.equal(result.v6FrozenUnchanged,true);
assert.equal(result.worldEngineVirtualSeedEuro,1000);
assert.equal(result.worldEngineMaxPositionPercent,5);
assert.equal(result.proposedMaxPerProbePercent,3);
assert.equal(result.proposedMinProbeEuro,250);
for(const blocker of [
  "V7_POSITION_CAP_EXCEEDS_PHASE_B_3_PERCENT",
  "V7_VIRTUAL_EQUITY_TOO_SMALL_FOR_MINIMUM_TCA_PROBE",
  "PHASE_B_DAILY_ATTEMPT_APPROVAL_AND_AUDIT_WIRING_NOT_REVIEWED",
  "INDEPENDENT_V7_EXECUTION_SOURCE_RIGHTS_NOT_ATTESTED",
  "NEW_PHASE_B_BASELINE_FINGERPRINT_AND_EXPIRY_NOT_APPROVED",
]) assert(result.reasons.includes(blocker),blocker);
assert.equal(manifest.authorization.approved,false);
for(const key of [
  "candidateApprovedBaseline","phaseBApprovalPresent","maySubmitPaperIntents",
  "mayProducePhaseBFills","maySubmitBrokerOrders","liveTradingAllowed",
  "credentialChangesPerformed",
]) assert.equal(result[key],false,key);
assert.equal(result.reportOnly,true);
const checkFailsSafe = input => {
  const x=check(input);
  assert.equal(x.state,"CANDIDATE_BLOCKED_FOR_PHASE_B_EXECUTION");
  assert.equal(x.mayProducePhaseBFills,false);
  assert.equal(x.maySubmitBrokerOrders,false);
  assert.equal(x.liveTradingAllowed,false);
  return x;
};
assert(checkFailsSafe({...current,allPinnedGitBlobsMatch:false}).reasons.includes("PINNED_GIT_BLOBS_UNVERIFIED"));
assert(checkFailsSafe({...current,v6FrozenUnchanged:false}).reasons.includes("FROZEN_V6_CUSTODY_UNVERIFIED"));
assert(checkFailsSafe({...current,candidate:{...candidate,state:"CERTIFIED"}}).reasons.includes("PINNED_CANDIDATE_INVALID"));
assert(checkFailsSafe({...current,candidate:{...candidate,referenceCommitSha:"forged"}}).reasons.includes("PINNED_CANDIDATE_INVALID"));
assert(checkFailsSafe({...current,manifest:{...manifest,phase:"EXECUTING"}}).reasons.includes("OWNER_PREPARATION_IS_NOT_EXECUTION_AUTHORITY"));
assert(checkFailsSafe({...current,manifest:{...manifest,authorization:{...manifest.authorization,approved:true}}}).reasons.includes("OWNER_PREPARATION_IS_NOT_EXECUTION_AUTHORITY"));
assert(checkFailsSafe({...current,manifest:{...manifest,safety:{...manifest.safety,newPaperOrdersAllowed:true}}}).reasons.includes("OWNER_PREPARATION_IS_NOT_EXECUTION_AUTHORITY"));
assert(checkFailsSafe({...current,worldEngineSource:worldEngineSource.replace("const MAX_POSITION_FRACTION = 0.05;","const MAX_POSITION_FRACTION = INVALID;")})
  .reasons.includes("V7_POSITION_CAP_EXCEEDS_PHASE_B_3_PERCENT"));
assert(checkFailsSafe({...current,worldEngineSource:worldEngineSource.replace("const INITIAL_WORLD_PAPER_CASH_EURO = 1000;","const INITIAL_WORLD_PAPER_CASH_EURO = 50;")})
  .reasons.includes("V7_VIRTUAL_EQUITY_TOO_SMALL_FOR_MINIMUM_TCA_PROBE"));
assert(checkFailsSafe({...current,manifest:{...manifest,proposedRiskLimits:{...manifest.proposedRiskLimits,maxOrdersPerDay:5}}})
  .reasons.includes("PHASE_B_DAILY_AND_TOTAL_ATTEMPT_POLICY_INVALID"));
// No positive fixture: current engine is provably unsuitable for owner
// Phase B without a new isolated adapter, signed approval and verified rights.
console.log("V7 Phase B candidate audit: PASS (pinned research reference, real risk gaps, no execution authority)");
