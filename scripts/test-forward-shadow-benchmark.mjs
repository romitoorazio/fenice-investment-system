import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateForwardShadowBenchmark } from "../lib/intelligence/forward-shadow-benchmark.mjs";

const start = "2026-10-01T18:00:00.000Z";
const mark = "2026-10-08T18:00:00.000Z";
const now = new Date("2026-10-08T20:00:00.000Z");
const percentage = (a,b)=>Math.round(((b/a)-1)*10000)/100;
function record(symbol,price,latest,{decision="OSSERVA",checkpoint=true}={}) {
  const gross=percentage(price,latest);
  const cp=checkpoint?{"7d":{status:"MEASURED",measuredAt:mark,currentPrice:latest,
    stagedReturnPercent:gross,lumpSumReturnPercent:gross}}:{};
  return {id:"2026-10-01:"+symbol,symbol,observationDate:"2026-10-01",createdAt:start,currency:"USD",
    referencePrice:price,lastPrice:latest,lastMarkedAt:mark,
    stagedMarkToMarketPercent:gross,lumpSumMarkToMarketPercent:gross,checkpoints:cp,
    tranches:[{number:1,status:"EXECUTED",price,executedAt:start}],
    currentDecision:decision,researchOnly:true,executionEligible:false,paperCertificationEligible:false,
    brokerSubmissionAllowed:false,liveTradingAllowed:false};
}
const spy=record("SPY",100,102);
const candidate=record("NVDA",50,55);
const lower=record("QQQ",200,198);
const baseline=evaluateForwardShadowBenchmark([spy,candidate,lower],{now});
assert.equal(baseline.state,"INSUFFICIENT_FORWARD_EVIDENCE");
assert.equal(baseline.matured["7d"].pairedSamples,2);
assert.equal(baseline.matured["7d"].independentEntryDays,1);
assert.equal(baseline.matured["7d"].hypotheticalAverageAfterCostPercent,4.2);
assert.equal(baseline.matured["7d"].benchmarkGrossAveragePercent,2);
assert.equal(baseline.matured["7d"].hypotheticalAverageExcessPercent,2.2);
assert.equal(baseline.matured["7d"].beatBenchmarkRatePercent,50);
assert.equal(baseline.matured["30d"].hypotheticalAverageExcessPercent,null);
assert.equal(baseline.provisional.pairedSamples,2);
assert.equal(baseline.hasRealizedProfit,false);
assert.equal(baseline.isolation.liveTradingAllowed,false);
assert.equal(baseline.isolation.feedsPaperCertification,false);
assert.equal(baseline.isolation.brokerSubmissionAllowed,false);
assert.equal(baseline.isolation.executionEligible,false);

const doubled=evaluateForwardShadowBenchmark([spy,candidate,{...candidate,currentDecision:"ATTENDI"},lower],{now});
assert.equal(doubled.matured["7d"].pairedSamples,2,"one symbol/day only");
const malformed=[
  ["non-USD", {currency:"EUR"}],
  ["missing origin price", {referencePrice:null}],
  ["zero origin price", {referencePrice:0}],
  ["missing end quote", {lastPrice:null,checkpoints:{"7d":{...candidate.checkpoints["7d"],currentPrice:null}}}],
  ["fake stored return", {checkpoints:{"7d":{...candidate.checkpoints["7d"],stagedReturnPercent:999}}}],
  ["fake gross index return", {checkpoints:{"7d":{...candidate.checkpoints["7d"],lumpSumReturnPercent:-999}}}],
  ["future event", {createdAt:"2026-10-09T18:00:00.000Z"}],
  ["invalid createdAt", {createdAt:"2026-02-30T18:00:00.000Z"}],
  ["backfill", {historicalBackfill:true}],
  ["paper eligible", {paperCertificationEligible:true}],
  ["not research", {researchOnly:false}],
  ["symbol misattributed", {id:"2026-10-01:TSM"}],
  ["wrong observation day", {observationDate:"2026-10-02"}],
  ["missing executed tranche", {tranches:[]}],
  ["bad tranche price", {tranches:[{number:1,status:"EXECUTED",price:null,executedAt:start}]}],
  ["tranche executed after checkpoint", {tranches:[{number:1,status:"EXECUTED",price:50,executedAt:"2026-10-09T10:00:00.000Z"}]}],
  ["early checkpoint", {checkpoints:{"7d":{...candidate.checkpoints["7d"],measuredAt:"2026-10-03T18:00:00.000Z"}}}],
  ["late checkpoint", {checkpoints:{"7d":{...candidate.checkpoints["7d"],measuredAt:"2026-10-13T18:00:00.000Z"}}}],
  ["incorrect checkpoint date", {checkpoints:{"7d":{...candidate.checkpoints["7d"],measuredAt:"2026-10-09T18:00:00.000Z"}}}],
];
for(const [name,fields] of malformed){
  const bad={...candidate,...fields};
  const result=evaluateForwardShadowBenchmark([spy,bad],{now});
  assert.equal(result.matured["7d"].pairedSamples,0,name+" is invalid for 7d");
  assert.equal(result.matured["7d"].hypotheticalAverageExcessPercent,null,name+" must be N/D");
}
assert.equal(evaluateForwardShadowBenchmark([spy,{...candidate,lastMarkedAt:"2026-10-09T18:00:00.000Z"}],{now}).provisional.pairedSamples,0,"future provisional mark is invalid");
assert.equal(evaluateForwardShadowBenchmark([candidate],{now}).matured["7d"].pairedSamples,0,"no matching SPY is N/D");
assert.equal(evaluateForwardShadowBenchmark([spy,{...candidate,observationDate:"2026-10-02",id:"2026-10-02:NVDA",createdAt:"2026-10-02T18:00:00.000Z"}],{now}).matured["7d"].pairedSamples,0);
const misaligned = { ...candidate, checkpoints: { "7d": { ...candidate.checkpoints["7d"], measuredAt: "2026-10-09T18:00:00.000Z" } } };
assert.equal(evaluateForwardShadowBenchmark([spy, misaligned], { now: new Date("2026-10-10T02:00:00.000Z") }).matured["7d"].pairedSamples, 0, "exit must match");
assert.equal(evaluateForwardShadowBenchmark([spy,candidate],{now,costPercent:10}).matured["7d"].hypotheticalAverageExcessPercent,-2);
assert.throws(()=>evaluateForwardShadowBenchmark([spy,candidate],{now,costPercent:-1}),/Invalid forward research/);
assert.throws(()=>evaluateForwardShadowBenchmark([spy,candidate],{now:new Date("bad")}),/Invalid forward research/);

const before7=new Date("2026-10-06T18:00:00.000Z");
assert.equal(evaluateForwardShadowBenchmark([spy,candidate],{now:before7}).matured["7d"].pairedSamples,0,"do not see future");
const staleMark=evaluateForwardShadowBenchmark([spy,candidate],{now:new Date("2026-10-11T20:00:00.000Z")});
assert.equal(staleMark.provisional.pairedSamples,0,"stale marks are not current");
const reportRunner=await readFile(new URL("./run-horizon-shadow-evaluation.mjs",import.meta.url),"utf8");
assert.match(reportRunner,/forwardBenchmark:\s*evaluateForwardShadowBenchmark\(ledger\.records,\s*\{\s*now\s*\}\)/);
const ui=await readFile(new URL("../app/committee/page.tsx",import.meta.url),"utf8");
assert.match(ui,/Controllo economico SHADOW contro SPY/);
assert.match(ui,/forwardBenchmark/);
assert.match(ui,/non sono rendimenti realizzati/i);
console.log("FENICE100K forward-only SPY matched benchmark + hypothetical costs: PASS");
