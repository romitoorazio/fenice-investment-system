import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {worldTacticalResearchRadar} from "../lib/intelligence/one-global-tactical-watchlist.mjs";
const terminal=JSON.parse(readFileSync(new URL("../data/terminal-intelligence.json",import.meta.url),"utf8"));
const at=new Date(Date.parse(terminal.generatedAt)+60_000).toISOString();
const result=worldTacticalResearchRadar({terminal,nowIso:at});
assert.equal(result.mode,"ONE_GLOBAL_WORLD_TACTICAL_RESEARCH_ONLY");
assert.equal(result.staleSnapshot,false);
assert(result.universeReviewed>=30);
assert(result.equityResearchRows>=15);
assert(result.globalRows>=10);
assert(result.byRegion.europe>=3);
assert(result.byRegion["asia-pacific"]>=3);
assert(result.byRegion["north-america"]>=1);
assert(result.balancedGlobalWatchlist.some(row=>row.venueRegion==="europe"));
assert(result.balancedGlobalWatchlist.some(row=>row.venueRegion==="asia-pacific"));
assert(result.balancedGlobalWatchlist.some(row=>row.venueRegion==="north-america"));
assert(result.policy.researchOnly);
assert.equal(result.policy.paperExecutionAllowed,false);
assert.equal(result.policy.phase9CertificationCredit,0);
assert.equal(result.policy.liveTradingAllowed,false);
for(const row of [...result.topAcrossAllVenues,...result.balancedGlobalWatchlist]){
  assert(Number.isSafeInteger(row.shortTechnicalScore));
  assert(Number.isSafeInteger(row.mediumTechnicalScore));
  assert.equal(row.currentPricePublished,false);
  assert.equal(row.forecastReturnPercent,null);
  assert.equal(row.predictedWinProbability,null);
  assert.equal(row.paperEligible,false);
  assert.equal(row.brokerOrderAllowed,false);
  assert.equal(row.investmentRecommendation,false);
  for(const forbidden of ["price","quote","targetWeightPercent","targetAmountEuro","winProbability","expectedReturnPercent"]){
    assert.equal(Object.hasOwn(row,forbidden),false,forbidden+" must not leak into the research queue");
  }
}
const raw=JSON.stringify(result);
assert(!raw.includes("COMPRA") && !raw.includes("brokerOrderId"),
  "Research must not forge real trading decisions or executions");
const future=structuredClone(terminal);
future.assets[0].technical.observedAt=new Date(Date.parse(at)+86400000).toISOString();
assert(!worldTacticalResearchRadar({terminal:future,nowIso:at})
  .topAcrossAllVenues.some(x=>x.symbol===future.assets[0].symbol),
  "Future daily price bucket must not become signal evidence");
const stale=worldTacticalResearchRadar({terminal,
  nowIso:new Date(Date.parse(at)+7*86400000).toISOString()});
assert.equal(stale.staleSnapshot,true);
assert.equal(stale.equityResearchRows,0);
assert.equal(stale.topAcrossAllVenues.length,0);
assert.throws(()=>worldTacticalResearchRadar({terminal,nowIso:"BAD"}),
  /WORLD_RESEARCH_CLOCK_INVALID/);
assert.deepEqual(worldTacticalResearchRadar({terminal,nowIso:at}),result,
  "Global ranking is deterministic: no randomness or US-first tie promotion");
console.log("PASS ONE GLOBAL worldwide tactical radar: research-only 2-10 day / 2-8 week attention, global balance and fail-closed stale/evidence gate");
