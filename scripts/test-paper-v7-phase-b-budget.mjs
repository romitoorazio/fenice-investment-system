import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessV7PhaseBProposedPaperBudget as assess } from "../lib/trading/paper-v7-phase-b-budget.mjs";

const manifest = JSON.parse(await readFile(
  new URL("../data/paper-v7-phase-b-preparation.json",import.meta.url),"utf8"
));
const base = {
  limits:manifest.proposedRiskLimits,
  virtualEquityEuro:10000, virtualCashEuro:10000,
  currentAssetExposureEuro:0,
  nowMs:Date.parse("2026-10-27T14:30:00.000Z"),
  previousPhaseBAttempts:[],
  intent:{
    id:"phaseb-trial-0001", symbol:"SPY", side:"BUY",
    proposedNotionalEuro:300, phase:"V7_PHASE_B",
    createdAt:"2026-10-27T14:29:30.000Z",
  },
};
const clone=x=>structuredClone(x);
const good=assess(base);
assert.equal(good.state,"NUMERIC_ONLY_NOT_AUTHORIZED",JSON.stringify(good));
assert.equal(good.reasons.length,0);
assert.equal(good.proposedCapEuro,300);
assert.equal(good.recordedPhaseBAttempts,0);
for(const field of [
  "approvalVerified","sourceRightsVerified","finalBaselineVerified",
  "appendOnlyLedgerVerified","canQueueSimulatedPaperOrder",
  "canCreatePhaseBFill","canSubmitBrokerOrder","liveTradingAllowed",
  "modifiesV6","credentialChangesPerformed",
]) assert.equal(good[field],false,field);
const fail=(label,mutate,reason)=>{
  const x=clone(base); mutate(x);
  const r=assess(x);
  assert.equal(r.state,"NUMERIC_PHASE_B_SCREEN_BLOCKED",label);
  assert(r.reasons.includes(reason),label+" "+r.reasons);
  assert.equal(r.canCreatePhaseBFill,false,label);
  assert.equal(r.canSubmitBrokerOrder,false,label);
  assert.equal(r.liveTradingAllowed,false,label);
};
const budget="NOTIONAL_EXCEEDS_PHASE_B_BUDGET_OR_MINIMUM";
const invalid="INTENT_ID_TIME_SIDE_OR_PHASE_INVALID";
fail("notional greater than 300",x=>x.intent.proposedNotionalEuro=301,budget);
fail("notional below 250",x=>x.intent.proposedNotionalEuro=249.99,budget);
fail("notional null",x=>x.intent.proposedNotionalEuro=null,budget);
fail("notional string",x=>x.intent.proposedNotionalEuro="300",budget);
fail("virtual equity too low for 300",x=>x.virtualEquityEuro=9000,budget);
fail("virtual cash inadequate",x=>x.virtualCashEuro=200,budget);
fail("single asset over 15%",x=>x.currentAssetExposureEuro=1300,budget);
fail("equity negative",x=>x.virtualEquityEuro=-1,"VIRTUAL_CAPITAL_OR_EXPOSURE_INVALID");
fail("cash exceeds equity",x=>x.virtualCashEuro=10001,"VIRTUAL_CAPITAL_OR_EXPOSURE_INVALID");
fail("future intent",x=>x.intent.createdAt="2026-10-27T14:30:01.000Z",invalid);
fail("impossible calendar date",x=>x.intent.createdAt="2026-02-30T14:29:30.000Z",invalid);
fail("timezone-less timestamp",x=>x.intent.createdAt="2026-10-27T14:29:30",invalid);
fail("old intent",x=>x.intent.createdAt="2026-10-27T14:20:30.000Z",invalid);
fail("wrong campaign",x=>x.intent.phase="V6",invalid);
fail("invalid intent ID",x=>x.intent.id="x",invalid);
fail("wrong side",x=>x.intent.side="LIVE",invalid);
fail("invalid clock",x=>x.nowMs=NaN,"PHASE_B_CLOCK_INVALID");
fail("relaxed daily cap",x=>x.limits.maxOrdersPerDay=2,
  "PHASE_B_POLICY_NOT_EXACTLY_APPROVED_LIMITS");
fail("relaxed percent cap",x=>x.limits.maxCapitalPercentPerProbe=5,
  "PHASE_B_POLICY_NOT_EXACTLY_APPROVED_LIMITS");
fail("relaxed total attempts",x=>x.limits.maxProbeAttemptsTotal=21,
  "PHASE_B_POLICY_NOT_EXACTLY_APPROVED_LIMITS");
fail("V6 attempt smuggled",x=>x.previousPhaseBAttempts.push({
  id:"legacy-v6",phase:"V6",createdAt:"2026-10-26T14:29:30.000Z",status:"SIM_FILLED"}),
  "PRIOR_PHASE_B_ATTEMPTS_UNVERIFIABLE_OR_DUPLICATE");
const yesterday={id:"phaseb-trial-yesterday",phase:"V7_PHASE_B",
  createdAt:"2026-10-26T14:29:30.000Z",status:"ATTEMPTED"};
assert.equal(assess({...base,previousPhaseBAttempts:[yesterday]}).state,
  "NUMERIC_ONLY_NOT_AUTHORIZED","one previous legitimate attempt on another UTC day is numerically valid");
fail("one attempt per day",x=>x.previousPhaseBAttempts.push({
  ...yesterday,createdAt:"2026-10-27T08:00:00.000Z"}),
  "PHASE_B_ONE_ATTEMPT_PER_UTC_DAY");
fail("duplicate intent",x=>x.previousPhaseBAttempts.push({
  ...yesterday,id:x.intent.id}),"DUPLICATE_PHASE_B_INTENT");
fail("duplicate history record",x=>x.previousPhaseBAttempts.push(yesterday,yesterday),
  "PRIOR_PHASE_B_ATTEMPTS_UNVERIFIABLE_OR_DUPLICATE");
fail("max 20 attempts",x=>x.previousPhaseBAttempts.push(
  ...Array.from({length:20},(_,i)=>({
    id:"phaseb-previous-"+i,phase:"V7_PHASE_B",
    createdAt:new Date(Date.UTC(2026,9,7+i,14)).toISOString(),
    status:"ATTEMPTED",
  }))),"PHASE_B_TOTAL_20_ATTEMPT_CAP_REACHED");
const code=await readFile(new URL("../lib/trading/paper-v7-phase-b-budget.mjs",import.meta.url),"utf8");
assert(!/from ["'][^"']*directa|execFileSync|writeFileSync|fetch\(/.test(code),
  "Pure budget gate must not use broker, shell, persistence or HTTP");
assert.equal(manifest.authorization.approved,false);
assert.equal(manifest.safety.newPaperOrdersAllowed,false);
console.log("Phase B pure numeric budget screening: PASS (no broker/PAPER authority)");
