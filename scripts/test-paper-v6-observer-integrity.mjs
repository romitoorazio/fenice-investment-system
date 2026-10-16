import assert from "node:assert/strict";
import { evaluateV6ObserverIntegrity as check } from "../lib/intelligence/paper-v6-observer-integrity.mjs";
const approval={approvalId:"v6",expiresAt:"2026-10-24T21:59:59.000Z",
  mode:"PAPER",liveTradingAllowed:false,brokerConnectivityAllowed:false};
const plan={v6:{originalApprovalId:"v6",originalExpiresAt:approval.expiresAt,
  baselineCommit:"a".repeat(40),baselineDigest:"b".repeat(64)}};
const campaign={baselineCommit:plan.v6.baselineCommit,baselineFingerprint:{digest:plan.v6.baselineDigest},
  minPaperFills:10,liveTradingAllowed:false};
const oms={mode:"PAPER",liveTradingAllowed:false,brokerConnectivityAllowed:false};
const queue={mode:"PAPER",orders:[]};
const conditionalQueue={mode:"PAPER",intents:[]};
const certification={state:"ACTIVE",evidenceDays:22,safetyEvidenceDays:22,
  fingerprintEvidenceDays:22,cumulativePaperFills:7};
const base={approval,plan,campaign,oms,queue,conditionalQueue,certification,
  now:Date.parse("2026-10-16T21:00:00Z")};
const good=check(base);
assert.equal(good.issues.length,0);
assert.equal(good.certifiedSafeDays,22);
assert.equal(good.remainingFills,3);
assert.equal(good.newOrderAuthority,false);
assert.equal(check({...base,certification:{...certification,evidenceDays:24,
  safetyEvidenceDays:20,fingerprintEvidenceDays:21}}).certifiedSafeDays,20);
const after=check({...base,now:Date.parse("2026-10-25T00:00:00Z")});
assert.equal(after.status,"PHASE_B_REQUIRED_NO_NEW_PROBES");
assert.equal(after.certifiedSafeDays,22);
assert.equal(check({...base,now:after.originalApprovalExpiresAt?Date.parse(after.originalApprovalExpiresAt)+10000:Date.parse("2026-10-25T00:00:00Z"),
 certification:{...certification,cumulativePaperFills:10}}).status,"PASSIVE_OBSERVATION_ONLY");
for(const [label,patch] of [
 ["PAPER queue",{queue:{mode:"PAPER",orders:[{}]}}],
 ["conditional intents",{conditionalQueue:{mode:"PAPER",intents:[{}]}}],
]){
  const outcome=check({...base,...patch,now:Date.parse("2026-10-25T00:00:00Z")});
  assert(outcome.issues.includes("EXPIRED_APPROVAL_PENDING_ORDERS_QUARANTINE"),label);
  assert.equal(outcome.status,"SAFETY_REVIEW_REQUIRED");
  assert.equal(outcome.mutatesQueue,false);
}
for(const [label,patch] of [
 ["expiry changed",{approval:{...approval,expiresAt:"2026-11-24T21:59:59.000Z"}}],
 ["changed baseline",{campaign:{...campaign,baselineCommit:"c".repeat(40)}}],
 ["LIVE",{oms:{...oms,liveTradingAllowed:true}}],
 ["unknown queue",{queue:{mode:"PAPER"}}],
 ["conditional LIVE",{conditionalQueue:{mode:"LIVE",intents:[]}}],
 ["invalid day counters",{certification:{...certification,safetyEvidenceDays:30}}],
 ["invalid campaign",{certification:{...certification,state:"INVALID"}}],
 ["clock",{now:NaN}],
]){
  const outcome=check({...base,...patch});
  assert(outcome.issues.length>0,label);
  assert.equal(outcome.status,"SAFETY_REVIEW_REQUIRED",label);
  assert.equal(outcome.newOrderAuthority,false,label);
}
console.log("V6 observer safe days and post-expiry PAPER queue quarantine: PASS");
