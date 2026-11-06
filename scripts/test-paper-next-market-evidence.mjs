import assert from "node:assert/strict";
import {assessPaperNextMarketEvidence as assess} from "./paper-next-market-evidence.mjs";
const now="2026-11-06T15:00:00.000Z";
const fixture=()=>({
 now,venue:"US_EQUITIES",
 session:{configured:true,evidence:{venue:"US_EQUITIES",authoritative:true,state:"OPEN",observedAt:"2026-11-06T14:59:00.000Z"},
 decision:{allowed:true},liveTradingAllowed:false,nextClose:"2026-11-06T20:00:00.000Z"},
 coverage:{generatedAt:"2026-11-06T14:59:00.000Z",policy:{liveTradingAllowed:false,minIndependentSourceFamilies:2},
 paperEligibleSymbols:3,rows:["A","B","C"].map(symbol=>({symbol,paperEligible:true,independentSourceFamilies:2,state:"CAUTION",medianPrice:100}))}
});
assert.equal(assess(fixture()).ready,true);
const cases=[
 ["wrong venue",x=>x.venue="TSE"],
 ["missing venue",x=>x.venue=""],
 ["closed market",x=>x.session.evidence.state="CLOSED"],
 ["untrusted clock",x=>x.session.evidence.authoritative=false],
 ["future session",x=>x.session.evidence.observedAt="2026-11-06T15:01:00.000Z"],
 ["stale session",x=>x.session.evidence.observedAt="2026-11-06T14:57:00.000Z"],
 ["future quotes",x=>x.coverage.generatedAt="2026-11-06T15:01:00.000Z"],
 ["stale quotes",x=>x.coverage.generatedAt="2026-11-06T14:57:00.000Z"],
 ["near close",x=>x.session.nextClose="2026-11-06T15:04:00.000Z"],
 ["broker unlocked",x=>x.coverage.policy.liveTradingAllowed=true],
 ["one source",x=>x.coverage.rows[0].independentSourceFamilies=1],
 ["too few rows",x=>x.coverage.rows=[]],
 ["bad price",x=>x.coverage.rows[0].medianPrice=0],
 ["invalid clock",x=>x.now="invalid"],
 ["session live unlocked",x=>x.session.liveTradingAllowed=true],
];
for(const [name,mutate] of cases){const x=fixture();mutate(x);assert.equal(assess(x).ready,false,name);}
console.log("PAPER-next market evidence: PASS ("+cases.length+" negative gates)");
