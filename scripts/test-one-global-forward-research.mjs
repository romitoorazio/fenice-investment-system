import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {advanceWorldForwardResearchLedger,replayWorldForwardResearchLedger,
  newWorldForwardResearchLedger,summarizeWorldForwardResearchLedger}
  from "../lib/trading/one-global-forward-research.mjs";

const terminal=JSON.parse(readFileSync(new URL("../data/terminal-intelligence.json",import.meta.url),"utf8"));
const at=new Date(Date.parse(terminal.generatedAt)+60_000).toISOString();
const blank=newWorldForwardResearchLedger();
assert.deepEqual(blank.events,[]);
assert.equal(blank.liveTradingAllowed,false);
assert.equal(blank.phase9Credit,0);
const first=advanceWorldForwardResearchLedger({terminal,nowIso:at,previousLedger:blank});
assert(first.newObservations>=10,"Must capture international research using real terminal snapshot");
assert(first.newSetups>=8,"Global balanced watchlist should have nonempty live candidates");
assert.equal(first.ledger.events.length,first.newObservations+first.newSetups);
assert.equal(first.performance.shortOutcomesMeasured,0);
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
console.log("PASS ONE GLOBAL prospective worldwide research: immutable sessions, no backfill, positive/negative outcomes, stale safety, zero PAPER/Directa");
