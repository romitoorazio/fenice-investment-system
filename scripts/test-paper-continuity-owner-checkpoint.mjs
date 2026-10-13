import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPaperContinuityOwnerCheckpoint as checkpoint } from "../lib/ui/paper-continuity-owner-checkpoint.ts";

const base = {
  state: "POST_APPROVAL_OBSERVATION_PLANNED",
  approvalValid: true, newProbeWindowOpen: true, authorizationExpired: false,
  preExpiryOperatorAttentionRequired: true, numericalTargetsMet: false,
  evidenceIntegrityReviewRequired: false, fillCounterHistoryInvalid: false,
  fillCounterRegressionDetected: false, postExpiryFillIncreaseDetected: false,
  missingAuthorizedFills: 3, missingVerifiedEvidenceDays: 6,
  authorizationExpiresAt: "2026-10-24T21:59:59.000Z",
  earliestMaturityAt: "2026-10-25T15:40:35.178Z", daysUntilProbeExpiry: 12,
};
const existingApproval = { maxOrdersPerDay: 1 };
const state = checkpoint(base, existingApproval);
assert.equal(state.status, "OWNER_REVIEW_BEFORE_EXPIRY");
assert.equal(state.illustrativeMinimumDailyProbeWindows, 3);
assert.equal(state.missingAuthorizedPaperFills, 3);
assert.equal(state.missingVerifiedEvidenceDays, 6);
assert.equal(state.humanDecisionNeededBeforeExpiry, true);
assert.equal(state.expiryAt, "2026-10-24T21:59:59.000Z");
assert.equal(state.earliestMaturityAt, "2026-10-25T15:40:35.178Z");

for (const input of [
  [base, existingApproval],
  [{...base,newProbeWindowOpen:false,authorizationExpired:true,preExpiryOperatorAttentionRequired:false},existingApproval],
  [{...base,numericalTargetsMet:true,missingAuthorizedFills:0,missingVerifiedEvidenceDays:0,preExpiryOperatorAttentionRequired:false},existingApproval],
  [{...base,evidenceIntegrityReviewRequired:true},existingApproval],
  [{...base,fillCounterRegressionDetected:true},existingApproval],
  [{...base,postExpiryFillIncreaseDetected:true},existingApproval],
  [{...base,state:"INVALID_POLICY",approvalValid:false},existingApproval],
  [base,{maxOrdersPerDay:0}],
  [base,null],
]) {
  const result = checkpoint(...input);
  assert.equal(result.liveTradingAllowed,false);
  assert.equal(result.brokerOrdersAllowed,false);
  assert.equal(result.newPaperProbesAuthorizedByThisCheck,false);
  assert.equal(result.renewedByThisCheck,false);
  assert.equal(result.paperCertifiedByThisCheck,false);
  assert.equal(result.realProfitVerified,false);
  assert.equal(result.diagnosticOnly,true);
}
assert.equal(checkpoint({...base,authorizationExpired:true,newProbeWindowOpen:false}, existingApproval).status,"APPROVAL_EXPIRED");
assert.equal(checkpoint({...base,missingAuthorizedFills:0,preExpiryOperatorAttentionRequired:false},existingApproval).status,"PASSIVE_EVIDENCE_ONLY");
assert.equal(checkpoint({...base,numericalTargetsMet:true,missingAuthorizedFills:0},existingApproval).status,"NUMERICAL_REVIEW_ONLY");
assert.equal(checkpoint({...base,evidenceIntegrityReviewRequired:true},existingApproval).status,"SAFETY_REVIEW_REQUIRED");
assert.equal(checkpoint(base,{maxOrdersPerDay:0}).illustrativeMinimumDailyProbeWindows,null);
assert.equal(checkpoint(base,{maxOrdersPerDay:2}).illustrativeMinimumDailyProbeWindows,2);
const page = readFileSync(new URL("../app/readiness/page.tsx",import.meta.url),"utf8");
const api = readFileSync(new URL("../app/api/trading/readiness/route.ts",import.meta.url),"utf8");
assert.match(page,/buildPaperContinuityOwnerCheckpoint/);
assert.match(page,/illustrativeMinimumDailyProbeWindows/);
assert.match(page,/nessuna nuova autorizzazione/i);
assert.match(api,/paperContinuityOwnerCheckpoint/);
assert.doesNotMatch(page,/paperApproval\.approved\s*=/);
const core = readFileSync(new URL("../data/paper-validation-approval.json",import.meta.url),"utf8");
assert.equal(JSON.parse(core).liveTradingAllowed,false);
console.log("FENICE100K PAPER V6 owner continuity advisory — PASS (no approval, no orders)");
