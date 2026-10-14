import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOpportunityWatchlist } from "../lib/ui/opportunity-watchlist.ts";

const spy = {
  symbol:"SPY", name:"S&P 500 ETF", assetClass:"ETF", decision:"OSSERVA",
  committeeScore:71, confidence:88, riskScore:29, terminalDecision:"ACCUMULA",
  scorecard:{valuation:50}, valuation:{status:"non applicabile",upsideBasePercent:null},
  currentPrice:780, currency:"USD", bullCase:[], bearCase:[],
};
const qqq = {...spy,symbol:"QQQ",name:"Nasdaq ETF",committeeScore:70,riskScore:33};
const tsm = {
  symbol:"TSM",assetClass:"Equity",decision:"ATTENDI",committeeScore:67,confidence:83,
  riskScore:52,terminalDecision:"ACCUMULA",scorecard:{valuation:50},
  valuation:{status:"non confrontabile",upsideBasePercent:null},
  bullCase:["Ricavi cresciuti."],bearCase:["Rischio geopolitico."],
  reviewTriggers:["Guidance societaria."],currentPrice:430,currency:"USD",
};
const asml = {...tsm,symbol:"ASML",decision:"OSSERVA",committeeScore:69,
  terminalDecision:"MANTIENI", riskScore:54};
const highRisk = {...tsm,symbol:"XHIGH",committeeScore:99,decision:"OSSERVA",riskScore:93};
const avoid = {...tsm,symbol:"XAVOID",committeeScore:100,riskScore:10,decision:"EVITA"};
const unknown = {...tsm,symbol:"UNKNOWN",committeeScore:null};
const rows = [highRisk,asml,tsm,spy,qqq,avoid,unknown];
const rank = buildOpportunityWatchlist(rows,true,6);

assert.deepEqual(rank.map(row=>row.symbol),["SPY","QQQ","TSM","ASML"]);
assert.equal(rank[0].valuationMethodGap,true,"neutral ETF valuation is not proven cheap");
assert.equal(rank[0].missingConditions.find(x=>x.code==="ETF_VALUATION")?.code,"ETF_VALUATION");
assert.equal(rank[0].pointsBelowBuyScore,7);
assert.equal(rank[0].missingConditions.length,2);
assert.equal(rank[2].bullCase,"Ricavi cresciuti.");
assert.equal(rank[2].bearCase,"Rischio geopolitico.");
assert.equal(rank[2].reviewTrigger,"Guidance societaria.");
assert.equal(rank[2].missingConditions.some(g=>g.code==="VALUATION"),true);
assert.equal(rank[3].missingConditions.some(g=>g.code==="TECHNICAL"),true);
assert.equal(rank.every(r=>r.brokerOrderAllowed===false
  && r.quoteVerifiedForExecution===false && r.returnForecastPercent===null),true);
assert.deepEqual(buildOpportunityWatchlist(rows,false),[],"stale committee means no ranked trades");
assert.deepEqual(buildOpportunityWatchlist(null,true),[]);
assert.deepEqual(buildOpportunityWatchlist(rows,true,0),[]);
assert.equal(buildOpportunityWatchlist([spy,spy,qqq],true).length,2,"duplicates not ranked twice");

const deepOvervalued = {...tsm,symbol:"DEEP",riskScore:31,committeeScore:85,
  scorecard:{valuation:60}, valuation:{status:"disponibile",upsideBasePercent:-46}};
const badVal = buildOpportunityWatchlist([deepOvervalued],true);
assert.equal(badVal.length,1);
assert.equal(badVal[0].missingConditions.some(g=>g.code==="DCF"),true);
assert.equal(badVal[0].returnForecastPercent,null);
assert.equal(buildOpportunityWatchlist([{...spy, symbol:"", committeeScore:100}],true).length,0);
assert.equal(buildOpportunityWatchlist([{...spy,symbol:"BAD",riskScore:NaN}],true).length,0);
assert.equal(buildOpportunityWatchlist([{...spy,symbol:"BAD",committeeScore:NaN}],true).length,0);

const page = await readFile(new URL("../app/decisioni/page.tsx",import.meta.url),"utf8");
assert.match(page,/Radar profitto - priorità di studio/);
assert.match(page,/buildOpportunityWatchlist/);
assert.match(page,/Ordini REALI: BLOCCATI|ORDINI REALI: NON AUTORIZZATI/);
assert.match(page,/Riferimento storico, non live/);
assert.match(page,/limite metodologico/);
console.log("Fenice100K economic opportunity watchlist PASS: ranked near-misses, ETF valuation gap and no orders");
