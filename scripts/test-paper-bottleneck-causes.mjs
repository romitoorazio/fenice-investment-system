import assert from "node:assert/strict";
import { diagnose } from "./diagnose-paper-bottlenecks.mjs";

const now="2026-11-05T18:00:00.000Z";
const fixture={
 committee:{generatedAt:now,topDecisions:[{symbol:"EU1",decision:"ATTENDI",committeeScore:64},{symbol:"US1",decision:"ACCUMULA",committeeScore:73},{symbol:"JP1",decision:"ACCUMULA",committeeScore:null},{symbol:"FR1",decision:"ACCUMULA",committeeScore:75}]},
 coverage:{generatedAt:now,rows:[
  {symbol:"EU1",paperEligible:false,independentSourceFamilies:0,approvedIndependentPaperFamilies:[],reasons:["insufficient independent fresh paper-eligible market-data families: 0/2"]},
  {symbol:"US1",paperEligible:true,independentSourceFamilies:2,approvedIndependentPaperFamilies:["alpaca","twelve-data"],reasons:[]},
  {symbol:"JP1",paperEligible:false,independentSourceFamilies:1,approvedIndependentPaperFamilies:["source-a"],reasons:["insufficient independent fresh paper-eligible market-data families: 1/2"]},
  {symbol:"FR1",paperEligible:false,independentSourceFamilies:2,approvedIndependentPaperFamilies:["source-a","source-b"],reasons:["FX evidence missing"]}
 ]},
 terminal:{assets:[]},approval:{minCommitteeScore:70,permittedDecisionStates:["ACCUMULA"]},
 days:{days:[]},ledger:{attempts:[]}
};
const result=diagnose(fixture,now);
assert.equal(result.mode,"PAPER_BOTTLENECK_READ_ONLY");
assert.equal(result.counts.symbols,4);
assert.equal(result.counts.quoteEligible,1);
assert.equal(result.counts.freshPreliminaryCandidatesPresent,false);
const stale=diagnose({...fixture,coverage:{...fixture.coverage,generatedAt:"2026-11-04T18:00:00.000Z"}},now);
assert.equal(stale.freshness.coverageFreshForStager,false);
assert.equal(stale.counts.freshPreliminaryCandidatesPresent,false);
const inconsistent=diagnose({...fixture,coverage:{...fixture.coverage,rows:fixture.coverage.rows.map(x=>x.symbol==="FR1"?{...x,paperEligible:true,independentSourceFamilies:1}:x)}},now);
assert.equal(inconsistent.counts.quoteEligible,1);
assert.equal(result.rows.find(x=>x.symbol==="FR1").quoteEligible,false);
assert.ok(result.rows.find(x=>x.symbol==="FR1").blockers.includes("NO_INDEPENDENT_QUOTE_QUORUM"));
assert.deepEqual(result.quoteBlockersByCause.INSUFFICIENT_INDEPENDENT_QUOTES.map(x=>x.symbol),["EU1","JP1"]);
assert.equal(result.safeguards.ordersCreated,0);
assert.equal(result.decisionBlockers[0].symbol,"EU1");
assert.equal(result.decisionBlockers[0].scoreGap,6);
assert.deepEqual(result.decisionBlockers[0].reasons,["SCORE_BELOW_APPROVED_MINIMUM","DECISION_NOT_PERMITTED"]);
assert.ok(result.rows.find(x=>x.symbol==="JP1").blockers.includes("MISSING_COMMITTEE_SCORE"));
assert.equal(result.decisionBlockers.find(x=>x.symbol==="JP1").score,null);
assert.equal(result.decisionBlockers.find(x=>x.symbol==="JP1").scoreGap,null);
assert.deepEqual(result.decisionBlockers.find(x=>x.symbol==="JP1").reasons,["MISSING_COMMITTEE_SCORE"]);
assert.equal(result.safeguards.liveTradingAllowed,false);
assert.equal(result.safeguards.brokerConnectivityAllowed,false);
assert.equal(result.freshness.coverageFreshForStager,true);
assert.equal(result.freshness.committeeFreshForStager,true);
console.log("Read-only PAPER quote bottleneck diagnosis: PASS");
