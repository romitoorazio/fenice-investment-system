import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { identifyAlphaListing, evaluateEodResearch, EOD_PILOTS } from "../lib/market/world-v7-eod-research.mjs";
const now="2026-10-19T20:30:00.000Z";
const sym={XMIL:"ENEL.MIL",XETR:"SIE.DEX",XTKS:"7203.TYO"};
const match=(mic)=>({bestMatches:[{
  "1. symbol":sym[mic],"3. type":"Equity","4. region":EOD_PILOTS[mic].country,
  "8. currency":EOD_PILOTS[mic].currency,
}]});
function mockDaily(mic,forceToday=false) {
  const bars={};
  for(let i=0;i<46;i++){
    const date=new Date(Date.parse("2026-08-18T00:00:00.000Z")+i*86400000).toISOString().slice(0,10);
    if(new Date(date).getUTCDay()===0||new Date(date).getUTCDay()===6)continue;
    const c=50+i*0.2;
    bars[date]={"1. open":String(c-0.1),"2. high":String(c+0.4),
      "3. low":String(c-0.3),"4. close":String(c),"5. volume":"120000"};
  }
  // Only latest 33 weekday bars; controlled independently of intraday.
  if(forceToday)bars["2026-10-19"]={"1. open":"999","2. high":"9999","3. low":"1","4. close":"999","5. volume":"1"};
  return {"Meta Data":{"2. Symbol":sym[mic]},"Time Series (Daily)":bars};
}
for(const mic of ["XTKS","XMIL","XETR"]) {
  const listed=identifyAlphaListing(mic,match(mic));
  assert.equal(listed.status,"MATCHED_FOR_DAILY_RESEARCH");
  assert.equal(listed.exactMicProof,false);
  assert.equal(listed.alphaSymbol,sym[mic]);
  const normal=evaluateEodResearch(mic,listed,mockDaily(mic),now);
  const withToday=evaluateEodResearch(mic,listed,mockDaily(mic,true),now);
  assert.equal(normal.status,"STALE_COMPLETED_DAILY_HISTORY", "stale fixture must never appear fresh");
  assert.equal(withToday.status,"STALE_COMPLETED_DAILY_HISTORY", "today's huge close cannot rescue stale past");
  assert.equal(normal.paperFillCount,0);
  assert.equal(normal.liveTradingAllowed,false);
  assert.equal(normal.exactMicCertified,false);
  assert.equal(normal.licensedPaperSource,false);
}
const target=identifyAlphaListing("XMIL",match("XMIL"));
const daily=mockDaily("XMIL");
for(const k of Object.keys(daily["Time Series (Daily)"])){
  const diff=Math.floor((Date.parse("2026-10-16T00:00:00Z")-Date.parse(k+"T00:00:00Z"))/86400000);
  const targetDate=new Date(Date.parse(k+"T00:00:00Z")+diff*86400000).toISOString().slice(0,10);
  // keep order and numeric OHLC; reconstruct recent sequence
}
const recent={};
let idx=0;
for(let day=Date.parse("2026-09-01T00:00:00Z");day<=Date.parse("2026-10-16T00:00:00Z");day+=86400000){
  const d=new Date(day),wk=d.getUTCDay();if(wk===0||wk===6)continue;
  const close=50+idx*0.3;idx++;
  recent[d.toISOString().slice(0,10)]={"1. open":String(close-0.1),"2. high":String(close+0.3),
    "3. low":String(close-0.3),"4. close":String(close),"5. volume":"10000"};
}
const payload={"Meta Data":{"2. Symbol":"ENEL.MIL"},"Time Series (Daily)":recent};
const tested=evaluateEodResearch("XMIL",target,payload,now);
assert.equal(tested.status,"COMPLETE_EOD_RESEARCH");
assert.equal(tested.lastCompleteBarDate,"2026-10-16");
assert.equal(tested.researchSignal,"UPTREND_RESEARCH");
const contaminated=structuredClone(payload);
contaminated["Time Series (Daily)"]["2026-10-19"]={"1. open":"20","2. high":"5000","3. low":"1","4. close":"2000","5. volume":"100"};
assert.equal(evaluateEodResearch("XMIL",target,contaminated,now).researchSignal,
  tested.researchSignal,"forbid same-session lookahead even when a huge bar is present");
assert.equal(evaluateEodResearch("XMIL",target,contaminated,now).lastCompleteBarDate,
  tested.lastCompleteBarDate);
assert.equal(tested.futureOpenRequired,true);
assert.equal(tested.nextSessionFillVerified,false);
assert.equal(tested.rawPricePublished,false);
assert(!JSON.stringify(tested).includes("2000"),"provider raw close cannot be published");
assert.equal(identifyAlphaListing("XMIL",{bestMatches:[
  {...match("XMIL").bestMatches[0],"8. currency":"USD"}]}).status,"SYMBOL_REGION_CURRENCY_UNCONFIRMED");
assert.equal(identifyAlphaListing("XMIL",{bestMatches:[
  {...match("XMIL").bestMatches[0],"4. region":"USA"}]}).status,"SYMBOL_REGION_CURRENCY_UNCONFIRMED");
assert.equal(identifyAlphaListing("XMIL",{bestMatches:[
  match("XMIL").bestMatches[0],match("XMIL").bestMatches[0]]}).status,"AMBIGUOUS_PROVIDER_SYMBOL");
assert.equal(identifyAlphaListing("XMIL",{Note:"25 requests/day reached"}).status,"RATE_LIMIT_OR_PLAN_RESTRICTION");
assert.equal(evaluateEodResearch("XMIL",target,{"Error Message":"no data"},now).status,"INVALID_SYMBOL_OR_ACCESS");
assert.equal(evaluateEodResearch("XMIL",target,
  {...payload,"Meta Data":{"2. Symbol":"IBM"}},now).status,"RETURNED_SYMBOL_MISMATCH");
const bad=structuredClone(payload);
bad["Time Series (Daily)"]["2026-10-16"]["2. high"]="1";
assert.equal(evaluateEodResearch("XMIL",target,bad,now).status,"INVALID_OHLC_BAR");
assert.equal(evaluateEodResearch("XMIL",{status:"NO_SYMBOL_SEARCH_RESULTS"},null,now).paperFillCount,0);
const file="/tmp/fenice-eod-dryrun.json";
const printed=execFileSync(process.execPath,["scripts/run-world-v7-eod-research.mjs","--venue=XMIL","--output="+file],
  {encoding:"utf8",env:{...process.env,ALPHA_VANTAGE_API_KEY:""}});
assert.equal(JSON.parse(printed).network,false);
const disk=JSON.parse(readFileSync(file,"utf8"));
assert.equal(disk.observations[0].status,"ALPHA_VANTAGE_KEY_UNAVAILABLE");
assert.equal(disk.simulatedOrders,0);
assert.equal(disk.liveTradingAllowed,false);
console.log("WORLD V7 EOD closed-session, MIC caution, provider errors, quota, no-lookahead and no-network tests: PASS");
