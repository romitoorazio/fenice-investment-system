import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gate} from "./paper-probe-operator-gate.mjs";
const plan=JSON.parse(readFileSync(new URL("../data/paper-v6-continuation-plan.json",import.meta.url),"utf8"));
const approval=JSON.parse(readFileSync(new URL("../data/paper-validation-approval.json",import.meta.url),"utf8"));
const campaign={version:6,liveTradingAllowed:false,baselineCommit:plan.v6.baselineCommit,
  baselineFingerprint:{digest:plan.v6.baselineDigest,complete:true}};
const queue={mode:"PAPER",orders:[]};
const input={plan,approval,campaign,queue,now:Date.parse("2026-10-16T18:00:00Z")};
assert.equal(gate(input).allowed,true);
for(const [name,patch,reason] of [
  ["expired",{now:Date.parse("2026-10-25T00:00:00Z")},"expiry-too-close"],
  ["near-expiry",{now:Date.parse("2026-10-24T21:40:00Z")},"expiry-too-close"],
  ["forged extension",{approval:{...approval,expiresAt:"2026-11-24T21:59:59.000Z"}},"expiry-invalid"],
  ["no human",{approval:{...approval,humanConfirmation:false}},"safety-lock-invalid"],
  ["LIVE",{approval:{...approval,liveTradingAllowed:true}},"safety-lock-invalid"],
  ["broker",{approval:{...approval,brokerConnectivityAllowed:true}},"safety-lock-invalid"],
  ["cap",{approval:{...approval,maxNotionalEuroPerOrder:301}},"limits-invalid"],
  ["FX",{approval:{...approval,fxPolicy:{...approval.fxPolicy,requiredForNonEuro:false}}},"limits-invalid"],
  ["baseline",{campaign:{...campaign,baselineCommit:"a".repeat(40)}},"baseline-invalid"],
  ["pending",{queue:{mode:"PAPER",orders:[{clientOrderId:"test"}]}},"queue-pending"],
  ["wrong mode",{queue:{mode:"LIVE",orders:[]}},"queue-invalid"],
  ["NaN",{now:NaN},"clock-invalid"]
]){
 const result=gate({...input,...patch});
 assert.equal(result.allowed,false,name);
 assert.equal(result.reason,reason,name);
 assert.equal(result.authorizesOrders,false,name);
}
console.log("Fenice V6 operator pre-dispatch safety gate PASS");
