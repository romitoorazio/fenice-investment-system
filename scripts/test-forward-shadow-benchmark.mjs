import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateForwardShadowBenchmark } from "../lib/intelligence/forward-shadow-benchmark.mjs";

const start = "2026-10-01T18:00:00.000Z";
const mark = "2026-10-08T18:00:00.000Z";
const now = new Date("2026-10-08T20:00:00.000Z");
const percentage = (a,b)=>Math.round(((b/a)-1)*10000)/100;
function record(symbol,price,latest,{decision="OSSERVA",checkpoint=true}={}) {
  const gross=percentage(price,latest);
  const cp=checkpoint?{"7d":{status:"MEASURED",measuredAt:mark,quoteObservedAt:mark,currentPrice:latest,
    stagedReturnPercent:gross,lumpSumReturnPercent:gross}}:{};
  return {id:"2026-10-01:"+symbol,symbol,observationDate:"2026-10-01",createdAt:start,currency:"USD",
    source:{initialQuoteObservedAt:start, initialQuoteSource:"fixture-quote-source"},
    referencePrice:price,lastPrice:latest,lastMarkedAt:mark,lastQuoteObservedAt:mark,
    stagedMarkToMarketPercent:gross,lumpSumMarkToMarketPercent:gross,checkpoints:cp,
    tranches:[{number:1,targetOffsetDays:0,status:"EXECUTED",price,executedAt:start},
      {number:2,targetOffsetDays:7,status:"PENDING",price:null,executedAt:null},
      {number:3,targetOffsetDays:14,status:"PENDING",price:null,executedAt:null}],
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
assert.equal(baseline.version,4);
assert.match(baseline.capitalBasis,/Three equal-notional/);
assert.equal(baseline.matured["7d"].hypotheticalAverageAfterCostPercent,1.4);
assert.equal(baseline.matured["7d"].benchmarkGrossAveragePercent,2);
assert.equal(baseline.matured["7d"].hypotheticalAverageExcessPercent,-0.6);
assert.equal(baseline.matured["7d"].beatBenchmarkRatePercent,50);
assert.equal(baseline.matured["30d"].hypotheticalAverageExcessPercent,null);
assert.equal(baseline.provisional.pairedSamples,2);
assert.equal(baseline.provisional.observations[0].investedCapitalPercent,33.33);
assert.equal(baseline.provisional.observations[0].cashCapitalPercent,66.67);
assert.equal(baseline.provisional.observations[0].hypotheticalCostOnTotalCapitalPercent,0.1);
assert.equal(baseline.provisional.observations[0].hypotheticalNetReturnPercent,3.23);
const sensitivity = baseline.matured["7d"].sensitivity;
assert.equal(sensitivity.state,"SCENARIOS_ONLY_NOT_PREDICTIONS");
assert.equal(sensitivity.pairedSamples,2);
assert.equal(sensitivity.independentEntryDays,1);
assert.deepEqual(sensitivity.costScenarios.map(x=>x.hypotheticalRoundTripCostPercent),[0.1,0.3,0.5,1]);
assert.equal(sensitivity.costScenarios[1].averageNetFullCapitalPercent,1.4);
assert.equal(sensitivity.costScenarios[1].averageExcessVsSpyGrossPercent,-0.6);
assert.equal(sensitivity.costScenarios[1].underperformSpyRatePercent,50);
assert.equal(sensitivity.costScenarios[1].negativeVsCashRatePercent,50);
assert.deepEqual(sensitivity.isolatedAssetPriceShocks.map(x=>x.additionalAssetPriceDropPercent),[5,10,20]);
assert.equal(sensitivity.isolatedAssetPriceShocks[1].averageStressedNetFullCapitalPercent,-2.08);
assert.equal(sensitivity.isolatedAssetPriceShocks[1].worstStressedNetFullCapitalPercent,-3.73);
assert.equal(sensitivity.isolatedAssetPriceShocks[1].negativeVsCashRatePercent,100);
assert.equal(sensitivity.orderSubmissionAllowed,false);
assert.equal(sensitivity.paperPromotionAllowed,false);
assert.equal(sensitivity.liveTradingAllowed,false);
assert.equal(baseline.matured["30d"].sensitivity.state,"NOT_AVAILABLE");
assert.equal(baseline.matured["30d"].sensitivity.costScenarios[0].averageNetFullCapitalPercent,null);
assert.equal(baseline.matured["30d"].sensitivity.isolatedAssetPriceShocks[0].worstStressedNetFullCapitalPercent,null);
assert.notEqual(baseline.matured["7d"].sensitivity.costScenarios[0].averageExcessVsSpyGrossPercent,
  baseline.matured["7d"].sensitivity.costScenarios[3].averageExcessVsSpyGrossPercent);

assert.equal(baseline.hasRealizedProfit,false);
assert.equal(evaluateForwardShadowBenchmark([spy,{...candidate,source:{}}],{now}).provisional.pairedSamples,0,
  "legacy unknown-time marks cannot be reported as proven forward profit");
assert.equal(evaluateForwardShadowBenchmark([spy,{...candidate,lastQuoteObservedAt:null}],{now}).provisional.pairedSamples,0,
  "price marks require original source quote time");
assert.equal(evaluateForwardShadowBenchmark([spy,{...candidate,lastQuoteObservedAt:"2026-10-08T02:00:00.000Z"}],{now}).provisional.pairedSamples,0,
  "old quote cannot be laundered into current mark with report generation time");

assert.equal(baseline.isolation.liveTradingAllowed,false);
assert.equal(baseline.isolation.feedsPaperCertification,false);
assert.equal(baseline.isolation.brokerSubmissionAllowed,false);
assert.equal(baseline.isolation.executionEligible,false);

const doubled=evaluateForwardShadowBenchmark([spy,candidate,{...candidate,currentDecision:"ATTENDI"},lower],{now});
assert.equal(doubled.matured["7d"].pairedSamples,2,"one symbol/day only");
const malformed=[
  ["non-USD", {currency:"EUR"}],
  ["legacy quote missing original time", {source:{initialQuoteSource:"fixture-quote-source"}}],
  ["missing original quote source", {source:{initialQuoteObservedAt:start}}],
  ["backdated unverified origin", {source:{initialQuoteObservedAt:"2026-09-30T17:59:00.000Z",initialQuoteSource:"test"}}],
  ["future original quote", {source:{initialQuoteObservedAt:"2026-10-02T12:00:00.000Z",initialQuoteSource:"test"}}],
  ["missing checkpoint quote time", {checkpoints:{"7d":{...candidate.checkpoints["7d"],quoteObservedAt:null}}}],
  ["earlier checkpoint quote", {checkpoints:{"7d":{...candidate.checkpoints["7d"],quoteObservedAt:"2026-10-08T04:00:00.000Z"}}}],

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
  ["bad tranche price", {tranches:[{...candidate.tranches[0],price:null},...candidate.tranches.slice(1)]}],
  ["missing third allocation", {tranches:candidate.tranches.slice(0,2)}],
  ["mislabelled tranche", {tranches:candidate.tranches.map((t,i)=>i===1?{...t,number:7}:t)}],
  ["early extra tranche", {tranches:[candidate.tranches[0],{...candidate.tranches[1],status:"EXECUTED",price:52,executedAt:start},candidate.tranches[2]]}],
  ["tranche executed after checkpoint", {tranches:[{...candidate.tranches[0],executedAt:"2026-10-09T10:00:00.000Z"},...candidate.tranches.slice(1)]}],
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
// Multiple symbols on a single day are a correlated cohort, not 30 independent observations.
const day30 = "2026-10-31T18:00:00.000Z";
const cohort = [record("SPY", 100, 102)];
for(let i=0;i<31;i++) cohort.push(record("T"+String(i).padStart(2,"0"), 100, 110));
for(const row of cohort){
  row.lastMarkedAt = day30;
  row.lastQuoteObservedAt = day30;
  const gross = percentage(row.referencePrice,row.lastPrice);
  row.checkpoints["30d"]={status:"MEASURED",measuredAt:day30,quoteObservedAt:day30,currentPrice:row.lastPrice,
    stagedReturnPercent:gross,lumpSumReturnPercent:gross};
}
const artificiallyBig = evaluateForwardShadowBenchmark(cohort, {now:new Date("2026-10-31T20:00:00.000Z")});
assert.equal(artificiallyBig.matured["7d"].pairedSamples,31);
assert.equal(artificiallyBig.matured["30d"].pairedSamples,31);
assert.equal(artificiallyBig.matured["7d"].independentEntryDays,1);
assert.equal(artificiallyBig.matured["30d"].independentEntryDays,1);
assert.equal(artificiallyBig.state,"INSUFFICIENT_FORWARD_EVIDENCE","30 stocks in one market day do not prove a strategy");

// When every planned slice is genuinely executed, full notional (not just 1/3) is exposed.
const threeSlices = structuredClone(candidate);
threeSlices.tranches[1]={number:2,targetOffsetDays:7,status:"EXECUTED",price:55,executedAt:mark};
threeSlices.tranches[2]={number:3,targetOffsetDays:14,status:"EXECUTED",price:55,executedAt:"2026-10-15T18:00:00.000Z"};
threeSlices.lastMarkedAt="2026-10-16T18:00:00.000Z";
threeSlices.lastQuoteObservedAt=threeSlices.lastMarkedAt;
threeSlices.stagedMarkToMarketPercent=10; // deliberately false "all capital" mark
threeSlices.lumpSumMarkToMarketPercent=10;
threeSlices.checkpoints={};
const lateBaseline=structuredClone(spy);
lateBaseline.lastMarkedAt=threeSlices.lastMarkedAt;
lateBaseline.lastQuoteObservedAt=lateBaseline.lastMarkedAt;
lateBaseline.checkpoints={};
const fullExposure=evaluateForwardShadowBenchmark([lateBaseline,threeSlices],{now:new Date("2026-10-16T20:00:00.000Z")});
assert.equal(fullExposure.provisional.pairedSamples,0,"inconsistent invested-only mark must fail closed");
threeSlices.stagedMarkToMarketPercent=Math.round((10/3)*100)/100;
const fullExposureValid=evaluateForwardShadowBenchmark([lateBaseline,threeSlices],{now:new Date("2026-10-16T20:00:00.000Z")});
assert.equal(fullExposureValid.provisional.pairedSamples,1);
assert.equal(fullExposureValid.provisional.observations[0].investedCapitalPercent,100);
assert.equal(fullExposureValid.provisional.observations[0].hypotheticalCostOnTotalCapitalPercent,0.3);
assert.equal(fullExposureValid.provisional.observations[0].hypotheticalNetReturnPercent,3.03);

const reportRunner=await readFile(new URL("./run-horizon-shadow-evaluation.mjs",import.meta.url),"utf8");
assert.match(reportRunner,/forwardBenchmark:\s*evaluateForwardShadowBenchmark\(ledger\.records,\s*\{\s*now\s*\}\)/);
const ui=await readFile(new URL("../app/committee/page.tsx",import.meta.url),"utf8");
assert.match(ui,/Controllo economico SHADOW contro SPY/);
assert.match(ui,/forwardBenchmark/);
assert.match(ui,/non sono rendimenti realizzati/i);
assert.match(ui,/capitale teorico totale/);
assert.match(ui,/non ancora acquistate mantenute in liquidità/);
assert.match(ui,/observation\.cashCapitalPercent/);
assert.match(ui,/30 confronti e 30 giornate iniziali distinti/);
assert.match(ui,/Sensibilità ai costi e ribassi ipotetici/);
assert.match(ui,/isolatedAssetPriceShocks/);
assert.match(ui,/costScenarios/);
assert.match(ui,/non sono previsioni/i);

console.log("FENICE100K forward-only SPY matched benchmark + hypothetical costs: PASS");
