import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeV7PhaseBFingerprint } from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import { assessNextBaselineCandidate as assess } from "./check-v7-next-baseline-candidate.mjs";

const load=(name)=>JSON.parse(readFileSync("data/"+name,"utf8"));
const candidate=load("paper-v7-next-baseline-candidate.json");
const approval=load("paper-v7-phase-b-approval.json");
const observedFingerprint=await computeV7PhaseBFingerprint(".");
const oldLedger=load("paper-v7-phase-b-forward-ledger.json");
const oldDays=load("paper-v7-phase-b-forward-days.json");
const v6Campaign=load("paper-validation-campaign.json");
const base={candidate,approval,observedFingerprint,oldLedger,oldDays,v6Campaign};
const raw=JSON.stringify({approval,oldLedger,oldDays,v6Campaign});
const result=assess(base);
assert.equal(result.candidatePrepared,true,result.reasons.join(", "));
assert.equal(result.activationAllowed,false);
assert.equal(result.certificationReady,false);
assert.equal(result.oldCampaignResetAllowed,false);
assert.equal(result.liveTradingAllowed,false);
assert.equal(result.brokerConnectivityAllowed,false);
const negatives=[
  ["forged approval", b=>b.candidate.prospectiveApproval.approved=true],
  ["forged human consent", b=>b.candidate.prospectiveApproval.humanConfirmation=true],
  ["unapproved start", b=>b.candidate.prospectiveApproval.approvedAt="2026-10-31T00:00:00.000Z"],
  ["unapproved baseline", b=>b.candidate.prospectiveApproval.baselineCommit="a".repeat(40)],
  ["backfill", b=>b.candidate.prospectiveApproval.allowBackfill=true],
  ["credit old fills", b=>b.candidate.prospectiveApproval.carryForwardHistoricalFills=7],
  ["reduced paper days", b=>b.candidate.prospectiveApproval.minCalendarDays=5],
  ["reduced score", b=>b.candidate.prospectiveApproval.minCommitteeScore=65],
  ["LIVE", b=>b.candidate.prospectiveApproval.liveTradingAllowed=true],
  ["broker", b=>b.candidate.prospectiveApproval.brokerConnectivityAllowed=true],
  ["wrong digest", b=>b.candidate.proposedCoreFingerprint.digest="f".repeat(64)],
  ["wrong old digest", b=>b.approval.coreFingerprint.digest="e".repeat(64)],
  ["missing archive", b=>b.oldDays.days=null],
  ["fake live ledger", b=>b.oldLedger.liveTradingAllowed=true],
];
for(const [name,mutate] of negatives){
  const input=structuredClone(base);mutate(input);
  const check=assess(input);
  assert.equal(check.candidatePrepared,false,name);
  assert.equal(check.activationAllowed,false,name);
}
assert.equal(JSON.stringify({approval,oldLedger,oldDays,v6Campaign}),raw,
  "next-baseline preflight must never mutate existing campaign state");
console.log("V7 new prospective candidate integrity: PASS (14 negative gates; old history preserved; NO activation)");
