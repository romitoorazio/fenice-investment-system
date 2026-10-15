import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessBuyOnlyForwardEdge } from "../lib/intelligence/buy-only-forward-edge.mjs";
import { evaluateDecisionBenchmarkEdge } from "../lib/intelligence/decision-edge-research.mjs";

const instant = (d, hour = 18) => new Date(Date.UTC(2026, 8, d, hour)).toISOString();
const sample = (symbol, decision, date, entry, exitPrice, { historicalBackfill = false } = {}) => ({
  symbol, decision, currency: "USD",
  createdAt: instant(date),
  observationDate: instant(date).slice(0, 10),
  referencePrice: entry,
  historicalBackfill,
  checkpoints: { "1d": {
    measuredAt: instant(date + 1),
    source: "current-committee",
    price: exitPrice,
    returnPercent: Math.round((exitPrice / entry - 1) * 10000) / 100,
  } },
});
const now = new Date("2026-10-20T10:00:00Z");

// A huge positive backtest on titles Fenice explicitly said WAIT is never BUY alpha.
const noBuy = evaluateDecisionBenchmarkEdge([
  sample("SPY","ATTENDI",1,100,101),
  sample("NVDA","ATTENDI",1,100,150),
  sample("QQQ","EVITA",1,100,140),
],{now}).horizons["1d"];
assert.equal(noBuy.hypotheticalMeanExcessVsBenchmarkPercent, 43.7);
assert.equal(noBuy.buyOnlyEvidence.forward.sampleSize,0);
assert.equal(noBuy.buyOnlyEvidence.forward.hypotheticalMeanExcessVsBenchmarkPercent,null);
assert.equal(noBuy.buyOnlyEvidence.state,"NO_FORWARD_BUY_SAMPLES");
assert.equal(noBuy.buyOnlyEvidence.actualTradingProfitDemonstrated,false);
assert.equal(noBuy.buyOnlyEvidence.canAuthorizeLive,false);
const retrospectiveSpy = sample("SPY","ATTENDI",1,100,101,{historicalBackfill:true});
const forwardBuy = sample("NVDA","COMPRA",1,100,120);
const isolated = evaluateDecisionBenchmarkEdge([retrospectiveSpy,forwardBuy],{now}).horizons["1d"];
assert.equal(isolated.pairedSamples,0,"BUY forward cannot use SPY from a historical backfill");
assert.equal(isolated.buyOnlyEvidence.forward.sampleSize,0);
assert.equal(isolated.buyOnlyEvidence.sampleMature,false);

const singleDay = assessBuyOnlyForwardEdge(
  Array.from({length:40},(_,n)=>({
    decision:"COMPRA",origin:"FORWARD_RECORDED",observationDate:"2026-10-01",
    hypotheticalNetPercent:2,excessPercent:n % 2 === 0 ? 1 : 3,
  }))
);
assert.equal(singleDay.forward.sampleSize,40);
assert.equal(singleDay.forward.independentEntryDays,1);
assert.equal(singleDay.state,"FORWARD_BUY_EVIDENCE_INSUFFICIENT");
assert.equal(singleDay.sampleMature,false);

const forward = Array.from({length:30},(_,n)=>({
  decision:"COMPRA", origin:"FORWARD_RECORDED",
  observationDate:new Date(Date.UTC(2026,8,n+1)).toISOString().slice(0,10),
  hypotheticalNetPercent:2,excessPercent:1,
}));
const retrospective = Array.from({length:30},(_,n)=>({
  decision:"COMPRA",origin:"HISTORICAL_BACKFILL",
  observationDate:new Date(Date.UTC(2026,7,n+1)).toISOString().slice(0,10),
  hypotheticalNetPercent:90,excessPercent:80,
}));
const numeric = assessBuyOnlyForwardEdge([...forward,...retrospective]);
assert.equal(numeric.forward.sampleSize,30);
assert.equal(numeric.forward.independentEntryDays,30);
assert.equal(numeric.forward.equalEntryDayMeanExcessPercent,1);
assert.equal(numeric.retrospective.sampleSize,30);
assert.equal(numeric.retrospective.hypotheticalMeanExcessVsBenchmarkPercent,80);
assert.equal(numeric.state,"NUMERIC_RESEARCH_REVIEW_REQUIRED");
assert.equal(numeric.actualTradingProfitDemonstrated,false);
assert.equal(numeric.canAuthorizePaper,false);
assert.equal(numeric.canAuthorizeLive,false);
const unknown = assessBuyOnlyForwardEdge([{...forward[0],origin:"UNKNOWN_ORIGIN"}]);
assert.equal(unknown.forward.sampleSize,0);
assert.equal(unknown.excludedUnknownOriginBuySamples,1);
const failing = assessBuyOnlyForwardEdge(forward.map(x=>({...x,excessPercent:-2})));
assert.equal(failing.state,"FORWARD_BUY_NOT_OUTPERFORMING");
assert.equal(failing.benchmarkOutperformedNumerically,false);
const edgeByDays = assessBuyOnlyForwardEdge([
  {...forward[0],excessPercent:10},
  {...forward[0],excessPercent:10},
  {...forward[1],excessPercent:-2},
]);
assert.equal(edgeByDays.forward.hypotheticalMeanExcessVsBenchmarkPercent,6);
assert.equal(edgeByDays.forward.equalEntryDayMeanExcessPercent,4);
assert.equal(assessBuyOnlyForwardEdge([]).forward.benchmarkBeatRatePercent,null);

const evaluator = await readFile(new URL("../lib/intelligence/decision-edge-research.mjs",import.meta.url),"utf8");
const page = await readFile(new URL("../app/performance/page.tsx",import.meta.url),"utf8");
assert.match(evaluator,/result\.buyOnlyEvidence = assessBuyOnlyForwardEdge\(compared\)/);
assert.match(evaluator,/UNKNOWN_ORIGIN/);
assert.match(page,/Evidenza COMPRA registrata in avanti/);
assert.match(page,/Nessun rendimento reale dimostrato/);
assert.match(page,/row\.buyOnlyEvidence\?\.forward\.sampleSize/);
console.log("Fenice BUY-only forward performance evidence + independent day tests: PASS");
