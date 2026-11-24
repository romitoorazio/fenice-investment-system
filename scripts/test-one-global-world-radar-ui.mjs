import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildOneGlobalPublicTacticalView}
 from "../lib/ui/one-global-world-radar.mjs";

const read=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const terminal=read("terminal-intelligence.json");
const ledger=read("one-global-forward-research-ledger.json");
const nowIso=new Date(Date.parse(terminal.generatedAt)+60000).toISOString();
const run=(t=terminal,l=ledger,at=nowIso)=>
 buildOneGlobalPublicTacticalView({terminal:t,ledger:l,nowIso:at});
const result=run();
assert.equal(result.mode,"ONE_GLOBAL_PUBLIC_TACTICAL_RESEARCH_ONLY");
assert.equal(result.stale,false,"Fresh real terminal must provide visible global research");
assert(result.watchlist.length>=8&&result.watchlist.length<=12);
assert(result.researchEligible>=15);
assert(result.screenSize>=30);
assert(result.watchlist.some(x=>x.region==="Europa"));
assert(result.watchlist.some(x=>x.region==="Asia"));
assert(result.watchlist.some(x=>x.region==="Nord America"));
assert.equal(result.forwardObservations,ledger.events.filter(e=>e.kind==="BAR_OBSERVATION").length);
assert.equal(result.forwardSignals,ledger.events.filter(e=>e.kind==="TACTICAL_RESEARCH_SETUP").length);
assert.equal(result.measuredPositive+result.measuredNegative+result.measuredUnchanged,
 result.measuredAfterTwoNewDailySnapshots);
assert(result.watchlist.every(x=>x.isBuySignal===false&&x.expectedProfitEuro===null
 &&x.forecastReturnPercent===null&&x.lastTradedPrice===null
 &&x.paperEligible===false&&x.brokerOrderAllowed===false));
assert(result.watchlist.every(x=>Number.isInteger(x.shortScore)&&x.shortScore>=0&&x.shortScore<=100
 &&Number.isInteger(x.mediumScore)&&x.mediumScore>=0&&x.mediumScore<=100));
assert(result.watchlist.every(x=>x.dataType==="HISTORICAL_DAILY_CANDLE_RESEARCH_ONLY"));
assert.equal(result.policy.phase9Credit,0);
assert.equal(result.policy.paperExecutionAllowed,false);
assert.equal(result.policy.liveTradingAllowed,false);
assert.equal(result.policy.noLiveMarketPricePublished,true);
assert.equal(result.policy.noWinProbabilityOrFutureReturnForecast,true);
assert(!JSON.stringify(result).includes("targetAmountEuro"));
assert(!JSON.stringify(result).includes("targetWeightPercent"));
assert(!JSON.stringify(result).includes("bidPrice"));
assert(!JSON.stringify(result).includes("Yahoo Finance"));
const later=run(terminal,ledger,new Date(Date.parse(nowIso)+6*86400000).toISOString());
assert.equal(later.stale,true,"An old daily-bar radar cannot keep showing actionable-looking candidates");
assert.equal(later.watchlist.length,0);
const broken=structuredClone(ledger);
broken.events[0].close*=1.02;
assert.throws(()=>run(terminal,broken),/FORWARD_RESEARCH_EVENT_CHAIN_INVALID/);
const rights=structuredClone(terminal);
rights.worldResearch.paperEligible=1;
assert.throws(()=>run(rights),/ONE_GLOBAL_UI_SOURCE_RIGHTS_OR_CLOCK_INVALID/);
const fakeQuote=structuredClone(terminal);
fakeQuote.worldResearch.verifiedExecutableQuotes=1;
assert.throws(()=>run(fakeQuote),/ONE_GLOBAL_UI_SOURCE_RIGHTS_OR_CLOCK_INVALID/);
const fakeAllocation=structuredClone(terminal);
const research=fakeAllocation.assets.find(x=>x.globalVenueResearchOnly);
assert(research);
research.targetAmountEuro=100;
assert.throws(()=>run(fakeAllocation),/ONE_GLOBAL_UI_SOURCE_RIGHTS_OR_CLOCK_INVALID/);
assert.deepEqual(run(),result,"Radar should be deterministic for unchanged evidence");
const page=readFileSync(new URL("../app/opportunita-mondo/page.tsx",import.meta.url),"utf8");
const runtime=readFileSync(new URL("../lib/ui/one-global-world-radar-runtime.mjs",import.meta.url),"utf8");
assert(runtime.includes("buildOneGlobalPublicTacticalView"));
assert(page.includes("readLatestWorldTacticalEvidence"));
assert(page.includes("radar.watchlist.map"));
assert(page.includes("radar.stale"));
assert(page.includes("radar.measuredPositive"));
assert(page.includes("radar.measuredNegative"));
assert(page.includes("Momentum: approfondire")||page.includes("item.shortAttention"));
assert(!/submitOrder|sendOrder|executeTrade|brokerWritesAuthorized:\s*true/.test(page));
console.log("PASS ONE GLOBAL public dashboard: 12 balanced research candidates, genuine forward outcomes, source age, no market prices or PAPER/LIVE trading");

const intraday=structuredClone(terminal);
const enel=intraday.assets.find(a=>a.symbol==="ENEL");
assert(enel);
enel.technical.worldIntradayResearchQuote={
  price:enel.price*1.03,currency:enel.currency,exchangeMic:enel.technical.exchangeMic,
  observedAt:new Date(Date.parse(intraday.generatedAt)-60000).toISOString(),
  evidenceType:"YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY",feedCount:1,
  exactMicExecutionVerified:false,executionEligible:false,paperCertificationEligible:false,
  brokerSubmissionAllowed:false,liveTradingAllowed:false,
};
const displayed=run(intraday).intradayAttention.find(a=>a.symbol==="ENEL");
assert(displayed);
assert(displayed.evidence.some(x=>x.includes("2% sopra")));
assert.deepEqual(Object.keys(displayed).sort(),["symbol","venueMic","observedAt","evidence","paperEligible","brokerOrderAllowed","liveTradingAllowed"].sort());
assert.equal(displayed.paperEligible,false);
assert.equal(displayed.liveTradingAllowed,false);
assert.equal(displayed.brokerOrderAllowed,false);
assert.equal(run(intraday,ledger,new Date(Date.parse(intraday.generatedAt)+31*60000).toISOString()).intradayAttention.length,0);
assert(page.includes("radar.intradayAttention.map"));
assert(page.includes("Volumi e breakout non confermati"));
console.log("PASS public intraday research alerts, no prices or execution permissions");
