import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {includeApprovedV8TechnicalProbes as focus,V8_TECHNICAL_PROBE_SYMBOLS as technical}
  from "../lib/trading/v8-approved-technical-probes.mjs";

const approval=JSON.parse(readFileSync(new URL("../data/paper-v8-technical-approval.json",import.meta.url),"utf8"));
assert.equal(approval.approved,true);
const nowIso="2026-11-11T15:55:00.000Z";
const global=["MSFT","NESN","META","ASML","AAPL","NVDA","IWM","SIE","ENEL","AMZN","TSM","CBA"];
const input={usingTerminalFallback:true,job:"intraday",approval,nowIso};
const list=focus(global,input);
assert.deepEqual(list.slice(0,global.length),global,"Do not reorder worldwide research inputs");
assert.deepEqual(list.slice(global.length),["SPY","QQQ"]);
assert.equal(new Set(list).size,list.length);
assert(technical.every(s=>list.includes(s)));
assert.deepEqual(focus(list,input),list,"Idempotent probe focus");
assert.deepEqual(focus(global,{...input,usingTerminalFallback:false}),global,
  "Never append anything when there is an actual PAPER order queue");
assert.deepEqual(focus(global,{...input,job:"research"}),global,
  "Global radar/research must not inherit technical campaign focus");
for(const mutate of [
  x=>{x.approved=false}, x=>{x.humanConfirmation=false},
  x=>{x.mode="LIVE"}, x=>{x.prospectiveOnly=false},
  x=>{x.allowBackfill=true}, x=>{x.liveTradingAllowed=true},
  x=>{x.brokerConnectivityAllowed=true},
  x=>{x.expiresAt="2026-11-11T00:00:00.000Z"},
  x=>{x.effectiveFrom="2026-12-01T00:00:00.000Z"},
  x=>{x.effectiveFrom="broken"},
]) {
 const bad=structuredClone(approval);mutate(bad);
 assert.deepEqual(focus(global,{...input,approval:bad}),global);
}
assert.deepEqual(focus(global,{...input,nowIso:"invalid"}),global);
const source=readFileSync(new URL("./run-execution-market-data.mjs",import.meta.url),"utf8");
assert.match(source,/includeApprovedV8TechnicalProbes\(\[\.\.\.requested\]/);
assert.match(source,/usingTerminalFallback,/);
assert.match(source,/job: process\.env\.FENICE_JOB/);
assert.match(source,/approval: v8TechnicalApproval/);
assert.match(source,/const twelveDataProbeSymbols = new Set/);
assert.match(source,/\.slice\(0, twelveDataProbeLimit\)/);
assert.match(source,/\.slice\(0, alpacaProbeLimit\)/);
const workflow=readFileSync(new URL("../.github/workflows/v8-shadow-exits.yml",import.meta.url),"utf8");
assert.match(workflow,/test-v8-approved-technical-probes\.mjs/);
assert.equal(approval.liveTradingAllowed,false);
console.log("PASS V8 technical quote probe focus: missing SPY QQQ restored only for approved intraday no-order lab; 4 Twelve/6 Alpaca caps and worldwide radar preserved");
