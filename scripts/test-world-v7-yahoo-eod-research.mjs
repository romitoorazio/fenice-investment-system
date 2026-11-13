import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateYahooBamiEodResearch as check} from "../lib/market/world-v7-yahoo-eod-research.mjs";
const sec=x=>Math.round(Date.parse(x)/1000);
const now="2026-11-13T12:00:00.000Z";
const days=[];
for(let d=Date.parse("2026-09-01T00:00:00Z");d<=Date.parse("2026-11-13T00:00:00Z");d+=86400000){
  const x=new Date(d),wk=x.getUTCDay();
  if(wk!==0&&wk!==6)days.push(x.toISOString().slice(0,10));
}
const timestamps=days.map(x=>sec(x+"T08:00:00Z"));
const prices=days.map((x,i)=>x==="2026-11-13"?999:12+i*.08);
const payload={
  chart:{result:[{meta:{symbol:"BAMI.MI",currency:"EUR",instrumentType:"EQUITY",
    exchangeTimezoneName:"Europe/Rome",
    currentTradingPeriod:{regular:{start:sec("2026-11-13T08:00:00Z"),
      end:sec("2026-11-13T16:30:00Z")}}},
    timestamp:timestamps,indicators:{quote:[{
      open:prices.map(v=>v-.02),high:prices.map(v=>v+.06),
      low:prices.map(v=>v-.06),close:prices,volume:prices.map(()=>20000),
    }]}}],error:null},
};
const good=check(payload,now);
assert.equal(good.observation.status,"TENTATIVE_COMPLETED_DAILY_RESEARCH");
assert.equal(good.observation.provider,"yahoo-finance");
assert.equal(good.observation.lastCompleteBarDate,"2026-11-12");
assert.equal(good.observation.researchSignal,"UPTREND_RESEARCH");
assert.equal(good.observation.paperFillCount,0);
assert.equal(good.observation.exactMicCertified,false);
assert.equal(good.observation.licensedPaperSource,false);
assert.equal(good.observation.independentProviderReceipts,0);
assert.equal(good.observation.liveTradingAllowed,false);
assert.equal(good.observation.heldBackUnsettledCandles,1);
assert(good.bars.every(x=>x.date<"2026-11-13"));
assert(!JSON.stringify(good.observation).includes("999"),
 "new incomplete candle cannot leak to metadata");
const mutate=f=>{const v=structuredClone(payload);f(v);return check(v,now);};
assert.equal(mutate(v=>v.chart.result[0].meta.symbol="ENEL.MI").observation.status,
  "YAHOO_BAMI_IDENTITY_UNVERIFIED");
assert.equal(mutate(v=>v.chart.result[0].meta.symbol="BAMI.MIL").observation.status,
  "YAHOO_BAMI_IDENTITY_UNVERIFIED");
assert.equal(mutate(v=>v.chart.result[0].meta.currency="USD").observation.status,
  "YAHOO_BAMI_IDENTITY_UNVERIFIED");
assert.equal(mutate(v=>v.chart.result[0].meta.exchangeTimezoneName="UTC").observation.status,
  "YAHOO_BAMI_IDENTITY_UNVERIFIED");
assert.equal(mutate(v=>v.chart.result[0].indicators.quote[0].high[20]=1).observation.status,
  "YAHOO_INVALID_OHLC");
assert.equal(mutate(v=>v.chart.result[0].timestamp[1]=v.chart.result[0].timestamp[0]).observation.status,
  "YAHOO_DAILY_TIME_INVALID");
assert.equal(mutate(v=>v.chart.result[0].indicators.quote[0].close.pop()).observation.status,
  "YAHOO_DAILY_SCHEMA_INVALID");
assert.equal(mutate(v=>v.chart.result[0].meta.instrumentType="ETF").observation.status,
  "YAHOO_BAMI_IDENTITY_UNVERIFIED");
assert.equal(mutate(v=>v.chart.result[0].timestamp=[]).observation.status,
  "YAHOO_DAILY_SCHEMA_INVALID");
assert.equal(check(null,now).observation.status,"YAHOO_CHART_UNAVAILABLE");
assert.throws(()=>check(payload,"not an ISO clock"),/YAHOO_BAMI_INVALID_AUDIT_CLOCK/);
const wf=readFileSync(".github/workflows/world-v7-eod-research.yml","utf8");
assert.match(wf,/test-world-v7-yahoo-eod-research\.mjs/);
assert.match(wf,/world-v7-yahoo-eod-research\.mjs/);
const runner=readFileSync("scripts/run-world-v7-eod-research.mjs","utf8");
assert.match(runner,/evaluateYahooBamiEodResearch/);
assert.match(runner,/venue==="XMIL"/);
assert.match(runner,/YAHOO_BAMI_EOD_FALLBACK/);
console.log("PASS BAMI Yahoo EOD research fallback: issuer, EUR, Rome, malformed bars, future/same-day exclusion, zero PAPER and LIVE.");
