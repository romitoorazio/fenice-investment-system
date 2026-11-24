import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {advanceWorldForwardResearchLedger,replayWorldForwardResearchLedger,
  newWorldForwardResearchLedger,summarizeWorldForwardResearchLedger}
  from "../lib/trading/one-global-forward-research.mjs";
import {worldTacticalResearchRadar} from "../lib/intelligence/one-global-tactical-watchlist.mjs";

const terminal=JSON.parse(readFileSync(new URL("../data/terminal-intelligence.json",import.meta.url),"utf8"));
const actualTerminal=structuredClone(terminal);
// Use the actual snapshot below for non-fabrication safety, and a separate
// explicitly SYNTHETIC, completed-bar replay for deterministic ledger tests.
// Real Friday Asia closes can be >72 hours old on Monday morning. They must
// stay excluded, not cause a false CI failure against an arbitrary count.
const syntheticBucketAt=new Date(Date.parse(terminal.generatedAt)-24*3600000).toISOString();
for(const asset of terminal.assets){
  if(!asset.technical)continue;
  asset.technical.observedAt=syntheticBucketAt;
  asset.technical.dailyBarCompletion={
    status:"RESEARCH_SESSION_COMPLETED",heldBackUnsettledCandles:0,
    eligibilityRule:"EXCHANGE_LOCAL_DAY_ELAPSED_OR_PROVIDER_REGULAR_SESSION_END_PLUS_20M",
    independentExchangeCloseCertified:false,paperEligible:false,
    brokerOrderAllowed:false,liveTradingAllowed:false,
  };
}
const actualLegacy=JSON.parse(readFileSync(
  new URL("../data/one-global-forward-research-ledger.json",import.meta.url),"utf8"));
const historicReport=summarizeWorldForwardResearchLedger(actualLegacy);
// Baseline is intentionally no longer all-legacy: new, truly post-session
// observations are being appended to main. Verify the source-linked split
// instead of freezing the number of legacy observations forever.
const currentBarEvents=actualLegacy.events.filter(x=>x.kind==="BAR_OBSERVATION");
const currentSetups=actualLegacy.events.filter(x=>x.kind==="TACTICAL_RESEARCH_SETUP");
const byHash=new Map(currentBarEvents.map(x=>[x.sha256,x]));
const actualGatedSetups=currentSetups.filter(x=>
  byHash.get(x.observationHash)?.candleCompletionPolicy===
  "EXCHANGE_LOCAL_DAY_ELAPSED_OR_PROVIDER_REGULAR_SESSION_END_PLUS_20M").length;
assert.equal(historicReport.setups,currentSetups.length);
assert.equal(historicReport.completionGatedResearchSetups,actualGatedSetups,
  "Only source-linked post-session captures can count as completion-gated research");
assert.equal(historicReport.legacyCompletionUnverifiedSetups,
  currentSetups.length-actualGatedSetups,
  "New verified research observations must never rehabilitate legacy intraday entries");
assert(historicReport.legacyCompletionUnverifiedSetups>=1,
  "Test fixture must retain genuine older pre-gate evidence for regression coverage");
assert.equal(historicReport.shortPositive+historicReport.shortNegative+historicReport.shortFlat,
  historicReport.shortOutcomesMeasured,
  "All actually matured later-bar research outcomes must be counted, including losses");
assert(historicReport.results.filter(x=>x.legacyEntryUnverified).every(x=>
  x.entryCandleCompletionGated===false
  &&x.shortAfter2ObservedBars===null
  &&x.shortAfter10ObservedBars===null
  &&x.mediumAfter40ObservedBars===null),
  "No legacy source bar may gain a return merely by collecting newer daily snapshots");
assert(historicReport.results.filter(x=>x.shortAfter2ObservedBars!==null).every(x=>
  x.entryCandleCompletionGated===true),
  "Genuine measured outcomes may grow naturally as new settled bars arrive");

const at=new Date(Date.parse(terminal.generatedAt)+60_000).toISOString();
// Read-only safety check on ACTUAL generated provider observations: no future
// bucket, old Friday/holiday close or unselected venue may be admitted.
const actualWatch=worldTacticalResearchRadar({terminal:actualTerminal,nowIso:at});
const actualSelected=new Set(actualWatch.screenedResearch.map(
  row=>String(row.venueMic||"UNVERIFIED")+":"+row.symbol));
const actualScan=advanceWorldForwardResearchLedger({
  terminal:actualTerminal,nowIso:at,previousLedger:newWorldForwardResearchLedger()});
assert(actualScan.ledger.events.filter(e=>e.kind==="BAR_OBSERVATION").every(e=>
  actualSelected.has(e.key)&&Date.parse(e.barBucketAt)<=Date.parse(at)
  &&Date.parse(at)-Date.parse(e.barBucketAt)<=3*86400000),
  "Actual snapshots must never append expired/future or ineligible bars");
assert.equal(actualScan.performance.paperFills,0);
// A tactical radar may legitimately show 4-day-old Friday candles, but the
// prospective ledger must reject them even when the synthetic research window
// otherwise qualifies. This guards the exact Monday/holiday failure mode.
const fourDayOld=structuredClone(terminal);
const oldBucket=new Date(Date.parse(at)-4*86400000).toISOString();
for(const asset of fourDayOld.assets)
  if(asset.technical)asset.technical.observedAt=oldBucket;
const rejectedOld=advanceWorldForwardResearchLedger({
  terminal:fourDayOld,nowIso:at,previousLedger:newWorldForwardResearchLedger()});
assert.equal(rejectedOld.newObservations,0,
  "No research observation may be backfilled from 4-day-old chart buckets");
assert.equal(rejectedOld.newSetups,0);
const blank=newWorldForwardResearchLedger();
assert.deepEqual(blank.events,[]);
assert.equal(blank.liveTradingAllowed,false);
assert.equal(blank.phase9Credit,0);
const first=advanceWorldForwardResearchLedger({terminal,nowIso:at,previousLedger:blank});
assert(first.newObservations>=10,"Must capture international research using real terminal snapshot");
assert(first.newSetups>=8,"Global balanced watchlist should have nonempty live candidates");
assert.equal(first.ledger.events.length,first.newObservations+first.newSetups);
assert.equal(first.performance.shortOutcomesMeasured,0);
assert.equal(first.performance.completionGatedResearchSetups,first.newSetups);
assert.equal(first.performance.legacyCompletionUnverifiedSetups,0);
assert.equal(first.performance.phase9Credit,0);
assert.equal(replayWorldForwardResearchLedger(first.ledger).valid,true);
const repeat=advanceWorldForwardResearchLedger({
  terminal,nowIso:new Date(Date.parse(at)+120_000).toISOString(),
  previousLedger:first.ledger});
assert.equal(repeat.newObservations,0,"Same candle bucket cannot create a second observation");
assert.equal(repeat.newSetups,0,"Same candle bucket cannot create a second setup");
assert.equal(repeat.ledger.lastHash,first.ledger.lastHash);
const baseKey=first.ledger.events.find(e=>e.kind==="TACTICAL_RESEARCH_SETUP").key;
function moveDays(days,previousLedger){
  const next=structuredClone(terminal);
  const newAt=new Date(Date.parse(at)+days*86400000).toISOString();
  next.generatedAt=new Date(Date.parse(terminal.generatedAt)+days*86400000).toISOString();
  next.assets=next.assets.map(asset=>{
    if(!asset.technical?.observedAt)return asset;
    const key=String(asset.technical.exchangeMic||"UNVERIFIED")+":"+asset.symbol;
    asset.technical.observedAt=new Date(Date.parse(asset.technical.observedAt)+days*86400000).toISOString();
    asset.price*=key===baseKey ? (days>=2?0.94:1.02) : 1.01*days;
    return asset;
  });
  return advanceWorldForwardResearchLedger({terminal:next,nowIso:newAt,previousLedger});
}
const second=moveDays(1,first.ledger);
assert(second.newObservations>0,"Later daily candles must be processed prospectively");
assert.equal(second.performance.shortOutcomesMeasured,0,
  "An outcome requires TWO later observations, not a backfilled guess");
const third=moveDays(2,second.ledger);
assert(third.performance.shortOutcomesMeasured>0);
assert.equal(third.performance.legacyCompletionUnverifiedSetups,0);
assert(third.ledger.events.filter(e=>e.kind==="BAR_OBSERVATION").every(e=>
  e.candleCompletionPolicy==="EXCHANGE_LOCAL_DAY_ELAPSED_OR_PROVIDER_REGULAR_SESSION_END_PLUS_20M"
  &&e.independentExchangeCloseCertified===false));
assert(third.performance.shortNegative>=1,"Record losses as readily as gains");
assert(third.performance.shortPositive>=1);
assert.equal(third.performance.mediumOutcomesMeasured,0);
assert.equal(third.performance.paperFills,0);
assert.equal(third.performance.phase9Credit,0);
assert.equal(third.ledger.liveTradingAllowed,false);
assert.equal(third.ledger.paperEligible,false);
assert(third.performance.results.every(x=>x.researchOnly&&x.certifiedStrategyTrade===false));
assert(third.performance.results.some(x=>x.shortAfter2ObservedBars &&
  x.shortAfter2ObservedBars.feesAndFxIncluded===false));
assert(replayWorldForwardResearchLedger(third.ledger).valid);
const changed=structuredClone(third.ledger);
changed.events[0].close+=100;
assert.throws(()=>replayWorldForwardResearchLedger(changed),
 /FORWARD_RESEARCH_EVENT_CHAIN_INVALID/,
 "Changing a stored research close must break the hash chain");
const modifiedTip=structuredClone(third.ledger);
modifiedTip.lastHash="a".repeat(64);
assert.throws(()=>replayWorldForwardResearchLedger(modifiedTip),
 /FORWARD_RESEARCH_LEDGER_TIP_INVALID/);
const noYesterday=structuredClone(terminal);
noYesterday.generatedAt=new Date(Date.parse(at)-8*86400000).toISOString();
const stale=advanceWorldForwardResearchLedger({previousLedger:first.ledger,terminal:noYesterday,nowIso:at});
assert(stale.blocked.includes("FRESH_WORLD_TERMINAL_REQUIRED"));
assert.equal(stale.ledger.lastHash,first.ledger.lastHash);
const none=summarizeWorldForwardResearchLedger(newWorldForwardResearchLedger());
assert.equal(none.shortPositive,0);
assert.equal(none.shortNegative,0);
assert.equal(none.phase9Credit,0);
const withoutSessionEvidence=structuredClone(terminal);
for(const asset of withoutSessionEvidence.assets)
  if(asset.technical)delete asset.technical.dailyBarCompletion;
const blockedNoEvidence=advanceWorldForwardResearchLedger({
  terminal:withoutSessionEvidence,nowIso:at,previousLedger:newWorldForwardResearchLedger()});
assert.equal(blockedNoEvidence.newObservations,0,
  "Never append today's chart as a final daily close if provider session gate is missing");
assert.equal(blockedNoEvidence.newSetups,0);
console.log("PASS ONE GLOBAL prospective worldwide research: immutable sessions, no backfill, positive/negative outcomes, stale safety, zero PAPER/Directa");

const controls=first.ledger.events.filter(e=>e.screen?.selection==="COMPARISON");
assert(controls.length>0);
assert(controls.every(c=>!first.ledger.events.some(s=>s.observationHash===c.sha256)));
assert.deepEqual(summarizeWorldForwardResearchLedger(third.ledger,{asOf:at}),first.performance,
  "An as-of replay cannot see events beyond the cutoff");
assert.equal(third.performance.pointInTime.horizons[2].measured,0,
  "A bucket already underway when the setup was logged cannot be a forward entry");
const fourth=moveDays(3,third.ledger);
const fifth=moveDays(4,fourth.ledger);
const pit=fifth.performance.pointInTime.horizons[2];
assert(pit.measured>0);
assert(pit.byAttention.OUTSIDE_WATCHLIST.measured>0);
assert.equal(pit.measured,pit.up+pit.down+pit.flat);
assert.equal(pit.pastFrequencyBenchmark.brier,null);
assert.equal(fifth.performance.pointInTime.horizons[40].measured,0);
assert.equal(fifth.performance.pointInTime.strategyPromotionAllowed,false);
assert.equal(fifth.performance.pointInTime.netReturnPct,null);

const {summarizeForwardDecisions}=await import("../lib/intelligence/one-global-forward-diagnostics.mjs");
const instant=n=>new Date(Date.UTC(2026,0,1)+n*60000).toISOString();
const observations=new Map(), predictions=[];
for(let i=0;i<32;i++){
  const key="TEST:"+i,offset=i*10;
  // For case 30 the label is only received when case 31 starts.
  const marks=[100,105,i<30?90:110].map((close,j)=>({close,barBucketAt:instant(offset+j+1),
    recordedAt:instant(i===30&&j===2?310:offset+j+2)}));
  observations.set(key,new Map([["USD",marks]]));
  predictions.push({key,at:instant(offset),currency:"USD",selected:true,short:"MOMENTUM_WATCH",medium:"TREND_WATCH"});
}
const bench=summarizeForwardDecisions(predictions,observations).horizons[2].pastFrequencyBenchmark;
assert.deepEqual(bench,{tested:2,minPriorGroupOutcomes:30,brier:1,pooledBaselineBrier:1});
