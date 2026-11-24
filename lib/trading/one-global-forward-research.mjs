/**
 * FENICE ONE GLOBAL: append-only FORWARD RESEARCH observations.
 * A research setup is NOT an order, a fill, a win probability or Phase 9 credit.
 * Yahoo daily chart buckets are not execution-grade prices or independently
 * certified exchange-close timestamps. Reported gains/losses are local-currency
 * sampled changes (no brokerage costs/FX). No network, keys or broker calls.
 */
import {createHash} from "node:crypto";
import {worldTacticalResearchRadar} from "../intelligence/one-global-tactical-watchlist.mjs";

import {firstAfter,summarizeForwardDecisions} from "../intelligence/one-global-forward-diagnostics.mjs";
import {researchStages} from "../intelligence/one-global-emerging-research.mjs";

const DAY=86400000;
const MODE="ONE_GLOBAL_FORWARD_RESEARCH_ONLY";
const COMPLETION_RULE="EXCHANGE_LOCAL_DAY_ELAPSED_OR_PROVIDER_REGULAR_SESSION_END_PLUS_20M";
const iso=value=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
  const t=Date.parse(value);
  return Number.isFinite(t)&&new Date(t).toISOString()===value?t:null;
};
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeKey=value=>typeof value==="string"&&/^(?:[A-Z0-9]{4}|UNVERIFIED):[A-Z0-9._-]{1,24}$/.test(value);
const validRegime=value=>typeof value==="string"&&/^[A-Z][A-Z _-]{0,39}$/.test(value);
const round=value=>Math.round(value*10000)/10000;
const isNum=value=>typeof value==="number"&&Number.isFinite(value);
const sourceKey=(symbol,mic)=>String(mic||"UNVERIFIED")+":"+symbol;
const empty=()=>({
  version:1,mode:MODE,startedAt:null,events:[],lastHash:"GENESIS",
  researchOnly:true,sourceDataExecutable:false,paperEligible:false,
  phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
function verifyEvent(event,previous,known,lastSeen){
  const {sha256,...payload}=event||{};
  if(!event||!Number.isSafeInteger(event.seq)||event.seq!==previous.seq+1
    ||event.prevHash!==previous.lastHash||sha256!==digest(payload)
    ||!safeKey(event.key)||iso(event.recordedAt)===null
    ||iso(event.recordedAt)<previous.recordedAt
    ||iso(event.barBucketAt)===null||iso(event.barBucketAt)>iso(event.recordedAt)
    ||event.researchOnly!==true||event.paperEligible!==false
    ||event.liveTradingAllowed!==false||event.brokerConnectivityAllowed!==false)
    throw Error("FORWARD_RESEARCH_EVENT_CHAIN_INVALID");
  if(event.kind==="BAR_OBSERVATION"){
    if(!isNum(event.close)||event.close<=0||event.close>10**8
      ||!/^[A-Z]{3}$/.test(event.currency||"")
      ||typeof event.sourceSnapshotHash!=="string"
      ||!/^[a-f0-9]{64}$/.test(event.sourceSnapshotHash)
      ||event.timestampSemantics!=="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE")
      throw Error("FORWARD_RESEARCH_PRICE_PROVENANCE_INVALID");
    const last=lastSeen.get(event.key);
    if(last!==undefined&&iso(event.barBucketAt)<=iso(last))
      throw Error("FORWARD_RESEARCH_DUPLICATED_OR_BACKDATED_BAR");
    lastSeen.set(event.key,event.barBucketAt);
    // Older hash-chained observations are retained unchanged but cannot be
    // promoted to verified prospective outcomes: they lack EOD evidence.
    if(event.candleCompletionPolicy!==undefined&&
      (event.candleCompletionPolicy!==COMPLETION_RULE
       ||event.independentExchangeCloseCertified!==false))
      throw Error("FORWARD_RESEARCH_COMPLETION_PROVENANCE_INVALID");
    if(event.screen!==undefined){
      const screen=event.screen;
      if(!screen||!["WATCHLIST","COMPARISON"].includes(screen.selection)
        ||(screen.stage!==null&&!researchStages.includes(screen.stage))
        ||(screen.regime!==null&&!validRegime(screen.regime)))
        throw Error("FORWARD_RESEARCH_SCREEN_INVALID");
    }
    known.set(event.sha256,event);
  }else if(event.kind==="TACTICAL_RESEARCH_SETUP"){
    if(typeof event.observationHash!=="string"||!known.has(event.observationHash)
      ||known.get(event.observationHash).key!==event.key
      ||known.get(event.observationHash).barBucketAt!==event.barBucketAt
      ||event.recordedAt!==known.get(event.observationHash).recordedAt
      ||!Number.isInteger(event.shortScore)||event.shortScore<0||event.shortScore>100
      ||!Number.isInteger(event.mediumScore)||event.mediumScore<0||event.mediumScore>100
      ||!["MOMENTUM_WATCH","NEEDS_CONFIRMATION","CAUTION_REVIEW"].includes(event.shortAttention)
      ||!["TREND_WATCH","NEEDS_CONFIRMATION","CAUTION_REVIEW"].includes(event.mediumAttention))
      throw Error("FORWARD_RESEARCH_SETUP_INVALID");
  }else throw Error("FORWARD_RESEARCH_EVENT_TYPE_INVALID");
}
export function replayWorldForwardResearchLedger(ledger){
  if(!ledger||ledger.version!==1||ledger.mode!==MODE
    ||ledger.researchOnly!==true||ledger.sourceDataExecutable!==false
    ||ledger.paperEligible!==false||ledger.phase9Credit!==0
    ||ledger.liveTradingAllowed!==false||ledger.brokerConnectivityAllowed!==false
    ||!Array.isArray(ledger.events)||ledger.events.length>150000
    ||(ledger.startedAt!==null&&iso(ledger.startedAt)===null))
    throw Error("FORWARD_RESEARCH_LEDGER_SCHEMA_INVALID");
  if(ledger.startedAt===null&&ledger.events.length)
    throw Error("FORWARD_RESEARCH_CAMPAIGN_NOT_STARTED");
  const known=new Map(),lastSeen=new Map();
  let previous={seq:0,lastHash:"GENESIS",recordedAt:ledger.startedAt||"1970-01-01T00:00:00.000Z"};
  for(const event of ledger.events){
    verifyEvent(event,previous,known,lastSeen);
    if(iso(event.recordedAt)<iso(ledger.startedAt))
      throw Error("FORWARD_RESEARCH_PRESTART_EVENT");
    previous={seq:event.seq,lastHash:event.sha256,recordedAt:event.recordedAt};
  }
  if(ledger.lastHash!==previous.lastHash)
    throw Error("FORWARD_RESEARCH_LEDGER_TIP_INVALID");
  return {valid:true,observations:known.size,setups:ledger.events.length-known.size,
    lastSeen,known};
}
function append(ledger,kind,fields){
  const prior=ledger.events.at(-1);
  const payload={
    seq:ledger.events.length+1,prevHash:prior?.sha256||"GENESIS",
    kind,...fields,researchOnly:true,paperEligible:false,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
  ledger.events.push({...payload,sha256:digest(payload)});
  ledger.lastHash=ledger.events.at(-1).sha256;
}
function observedAsset(asset,now,asOf){
  const technical=asset?.technical;
  const bucket=iso(technical?.observedAt);
  if(bucket===null||bucket>now||now-bucket>5*DAY
    ||bucket>asOf||!isNum(asset.price)||asset.price<=0||asset.price>10**8
    ||!(/^[A-Z]{3}$/).test(asset.currency||"")
    ||technical.timestampSemantics!=="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
    ||technical.dailyBarCompletion?.status!=="RESEARCH_SESSION_COMPLETED"
    ||technical.dailyBarCompletion?.eligibilityRule!==COMPLETION_RULE
    ||technical.dailyBarCompletion?.independentExchangeCloseCertified!==false
    ||typeof technical.source!=="string"
    ||!technical.source.startsWith("Yahoo Finance chart")
    ||!isNum(technical.scores?.dataCompleteness)
    ||technical.scores.dataCompleteness<75)return null;
  const key=sourceKey(asset.symbol,technical.exchangeMic);
  if(!safeKey(key))return null;
  return {key,barBucketAt:technical.observedAt,close:round(asset.price),
    currency:asset.currency,
    candleCompletionPolicy:COMPLETION_RULE,independentExchangeCloseCertified:false,
    sourceSnapshotHash:digest({
      terminalAsOf:new Date(asOf).toISOString(),key,barBucketAt:technical.observedAt,
      close:round(asset.price),currency:asset.currency,
      timestampSemantics:technical.timestampSemantics,
    })};
}
export function summarizeWorldForwardResearchLedger(ledger,{asOf}={}){
  const {known}=replayWorldForwardResearchLedger(ledger);
  if(asOf!==undefined&&iso(asOf)===null)throw Error("FORWARD_RESEARCH_ASOF_INVALID");
  const events=asOf===undefined?ledger.events:ledger.events.filter(e=>e.recordedAt<=asOf);
  const observations=new Map(),setups=[],decisions=[];
  for(const event of events){
    if(event.kind==="TACTICAL_RESEARCH_SETUP"){
      setups.push(event);
      const ref=known.get(event.observationHash);
      if(ref.candleCompletionPolicy===COMPLETION_RULE)decisions.push({key:event.key,
        at:event.recordedAt,currency:ref.currency,selected:true,short:event.shortAttention,
        medium:event.mediumAttention,stage:ref.screen?.stage,regime:ref.screen?.regime});
      continue;
    }
    if(event.candleCompletionPolicy!==COMPLETION_RULE)continue;
    if(!observations.has(event.key))observations.set(event.key,new Map());
    const currencies=observations.get(event.key);
    if(!currencies.has(event.currency))currencies.set(event.currency,[]);
    currencies.get(event.currency).push(event);
    if(event.screen?.selection==="COMPARISON")decisions.push({key:event.key,
      at:event.recordedAt,currency:event.currency,selected:false,stage:event.screen.stage,regime:event.screen.regime});
  }
  const individual=[];
  const byShortAttention={};
  for(const s of setups){
    const ref=known.get(s.observationHash);
    const sourceBarCompletionGated=ref.candleCompletionPolicy===COMPLETION_RULE;
    const bars=observations.get(s.key)?.get(ref.currency)??[];
    const next=firstAfter(bars,"recordedAt",s.recordedAt);
    const compute=after=>{
      const latest=bars[next+after-1];
      if(!sourceBarCompletionGated||!latest)return null;
      return {
        observedLaterBars:after,atBarBucket:latest.barBucketAt,
        sampledLocalCurrencyChangePercent:round((latest.close/ref.close-1)*100),
        // Does NOT infer missing sessions from a gap in snapshots.
        completeExchangeSessionHistoryCertified:false,
        feesAndFxIncluded:false,
      };
    };
    const shortAfter2ObservedBars=compute(2);
    if(shortAfter2ObservedBars){
      const counts=byShortAttention[s.shortAttention]??={up:0,down:0,flat:0};
      const change=shortAfter2ObservedBars.sampledLocalCurrencyChangePercent;
      counts[change>0?"up":change<0?"down":"flat"]++;
    }
    individual.push({key:s.key,recordedAt:s.recordedAt,sourceBarBucket:s.barBucketAt,
      shortAttention:s.shortAttention,mediumAttention:s.mediumAttention,
      entryCandleCompletionGated:sourceBarCompletionGated,
      legacyEntryUnverified:!sourceBarCompletionGated,
      shortAfter2ObservedBars,shortAfter10ObservedBars:compute(10),
      mediumAfter40ObservedBars:compute(40),
      researchOnly:true,certifiedStrategyTrade:false});
  }
  const complete=individual.filter(x=>x.shortAfter2ObservedBars!==null);
  return {setups:individual.length,observations:events.length-setups.length,
    lastObservationAt:events.at(-1)?.recordedAt??null, byShortAttention,
    pointInTime:summarizeForwardDecisions(decisions,observations),
    completionGatedResearchSetups:individual.filter(x=>x.entryCandleCompletionGated).length,
    legacyCompletionUnverifiedSetups:individual.filter(x=>x.legacyEntryUnverified).length,
    shortOutcomesMeasured:complete.length,
    shortPositive:complete.filter(x=>x.shortAfter2ObservedBars.sampledLocalCurrencyChangePercent>0).length,
    shortNegative:complete.filter(x=>x.shortAfter2ObservedBars.sampledLocalCurrencyChangePercent<0).length,
    shortFlat:complete.filter(x=>x.shortAfter2ObservedBars.sampledLocalCurrencyChangePercent===0).length,
    mediumOutcomesMeasured:individual.filter(x=>x.mediumAfter40ObservedBars!==null).length,
    sampleLimitations:"Only subsequently captured, EOD-gated Yahoo research candle buckets can be scored; pre-gate legacy setups are retained but NOT scored. Exchange-verified closing quotes, full sessions, FX and brokerage fees remain unavailable.",
    results:individual.slice(-40),paperFills:0,phase9Credit:0,liveTradingAllowed:false};
}
export function advanceWorldForwardResearchLedger({previousLedger,terminal,nowIso}){
  const now=iso(nowIso),asOf=iso(terminal?.generatedAt);
  if(now===null||asOf===null||!Array.isArray(terminal?.assets))
    throw Error("FORWARD_RESEARCH_INPUT_INVALID");
  const ledger=structuredClone(previousLedger||empty());
  const existing=replayWorldForwardResearchLedger(ledger);
  const radar=worldTacticalResearchRadar({terminal,nowIso});
  // Only process newly collected snapshots. A stale report NEVER creates
  // a fresh virtual observation by merely updating the wall clock.
  if(radar.staleSnapshot||asOf>now||now-asOf>8*3600000)
    return {ledger,newObservations:0,newSetups:0,
      blocked:["FRESH_WORLD_TERMINAL_REQUIRED"],
      performance:summarizeWorldForwardResearchLedger(ledger)};
  if(!ledger.startedAt)ledger.startedAt=nowIso;
  const active=new Set(ledger.events.filter(x=>x.kind==="TACTICAL_RESEARCH_SETUP"||x.screen).map(x=>x.key));
  const screened=new Map(radar.screenedResearch.map(row=>[sourceKey(row.symbol,row.venueMic),row]));
  const regime=validRegime(terminal.marketRegime)?terminal.marketRegime:null;
  const setups=new Map(radar.balancedGlobalWatchlist.map(row=>
    [sourceKey(row.symbol,row.venueMic),row]));
  const rows=terminal.assets.map(a=>observedAsset(a,now,asOf)).filter(Boolean)
    .filter(a=>screened.has(a.key)||active.has(a.key))
    .sort((a,b)=>a.key.localeCompare(b.key));
  let newObservations=0,newSetups=0;
  const latest=existing.lastSeen;
  for(const row of rows){
    if(latest.has(row.key)&&iso(row.barBucketAt)<=iso(latest.get(row.key)))
      continue;
    // Prevent same-run backdating of the first captured bar. The setup
    // itself is recorded NOW, so only later observations count as outcome.
    if(now-iso(row.barBucketAt)>3*DAY)continue;
    const candidate=screened.get(row.key);
    const screen=candidate?{selection:setups.has(row.key)?"WATCHLIST":"COMPARISON",
      stage:candidate.stage,regime}:null;
    append(ledger,"BAR_OBSERVATION",{...(screen?{screen}:{}),key:row.key,recordedAt:nowIso,
      barBucketAt:row.barBucketAt,close:row.close,currency:row.currency,
      sourceSnapshotHash:row.sourceSnapshotHash,
      timestampSemantics:"DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE",
      candleCompletionPolicy:row.candleCompletionPolicy,
      independentExchangeCloseCertified:false});
    newObservations++;
    const research=setups.get(row.key);
    if(research){
      append(ledger,"TACTICAL_RESEARCH_SETUP",{
        key:row.key,recordedAt:nowIso,barBucketAt:row.barBucketAt,
        observationHash:ledger.events.at(-1).sha256,
        shortScore:research.shortTechnicalScore,
        mediumScore:research.mediumTechnicalScore,
        shortAttention:research.shortAttention,mediumAttention:research.mediumAttention,
      });
      newSetups++;
    }
  }
  replayWorldForwardResearchLedger(ledger);
  return {ledger,newObservations,newSetups,blocked:[],
    performance:summarizeWorldForwardResearchLedger(ledger)};
}
export function newWorldForwardResearchLedger(){return empty();}
