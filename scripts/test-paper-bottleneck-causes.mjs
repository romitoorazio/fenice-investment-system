import assert from "node:assert/strict";
import { diagnose } from "./diagnose-paper-bottlenecks.mjs";

const now="2026-11-05T18:00:00.000Z";
const fixture={
 committee:{generatedAt:now,topDecisions:[]},
 coverage:{generatedAt:now,rows:[
  {symbol:"EU1",paperEligible:false,independentSourceFamilies:0,approvedIndependentPaperFamilies:[],reasons:["insufficient independent fresh paper-eligible market-data families: 0/2"]},
  {symbol:"US1",paperEligible:true,independentSourceFamilies:2,approvedIndependentPaperFamilies:["alpaca","twelve-data"],reasons:[]},
  {symbol:"JP1",paperEligible:false,independentSourceFamilies:1,approvedIndependentPaperFamilies:["source-a"],reasons:["insufficient independent fresh paper-eligible market-data families: 1/2"]}
 ]},
 terminal:{assets:[]},approval:{minCommitteeScore:70,permittedDecisionStates:["ACCUMULA"]},
 days:{days:[]},ledger:{attempts:[]}
};
const result=diagnose(fixture,now);
assert.equal(result.mode,"PAPER_BOTTLENECK_READ_ONLY");
assert.equal(result.counts.symbols,3);
assert.equal(result.counts.quoteEligible,1);
assert.deepEqual(result.quoteBlockersByCause.INSUFFICIENT_INDEPENDENT_QUOTES.map(x=>x.symbol),["EU1","JP1"]);
assert.equal(result.safeguards.ordersCreated,0);
assert.equal(result.safeguards.liveTradingAllowed,false);
assert.equal(result.safeguards.brokerConnectivityAllowed,false);
assert.equal(result.freshness.coverageFreshForStager,true);
assert.equal(result.freshness.committeeFreshForStager,true);
console.log("Read-only PAPER quote bottleneck diagnosis: PASS");
