import assert from "node:assert/strict";
import { runWorldV7DailyHistoricalReplay, summarizeWorldV7DailyHistoricalReplay } from "../lib/market/world-v7-daily-historical-replay.mjs";

const asOfDate="2026-11-13";
const days=[];
for(let d=Date.parse("2026-09-01T00:00:00Z");days.length<53;d+=86400000){
  const dt=new Date(d),w=dt.getUTCDay();
  if(w!==0&&w!==6)days.push(dt.toISOString().slice(0,10));
}
const bars=(base=10)=>days.map((date,i)=>{
  const p=base+(i<27?i*.35:27*.35-(i-27)*.55);
  return {date,open:p,high:p+.5,low:p-.5,close:p+.1,volume:20000};
});
const italy=()=>({venue:"XMIL",ticker:"ENEL",currency:"EUR",region:"europe",provider:"alpha-vantage",bars:bars()});
const germany=()=>({venue:"XETR",ticker:"SIE",currency:"EUR",region:"europe",provider:"alpha-vantage",bars:bars(160)});
const japan=()=>({venue:"XTKS",ticker:"7203",currency:"JPY",region:"asia-pacific",provider:"j-quants",
  bars:bars(2500),fxRates:days.map(date=>({date,rateToEuro:.006}))});
const replay=runWorldV7DailyHistoricalReplay({histories:[italy(),germany(),japan()],asOfDate});
assert.equal(replay.liveTradingAllowed,false);
assert.equal(replay.realtimePaperEligible,false);
assert.equal(replay.certifiedPaperFills,0);
assert.equal(replay.modifiesV6,false);
assert.equal(replay.originalCashEuro,1000);
assert.equal(replay.sources.length,3);
assert(replay.buys>=1,"uptrend should produce historical BUY");
assert(replay.sells>=1,"downtrend should produce historical SELL");
assert(replay.historicalTrades.every(t=>t.signalDate<t.date),"no same-session open lookahead");
assert(replay.historicalTrades.every(t=>t.simulatedHistorical===true));
assert(replay.estimatedFeesEuro>=2);
assert(Number.isFinite(replay.estimatedNetReturnPct));
assert(replay.discarded.some(x=>x.venue==="XETR"),"unaffordable whole-share SIE must be excluded");
assert.deepEqual(runWorldV7DailyHistoricalReplay({histories:[japan(),germany(),italy()],asOfDate}).historicalTrades,
  replay.historicalTrades,"input order cannot change deterministic historical replay");
const safe=summarizeWorldV7DailyHistoricalReplay(replay);
assert.equal(safe.forwardVerifiedPaperFills,0);
assert.equal(safe.historicalResearchTransactions,replay.transactions);
assert(!JSON.stringify(safe).includes("quantity"));
assert(!JSON.stringify(safe).includes("notionalEuro"));
assert(!JSON.stringify(safe).includes("pendingPositions"));
assert.equal(safe.marketDataRightsCertified,false);
const noFx=runWorldV7DailyHistoricalReplay({histories:[{...japan(),fxRates:[]}],asOfDate});
assert.equal(noFx.transactions,0);
assert.equal(noFx.blocked[0].status,"PRIOR_DAY_FX_REQUIRED");
const ambiguous=runWorldV7DailyHistoricalReplay({histories:[italy(),italy()],asOfDate});
assert.equal(ambiguous.blocked[0].status,"DUPLICATE_VENUE");
const unknown=runWorldV7DailyHistoricalReplay({histories:[{...italy(),currency:"USD"}],asOfDate});
assert.equal(unknown.sources.length,0);
assert.equal(unknown.transactions,0);
const fakeFuture=italy();fakeFuture.bars.push({date:"2026-11-22",open:1,high:1,low:1,close:1,volume:1});
assert.equal(runWorldV7DailyHistoricalReplay({histories:[fakeFuture],asOfDate}).blocked[0].status,
  "INVALID_OR_UNSORTED_DAILY_BARS");
const badOhlc=italy();badOhlc.bars[8].high=1;
assert.equal(runWorldV7DailyHistoricalReplay({histories:[badOhlc],asOfDate}).transactions,0);
const duplicateBar=italy();duplicateBar.bars.splice(10,0,{...duplicateBar.bars[9]});
assert.equal(runWorldV7DailyHistoricalReplay({histories:[duplicateBar],asOfDate}).transactions,0);
// Today's incomplete candle must NEVER create or reverse a prior-day signal.
const today=italy();today.bars.push({date:asOfDate,open:999,high:2000,low:1,close:1999,volume:1});
assert.deepEqual(runWorldV7DailyHistoricalReplay({histories:[today],asOfDate}).historicalTrades,
  runWorldV7DailyHistoricalReplay({histories:[italy()],asOfDate}).historicalTrades);
assert.throws(()=>runWorldV7DailyHistoricalReplay({asOfDate:"not-a-date"}),/INVALID_WORLD_V7/);
console.log("World V7 EOD historical replay causal BUY/SELL, FX, identity, no future bars, fees and isolation: PASS");
