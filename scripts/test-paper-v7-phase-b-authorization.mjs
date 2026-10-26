import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {phaseBPolicyDigest,verifyFuturePhaseBAuthorization as verify}
  from "../lib/trading/paper-v7-phase-b-authorization.mjs";
import {readFile} from "node:fs/promises";
const manifest=JSON.parse(await readFile(
  new URL("../data/paper-v7-phase-b-preparation.json",import.meta.url),"utf8"));
const policy=manifest.proposedRiskLimits;
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const {publicKey:intruderPublic,privateKey:intruderPrivate}=generateKeyPairSync("ed25519");
const pem=publicKey.export({type:"spki",format:"pem"});
const intruderPem=intruderPublic.export({type:"spki",format:"pem"});
const baselineSha="a".repeat(40),baselineDigest="b".repeat(64);
const nowMs=Date.parse("2026-10-28T12:00:00.000Z");
const p={
  version:1,approvalId:"fenice-v7-phase-b-future-test-20261027",
  mode:"PAPER_SIMULATION_ONLY",approved:true,
  baselineSha,baselineDigest,policySha256:phaseBPolicyDigest(policy),
  issuedAt:"2026-10-27T09:00:00.000Z",
  notBefore:"2026-10-27T15:00:00.000Z",
  expiresAt:"2026-11-27T15:00:00.000Z",
  virtualStartingCapitalEuro:10000,maxOrdersPerDay:1,maxAttempts:20,maxNotionalEuro:300,
  maxCapitalPercentPerProbe:3,minCalendarDays:30,
  minEvidenceDays:25,minPaperFills:10,
  brokerSubmissionAllowed:false,liveTradingAllowed:false,
};
const seal=(payload,key=privateKey)=>({
  payload,signatureBase64:sign(null,Buffer.from(JSON.stringify(payload)),key).toString("base64"),
});
const input={
  envelope:seal(p),
  trustedOperatorPublicKeyPem:pem,
  expectedBaselineSha:baselineSha,
  expectedBaselineDigest:baselineDigest,
  proposedRiskPolicy:policy,nowMs,
};
const good=verify(input);
assert.equal(good.state,"SIGNATURE_AND_SCOPE_VALID_REVIEW_ONLY",good.reasons.join(" | "));
assert.equal(good.reasons.length,0);
assert.equal(good.canCreatePaperFills,false);
assert.equal(good.canSendBrokerOrders,false);
assert.equal(good.currentDeployedBaselineVerified,false);
assert.equal(good.independentOwnerIdentityVerifiedByThisModule,false);
const expectBlock=(label,modify,reason)=>{
  const x=structuredClone({...input,envelope:input.envelope});
  modify(x);
  const v=verify(x);
  assert.equal(v.state,"AUTHORIZATION_UNVERIFIED",label);
  assert(v.reasons.includes(reason),label+": "+v.reasons);
  assert.equal(v.canCreatePaperFills,false,label);
  assert.equal(v.liveTradingAllowed,false,label);
};
expectBlock("missing trusted key",x=>x.trustedOperatorPublicKeyPem=null,
  "NO_PINNED_OPERATOR_VERIFICATION_KEY");
expectBlock("forged signature",x=>x.envelope.signatureBase64=
  seal(x.envelope.payload,intruderPrivate).signatureBase64,"OPERATOR_SIGNATURE_NOT_VERIFIED");
expectBlock("self attested wrong trust",x=>x.trustedOperatorPublicKeyPem=intruderPem,
  "OPERATOR_SIGNATURE_NOT_VERIFIED");
expectBlock("baseline mismatch",x=>x.expectedBaselineSha="c".repeat(40),
  "PHASE_B_BASELINE_NOT_BOUND");
expectBlock("changed policy",x=>x.proposedRiskPolicy={...policy,maxOrdersPerDay:2},
  "SIGNED_LIMITS_OR_POLICY_MISMATCH");
expectBlock("expiry passed",x=>x.nowMs=Date.parse("2026-11-27T15:00:00.000Z"),
  "AUTHORIZATION_WINDOW_NOT_ACTIVE_OR_30_DAYS_TOO_SHORT");
expectBlock("approval not yet active",x=>x.nowMs=Date.parse("2026-10-27T14:59:00.000Z"),
  "AUTHORIZATION_WINDOW_NOT_ACTIVE_OR_30_DAYS_TOO_SHORT");
expectBlock("signed payload expiry edited without resign",
  x=>x.envelope.payload.expiresAt="2026-12-27T15:00:00.000Z",
  "OPERATOR_SIGNATURE_NOT_VERIFIED");
expectBlock("signed max notional edited without resign",
  x=>x.envelope.payload.maxNotionalEuro=301,
  "SIGNED_LIMITS_OR_POLICY_MISMATCH");
expectBlock("LIVE enabled signed falsely",
  x=>x.envelope.payload.liveTradingAllowed=true,"APPROVAL_SCOPE_INVALID");
expectBlock("broker enabled signed falsely",
  x=>x.envelope.payload.brokerSubmissionAllowed=true,"APPROVAL_SCOPE_INVALID");
expectBlock("human data absent",x=>x.envelope={payload:null,signatureBase64:""},
  "SIGNED_PAYLOAD_NOT_CANONICAL");
const shorter={...p,expiresAt:"2026-11-20T15:00:00.000Z"};
expectBlock("valid signed too-short 24-day window",
  x=>x.envelope=seal(shorter),"AUTHORIZATION_WINDOW_NOT_ACTIVE_OR_30_DAYS_TOO_SHORT");
const falseApprove={...p,approved:false};
expectBlock("valid signed not-approved intent",
  x=>x.envelope=seal(falseApprove),"APPROVAL_SCOPE_INVALID");
const alteredCapital={...p,virtualStartingCapitalEuro:15000};
expectBlock("valid signature cannot increase starting virtual equity",
  x=>x.envelope=seal(alteredCapital),"SIGNED_LIMITS_OR_POLICY_MISMATCH");
const shorterLimits={...p,maxOrdersPerDay:3};
expectBlock("valid signed loosened limits",
  x=>x.envelope=seal(shorterLimits),"SIGNED_LIMITS_OR_POLICY_MISMATCH");
const otherPhase={...p,mode:"LIVE"};
expectBlock("valid signed LIVE mode",x=>x.envelope=seal(otherPhase),"APPROVAL_SCOPE_INVALID");
const arbitraryExtra={...p,notes:"trusted because yes"};
expectBlock("signed extra mutable field",
  x=>x.envelope=seal(arbitraryExtra),"SIGNED_PAYLOAD_NOT_CANONICAL");
assert.equal(policy.virtualStartingCapitalEuro,10000);
assert.equal(manifest.ownerInstruction.virtualCapitalConfirmation.amountEuro,10000);
assert.equal(manifest.ownerInstruction.virtualCapitalConfirmation.authorizesExecution,false);
assert.equal(manifest.authorization.approved,false,"no real owner signature must be invented");
assert.equal(manifest.authorization.expiresAt,null,"no real expiry must be invented");
console.log("V7 Phase B future authorization: Ed25519 signature, limits, clock, baseline, 30d expiry PASS; no execution grant");
