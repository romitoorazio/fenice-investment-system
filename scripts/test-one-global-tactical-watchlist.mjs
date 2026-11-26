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

const sample=structuredClone(terminal);
const italian=sample.assets.find(a=>a.symbol==="ENEL");
assert(italian,"Existing Italian listing fixture required");
const qAt=new Date(Date.parse(sample.generatedAt)-60000).toISOString();
italian.technical.worldIntradayResearchQuote={
  price:italian.price*1.03,currency:italian.currency,exchangeMic:italian.technical.exchangeMic,
  observedAt:qAt,evidenceType:"YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY",feedCount:1,
  exactMicExecutionVerified:false,executionEligible:false,paperCertificationEligible:false,
  brokerSubmissionAllowed:false,liveTradingAllowed:false,
};
const updated=worldTacticalResearchRadar({terminal:sample,nowIso:at});
const alert=updated.intradayAttention.find(a=>a.symbol==="ENEL");
assert(alert);
assert(alert.codes.includes("ABOVE_DAILY_REFERENCE_2PCT"));
assert.equal(alert.breakoutConfirmed,false);
assert.equal(alert.volumeConfirmed,false);
assert.equal(alert.paperEligible,false);
assert.equal(Object.hasOwn(alert,"price"),false);
assert.deepEqual(updated.balancedGlobalWatchlist,result.balancedGlobalWatchlist);
assert.deepEqual(updated.topAcrossAllVenues,result.topAcrossAllVenues);
const staleQuote=structuredClone(sample);
staleQuote.assets.find(a=>a.symbol==="ENEL").technical.worldIntradayResearchQuote.observedAt=new Date(Date.parse(at)-31*60000).toISOString();
assert(!worldTacticalResearchRadar({terminal:staleQuote,nowIso:at}).intradayAttention.some(a=>a.symbol==="ENEL"));
for(const patch of [{currency:"USD"},{executionEligible:true},{feedCount:2},{observedAt:at}]){
  const bad=structuredClone(sample);
  Object.assign(bad.assets.find(a=>a.symbol==="ENEL").technical.worldIntradayResearchQuote,patch);
  assert(!worldTacticalResearchRadar({terminal:bad,nowIso:at}).intradayAttention.some(a=>a.symbol==="ENEL"));
}
console.log("PASS intraday attention is fresh, isolated, non-executable, and never alters daily ranking");

const {completedBarResearch}=await import("../lib/intelligence/one-global-emerging-research.mjs");
const candles=Array.from({length:21},(_,i)=>({timestamp:1_700_000_000+i*86400,adjustedResearchClose:100,volume:100}));
candles[0].adjustedResearchClose=105;
candles[20].adjustedResearchClose=104;
candles[20].volume=200;
assert.equal(completedBarResearch(candles).stage,"APPROACHING_HIGH");
candles[20].adjustedResearchClose=106;
assert.equal(completedBarResearch(candles).stage,"CLOSE_BREAKOUT");
assert.equal(completedBarResearch(candles).unusualVolume,true);
delete candles[10].volume;
assert.equal(completedBarResearch(candles).unusualVolume,null);
assert.equal(completedBarResearch(candles,{split:{date:candles[18].timestamp}}),null);
assert.equal(completedBarResearch(candles.slice(1)),null);
const badDaily=structuredClone(sample);
badDaily.assets.find(a=>a.symbol==="ENEL").technical.dailyBarCompletion.status="UNSETTLED";
assert(!worldTacticalResearchRadar({terminal:badDaily,nowIso:at}).screenedResearch.some(x=>x.symbol==="ENEL"));
const afterSnapshot=structuredClone(sample);
afterSnapshot.assets.find(a=>a.symbol==="ENEL").technical.observedAt=at;
assert(!worldTacticalResearchRadar({terminal:afterSnapshot,nowIso:at}).screenedResearch.some(x=>x.symbol==="ENEL"));

// A recovery can gain momentum on a completed bar before it nears the prior high.
const recoveryCloses = [120, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 92, 93, 94, 95, 97];
const recovery = recoveryCloses.map((close, i) => ({
  timestamp: candles[i].timestamp, adjustedResearchClose: close,
  volume: i === 20 ? 300 : i >= 16 ? 100 : 10,
}));
assert.equal(completedBarResearch(recovery).stage, "VOLUME_BACKED_ACCELERATION");
const withLast = patch => [...recovery.slice(0,-1), {...recovery.at(-1), ...patch}];
assert.equal(completedBarResearch(withLast({volume:1})).stage, "NO_SETUP");
assert.equal(completedBarResearch(withLast({volume:null})).stage, "NO_SETUP");
assert.equal(completedBarResearch(withLast({adjustedResearchClose:94.5})).stage, "NO_SETUP");
assert.equal(completedBarResearch(withLast({adjustedResearchClose:119})).stage, "APPROACHING_HIGH");
assert.equal(completedBarResearch(withLast({adjustedResearchClose:121})).stage, "CLOSE_BREAKOUT");
const distribution = recovery.map((r,i)=>({...r, volume:i===20 ? 300 : i<16 ? 100 : 1}));
assert.equal(completedBarResearch(distribution).stage, "NO_SETUP");
assert.equal(completedBarResearch(recovery,{split:{date:recovery[12].timestamp}}),null);

// Synthetic comparable peers: exact same completed bar and quote currency,
// at least three other distinct peers. The old watchlist is not reranked.
const peers=structuredClone(terminal);
const base=peers.assets.find(a=>a.symbol==="ENEL");
const bucket=new Date(Date.parse(peers.generatedAt)-86400000).toISOString();
peers.assets=[12,2,0,-4].map((ret,i)=>{
  const a=structuredClone(base);
  a.symbol="PEER"+i;a.currency="EUR";
  a.technical.exchangeMic="XMIL";a.technical.observedAt=bucket;
  a.technical.returns.oneMonthPercent=ret;
  a.technical.completedBarResearch={stage:"NO_SETUP",accelerating:i===0,barBucketAt:bucket};
  return a;
});
const peerResult=()=>worldTacticalResearchRadar({terminal:peers,nowIso:at});
const classification=()=>Object.fromEntries(peerResult().screenedResearch.map(r=>[r.symbol,r.relativeStrength]));
assert.deepEqual(classification(),{PEER0:"LEADER_ACCELERATING",PEER1:"OTHER",PEER2:"OTHER",PEER3:"OTHER"});
const ranks=peerResult().balancedGlobalWatchlist.map(r=>r.symbol);
peers.assets[0].technical.completedBarResearch.accelerating=false;
assert.equal(classification().PEER0,"LEADER");
assert.deepEqual(peerResult().balancedGlobalWatchlist.map(r=>r.symbol),ranks);
peers.assets[0].technical.completedBarResearch.accelerating=true;
peers.assets[0].technical.completedBarResearch.barBucketAt=new Date(Date.parse(bucket)-86400000).toISOString();
assert.equal(classification().PEER0,"LEADER","Stale acceleration may not qualify");
peers.assets[3].currency="USD";
assert(Object.values(classification()).every(v=>v===null),"Mixed currencies or insufficient peers abstain");
peers.assets[3].currency="EUR";
peers.assets[3].technical.observedAt=new Date(Date.parse(bucket)-86400000).toISOString();
assert(Object.values(classification()).every(v=>v===null),"Different daily buckets abstain");
peers.assets[3].technical.observedAt=bucket;
peers.assets.push(structuredClone(peers.assets[3]));
assert(Object.values(classification()).every(v=>v===null),"Duplicates cannot inflate peer count");
assert(!JSON.stringify(peerResult()).includes("peerMonthReturn"));
console.log("PASS prospective peer-strength research: comparable distinct peers, abstention, no reranking or raw input exposure");
