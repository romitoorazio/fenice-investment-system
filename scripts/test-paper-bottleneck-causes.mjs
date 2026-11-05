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
const withResearchGaps=diagnose({...fixture,committee:{...fixture.committee,topDecisions:fixture.committee.topDecisions.map(d=>d.symbol==="EU1"?{...d,buyGapEvidence:{scope:"RESEARCH_RULES_ONLY",status:"NOT_QUALIFIED",gaps:[{code:"SCORE_RESEARCH_GAP",actual:64,requiredMin:78}]}}:d)}},now);
assert.equal(withResearchGaps.researchGapCounts.SCORE_RESEARCH_GAP,1);
assert.equal(withResearchGaps.researchGapsBySymbol[0].scope,"RESEARCH_RULES_ONLY");
assert.equal(withResearchGaps.decisionBlockers[0].minScore,70);
const completeCommittee=diagnose({...fixture,committee:{...fixture.committee,allDecisions:[...fixture.committee.topDecisions,{symbol:"EXTRA",decision:"ATTENDI",committeeScore:50}]}},now);
assert.deepEqual(completeCommittee.universeMismatch.committeeMissingCoverage,["EXTRA"]);
assert.equal(completeCommittee.decisionBlockers.some(x=>x.symbol==="EXTRA"),true);
const terminalAllowed=diagnose({...fixture,terminal:{assets:[{symbol:"US1",decision:"ACCUMULA"}]}},now);
assert.equal(terminalAllowed.rows.find(x=>x.symbol==="US1").blockers.includes("TERMINAL_DECISION_NOT_PERMITTED"),false);
assert.equal(terminalAllowed.rows.find(x=>x.symbol==="US1").blockers.length,0);
assert.equal(terminalAllowed.rows.find(x=>x.symbol==="EU1").blockers.includes("TERMINAL_DECISION_NOT_PERMITTED"),false);
const deepDcf=diagnose({...fixture,committee:{...fixture.committee,allDecisions:[{...fixture.committee.topDecisions[0],valuation:{status:"disponibile",upsideBasePercent:-70.9}}]}},now);
assert.deepEqual(deepDcf.valuationWarnings,[{symbol:"EU1",upsideBasePercent:-70.9,warning:"DCF_DEEP_OVERVALUATION_REQUIRES_INPUT_REVIEW",researchOnly:true}]);
assert.deepEqual(result.valuationWarnings,[]);
assert.equal(result.mode,"PAPER_BOTTLENECK_READ_ONLY");
assert.equal(result.counts.symbols,4);
assert.deepEqual(result.universeMismatch.coverageMissingCommittee,[]);
assert.deepEqual(result.universeMismatch.committeeMissingCoverage,[]);
const missingCommittee=diagnose({...fixture,committee:{...fixture.committee,topDecisions:fixture.committee.topDecisions.filter(x=>x.symbol!=="FR1")}},now);
assert.deepEqual(missingCommittee.universeMismatch.coverageMissingCommittee,["FR1"]);
assert.deepEqual(missingCommittee.universeMismatch.quoteReadyButMissingCommittee,[]);
assert.deepEqual(missingCommittee.universeMismatch.quoteReadyButDecisionBlocked.map(x=>x.symbol),[]);
const noUsDecision=diagnose({...fixture,committee:{...fixture.committee,topDecisions:fixture.committee.topDecisions.filter(x=>x.symbol!=="US1")}},now);
assert.deepEqual(noUsDecision.universeMismatch.quoteReadyButMissingCommittee,["US1"]);
assert.ok(missingCommittee.rows.find(x=>x.symbol==="FR1").blockers.includes("NOT_IN_COMMITTEE"));
assert.equal(missingCommittee.safeguards.ordersCreated,0);
assert.equal(result.counts.quoteEligible,1);
assert.deepEqual(result.researchGapCounts,{});
assert.deepEqual(result.researchGapsBySymbol,[]);
assert.equal(result.counts.freshPreliminaryCandidatesPresent,false);
const stale=diagnose({...fixture,coverage:{...fixture.coverage,generatedAt:"2026-11-04T18:00:00.000Z"}},now);
assert.equal(stale.freshness.coverageFreshForStager,false);
assert.equal(stale.counts.freshPreliminaryCandidatesPresent,false);
const inconsistent=diagnose({...fixture,coverage:{...fixture.coverage,rows:fixture.coverage.rows.map(x=>x.symbol==="FR1"?{...x,paperEligible:true,independentSourceFamilies:1}:x)}},now);
assert.equal(inconsistent.counts.quoteEligible,1);
assert.ok(inconsistent.quoteBlockersByCause.INSUFFICIENT_INDEPENDENT_QUOTES.some(x=>x.symbol==="FR1"));
assert.equal(result.rows.find(x=>x.symbol==="FR1").quoteEligible,false);
assert.ok(result.rows.find(x=>x.symbol==="FR1").blockers.includes("NO_INDEPENDENT_QUOTE_QUORUM"));
assert.deepEqual(result.quoteBlockersByCause.INSUFFICIENT_INDEPENDENT_QUOTES.map(x=>x.symbol),["EU1","JP1"]);
assert.equal(result.safeguards.ordersCreated,0);
assert.equal(result.decisionBlockers[0].symbol,"EU1");
assert.equal(result.decisionBlockers[0].scoreGap,6);
assert.deepEqual(result.decisionBlockers[0].reasons,["SCORE_BELOW_APPROVED_MINIMUM"]);
assert.ok(result.rows.find(x=>x.symbol==="JP1").blockers.includes("MISSING_COMMITTEE_SCORE"));
assert.equal(result.decisionBlockers.find(x=>x.symbol==="JP1").score,null);
assert.equal(result.decisionBlockers.find(x=>x.symbol==="JP1").scoreGap,null);
assert.deepEqual(result.decisionBlockers.find(x=>x.symbol==="JP1").reasons,["MISSING_COMMITTEE_SCORE"]);
assert.equal(result.safeguards.liveTradingAllowed,false);
assert.equal(result.safeguards.brokerConnectivityAllowed,false);
assert.equal(result.freshness.coverageFreshForStager,true);
assert.equal(result.freshness.committeeFreshForStager,true);
console.log("Read-only PAPER quote bottleneck diagnosis: PASS");
