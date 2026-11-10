import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnoseOneGlobalVenues} from "./diagnose-one-global-venues.mjs";
const read=name=>JSON.parse(readFileSync("data/"+name,"utf8"));
const baseline={
  globalLedger:read("world-v7-validation-ledger.json"),
  providerObservation:read("world-v7-provider-observation.json"),
  eodResearch:read("world-v7-eod-research.json"),
  usCoverage:read("execution-market-coverage.json"),
  nowIso:"2026-11-10T19:00:00.000Z",
};
const a=diagnoseOneGlobalVenues(baseline);
assert.equal(a.summary.venuesTracked,8);
assert.equal(a.summary.eligibleStrategyVenues,0);
assert.equal(a.summary.certifiedStrategyFills,0);
assert.equal(a.summary.usCoverageFresh,false);
assert.equal(a.safety.liveTradingAllowed,false);
assert.equal(a.safety.strategyOrderAuthorizationGranted,false);
assert.equal(a.safety.marketPricesPublished,false);
assert.equal(a.safety.technicalV8CreditedAsWorldStrategy,false);
assert.equal(a.venues.length,8);
assert.deepEqual(a.summary.priorityVenues,["XMIL","XETR","XTKS"]);
const milan=a.venues.find(v=>v.mic==="XMIL");
const xetra=a.venues.find(v=>v.mic==="XETR");
const tokyo=a.venues.find(v=>v.mic==="XTKS");
assert(milan.blockers.includes("PROVIDER_CATALOGUE_INDICATES_PAID_TIER"));
assert.equal(milan.providerDiagnostic.requiredPlanAdvertised,"Pro");
assert(milan.blockers.includes("HISTORICAL_LISTING_MAPPING_UNCERTIFIED"));
assert(milan.blockers.includes("NO_COMPLETE_DAILY_HISTORY"));
assert(milan.blockers.includes("PROVIDER_ACCESS_OBSERVATION_OLDER_THAN_24H"));
assert(xetra.blockers.includes("PROVIDER_CATALOGUE_INDICATES_PAID_TIER"));
assert.equal(xetra.providerDiagnostic.requiredPlanAdvertised,"Grow");
assert.equal(xetra.researchDays,13);
assert.equal(xetra.dailyResearch.provisionalMapping,true);
assert.equal(xetra.dailyResearch.executionEligible,false);
assert(tokyo.blockers.includes("EXACT_TRADING_SEGMENT_NOT_PROVEN"));
assert(tokyo.blockers.includes("JPY_EUR_EXECUTABLE_FX_MISSING"));
assert.equal(tokyo.providerDiagnostic.providerMic,"XJPX");
assert.equal(tokyo.dailyResearch.lastCompleteBarDate,null);
assert(a.venues.every(v=>v.prospectiveStrategyPaperEligible===false&&v.certifiedTrades===0));
assert(a.venues.every(v=>!("price" in v)&&!("bid" in v)&&!("ask" in v)));
assert(a.nextSteps.XMIL.some(x=>x.includes("two independent")));
const bad=(fn,match)=>{
  const b=structuredClone(baseline);fn(b);
  assert.throws(()=>diagnoseOneGlobalVenues(b),match);
};
bad(b=>{b.globalLedger.venues.XETR.paperEligible=true},/WORLD_LEDGER/);
bad(b=>{b.globalLedger.venues.XTKS.certifiedPaperFills=1},/WORLD_LEDGER/);
bad(b=>{b.globalLedger.liveTradingAllowed=true},/WORLD_LEDGER/);
bad(b=>{b.providerObservation.paperReady=true},/PROVIDER_DIAGNOSTIC/);
bad(b=>{b.providerObservation.records.XMIL.quote.paperEligible=true},/PROVIDER_RECORD_TAMPER/);
const adjusted=structuredClone(baseline);
adjusted.providerObservation.records.XTKS.target.providerMic="XTKS";
adjusted.providerObservation.records.XTKS.target.canonicalSegmentProof=true;
adjusted.providerObservation.records.XTKS.state.operatingMicIsNotSegmentProof=false;
const stillBlocked=diagnoseOneGlobalVenues(adjusted).venues.find(v=>v.mic==="XTKS");
assert.equal(stillBlocked.prospectiveStrategyPaperEligible,false);
assert(stillBlocked.blockers.includes("TWO_REALTIME_QUOTES_MISSING"));

bad(b=>{b.providerObservation.records.XMIL.venue="XETR"},/PROVIDER_RECORD_TAMPER/);
bad(b=>{b.providerObservation.records.XMIL.privatePricePublished=true},/PROVIDER_RECORD_TAMPER/);
bad(b=>{b.eodResearch.realtimePaperEligible=true},/EOD_RESEARCH_RIGHTS/);
bad(b=>{b.eodResearch.records.XETR.licensedPaperSource=true},/EOD_RECORD_TAMPER/);
bad(b=>{b.eodResearch.records.XETR.paperFillCount=1},/EOD_RECORD_TAMPER/);
bad(b=>{b.usCoverage.policy.liveTradingAllowed=true},/US_COVERAGE_RIGHTS/);
bad(b=>{b.nowIso="INVALID"},/CLOCK_INVALID/);
const recent=structuredClone(baseline);
recent.usCoverage.generatedAt="2026-11-10T18:59:00.000Z";
const b=diagnoseOneGlobalVenues(recent);
assert.equal(b.summary.usCoverageFresh,true);
assert.equal(b.summary.eligibleStrategyVenues,0,
  "fresh technical US coverage does NOT create strategy paper rights");
const future=structuredClone(baseline);
future.providerObservation.records.XMIL.recordedAt="2026-11-12T18:00:00.000Z";
const c=diagnoseOneGlobalVenues(future);
assert.equal(c.venues.find(v=>v.mic==="XMIL").providerDiagnostic.ageMinutes,null);
assert(c.venues.find(v=>v.mic==="XMIL").blockers.includes("PROVIDER_ACCESS_OBSERVATION_OLDER_THAN_24H"));
console.log("PASS: global venue diagnostics (8 countries/MIC, stale quotes, paid tier advisory, 13 fail-closed tests, no broker/strategy entitlement)");
