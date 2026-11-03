import assert from "node:assert/strict";
import { PINNED_V8_FILES } from "./run-v8-technical-evidence.mjs";
import { freshExecutionLabLedger } from "./run-paper-execution-lab.mjs";
import { evaluateV8PilotRecovery } from "./check-v8-pilot-recovery.mjs";

const start="2026-11-03T19:49:29.150Z";
const core=Object.fromEntries(PINNED_V8_FILES.map(path=>[path,"b".repeat(40)]));
const approval={
  approved:true,humanConfirmation:true,approvalStatus:"ACTIVE_PINNED_PAPER_ONLY",
  mode:"PAPER_TECHNICAL_V8",prospectiveOnly:true,allowBackfill:false,
  minCalendarDays:30,minEvidenceDays:25,
  minTechnicalSamples:10,maxTechnicalSamples:10,
  minIndependentSourceFamilies:2,creditTowardV6:false,creditTowardB2:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,
  autoEnableLiveTrading:false,paidServicesAuthorized:false,
  baselineCommit:"a".repeat(40),effectiveFrom:start,
  expiresAt:"2027-01-02T19:49:29.150Z",
  coreFileBlobs:core,
};
const base=(nowIso="2026-11-04T17:45:00.000Z")=>({
  nowIso,approval:structuredClone(approval),observedCoreBlobs:{...core},
  days:{
    version:1,mode:"V8_TECHNICAL_PAPER_DAYS",
    campaignId:"fenice-v8-paper-technical-20261103",
    liveTradingAllowed:false,brokerConnectivityAllowed:false,records:[],
  },
  samples:freshExecutionLabLedger(),
});
const x=base();
x.approval.campaignId=x.days.campaignId;

const eligible=evaluateV8PilotRecovery(x);
assert.equal(eligible.dispatch,true);
assert.equal(eligible.reason,"MISSING_PROSPECTIVE_V8_PAPER_PROOF");
assert.equal(eligible.missingSample,true);
assert.equal(eligible.missingValidDay,true);
assert.equal(eligible.noBrokerConnectivity,true);
assert.equal(eligible.noLiveTrading,true);
for(const d of ["2026-11-05","2026-11-06"]){
  const item=base(d+"T18:00:00.000Z");
  item.approval.campaignId=item.days.campaignId;
  assert.equal(evaluateV8PilotRecovery(item).dispatch,true,d);
}
const blocked=[
  ["not selected date",x=>x.nowIso="2026-11-07T17:30:00.000Z","NOT_THREE_PILOT_DATES"],
  ["before market",x=>x.nowIso="2026-11-04T14:35:00.000Z","OUTSIDE_US_MARKET_RECOVERY_WINDOW"],
  ["near closing",x=>x.nowIso="2026-11-04T20:01:00.000Z","OUTSIDE_US_MARKET_RECOVERY_WINDOW"],
  ["invalid approval",x=>x.approval.approved=false,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["revoked by no human",x=>x.approval.humanConfirmation=false,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["explicit LIVE flag",x=>x.approval.liveTradingAllowed=true,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["broker flag",x=>x.approval.brokerConnectivityAllowed=true,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["policy dilute",x=>x.approval.minEvidenceDays=3,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["backfill",x=>x.approval.allowBackfill=true,"V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["expired",x=>x.approval.expiresAt="2026-11-04T17:44:59.999Z","V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["short campaign",x=>x.approval.expiresAt="2026-11-09T19:49:29.150Z","V8_APPROVAL_POLICY_OR_TIME_BLOCK"],
  ["core drift",x=>x.observedCoreBlobs[PINNED_V8_FILES[0]]="f".repeat(40),"V8_PINNED_CORE_DRIFT"],
  ["missing core",x=>delete x.observedCoreBlobs[PINNED_V8_FILES[0]],"V8_PINNED_CORE_DRIFT"],
  ["tampered sample",x=>x.samples.cashEuro=1900,"V8_EVIDENCE_REPLAY_BLOCKED"],
  ["tampered day",x=>x.days.records.push({date:"2026-11-04"}),"V8_EVIDENCE_REPLAY_BLOCKED"],
];
for(const [name,mutate,reason] of blocked){
  const item=base();
  item.approval.campaignId=item.days.campaignId;
  mutate(item);
  const got=evaluateV8PilotRecovery(item);
  assert.equal(got.dispatch,false,name);
  assert.equal(got.reason,reason,name);
}
console.log("Fenice Unica three-session recovery: PASS (date/window, V8 approval, SHA freeze, double-ledger replay, fail-closed).");
console.log("No brokerage credentials, historical credit or writes.");
