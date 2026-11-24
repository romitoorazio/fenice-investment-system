import {researchStages} from './one-global-emerging-research.mjs';
/**
 * ONE GLOBAL — worldwide technical-attention radar from completed daily bars.
 * This is a RESEARCH QUEUE, NOT a broker/PAPER recommendation or a forecast.
 * Only derived indicators/qualitative codes leave this module: no licensed
 * OHLC, last trade, provider keys, order instructions or profitability claims.
 */
const DAY=86400000;
const MARKET_REGION={
  XMIL:"europe",XETR:"europe",XPAR:"europe",XSWX:"europe",XLON:"europe",XTSE:"north-america",
  XTKS:"asia-pacific",XSHG:"asia-pacific",XNSE:"asia-pacific",
  XHKG:"asia-pacific",XASX:"oceania",BVMF:"latin-america-caribbean",
  XJSE:"middle-east-africa",
};
const num=x=>typeof x==="number"&&Number.isFinite(x);
const clamp=x=>Math.max(0,Math.min(100,x));
const time=x=>{
  if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))return null;
  const t=Date.parse(x);
  return Number.isFinite(t)&&new Date(t).toISOString()===x?t:null;
};
const nonEquity=new Set(["ETF","Obbligazioni","Materie prime","Criptovaluta"]);
const INTRADAY_NOTE="A daily candle bucket is not a last-trade timestamp or an executable quote.";
function evaluate(asset,at,snapshotAt){
  const t=asset?.technical;
  const observed=time(t?.observedAt);
  if(!t||observed===null||observed>snapshotAt||at-observed>5*DAY
    ||t.dailyBarCompletion?.status!=="RESEARCH_SESSION_COMPLETED"
    ||t.timestampSemantics!=="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
    ||typeof t.source!=="string"||!t.source.startsWith("Yahoo Finance chart")
    ||!num(t.scores?.dataCompleteness)||t.scores.dataCompleteness<75
    ||!num(asset.price)||asset.price<=0
    ||!num(asset.riskScore)||asset.riskScore<0||asset.riskScore>100
    ||!num(t.indicators?.rsi14)||!num(t.indicators?.sma20)
    ||!num(t.indicators?.sma50)||!num(t.returns?.oneMonthPercent)
    ||!num(t.returns?.threeMonthPercent))return null;
  const price=asset.price,ind=t.indicators,ret=t.returns,risk=asset.riskScore;
  const above20=price>ind.sma20,above50=price>ind.sma50;
  const maRising=ind.sma20>ind.sma50;
  const strongMonth=ret.oneMonthPercent>2;
  const strongQuarter=ret.threeMonthPercent>3;
  const rsiBalanced=ind.rsi14>=45&&ind.rsi14<=70;
  const overbought=ind.rsi14>75;
  const highRisk=risk>70;
  const technicalTrend=Number(t.scores?.trend)||0;
  const monthScore=clamp(25+(above20?17:0)+(strongMonth?16:0)
    +(technicalTrend>=65?14:0)+(rsiBalanced?16:0)
    +(risk<=55?12:0)-(overbought?24:0)-(highRisk?18:0));
  const weeksScore=clamp(25+(above50?15:0)+(maRising?15:0)
    +(strongQuarter?20:0)+(strongMonth?10:0)
    +(risk<=55?15:0)-(highRisk?20:0));
  const codes=[
    above20?"ABOVE_20D_AVERAGE":"BELOW_20D_AVERAGE",
    above50?"ABOVE_50D_AVERAGE":"BELOW_50D_AVERAGE",
    maRising?"20D_ABOVE_50D":"20D_NOT_ABOVE_50D",
    strongMonth?"ONE_MONTH_MOMENTUM_POSITIVE":"ONE_MONTH_MOMENTUM_NOT_CONFIRMED",
    strongQuarter?"THREE_MONTH_MOMENTUM_POSITIVE":"THREE_MONTH_MOMENTUM_NOT_CONFIRMED",
    overbought?"RSI_OVERBOUGHT_CAUTION":rsiBalanced?"RSI_BALANCED":"RSI_OUTSIDE_BALANCED_RANGE",
    highRisk?"HIGH_RISK_CAUTION":"RISK_WITHIN_RESEARCH_SCREEN",
  ];
  const shortAttention=highRisk||overbought?"CAUTION_REVIEW"
    :monthScore>=60?"MOMENTUM_WATCH":"NEEDS_CONFIRMATION";
  const mediumAttention=highRisk?"CAUTION_REVIEW"
    :weeksScore>=60?"TREND_WATCH":"NEEDS_CONFIRMATION";
  const pattern=t.completedBarResearch;
  const stage=pattern?.barBucketAt===t.observedAt && researchStages.includes(pattern.stage)
    ? pattern.stage : null;
  if(stage && stage!=="NO_SETUP"){
    codes.unshift(stage);
    if(pattern.accelerating===true)codes.push("FIVE_BAR_ACCELERATION");
    if(pattern.unusualVolume===true)codes.push("HIGH_RELATIVE_DAILY_VOLUME");
    if(pattern.upVolumeDominant===true)codes.push("UP_VOLUME_DOMINANT");
  }
  return {symbol:asset.symbol,name:asset.name,stage,
    venueMic:typeof t.exchangeMic==="string"?t.exchangeMic:null,
    venueRegion:MARKET_REGION[t.exchangeMic]||
      (t.market==="USA"?"north-america":"unclassified"),
    historicalBarBucketAt:t.observedAt,
    technicalAttentionOnly:true,shortHorizon:"2_TO_10_TRADING_DAYS_CONTEXT",
    mediumHorizon:"2_TO_8_WEEKS_CONTEXT",
    shortTechnicalScore:Math.round(monthScore),
    mediumTechnicalScore:Math.round(weeksScore),
    shortAttention,mediumAttention,codes,
    rankScore:Math.round(.55*monthScore+.45*weeksScore),
    currentPricePublished:false,forecastReturnPercent:null,
    predictedWinProbability:null,investmentRecommendation:false,
    paperEligible:false,brokerOrderAllowed:false,liveTradingAllowed:false};
}
// Independent attention queue: does not change daily rankings or forward setups.
function intradayAttention(asset, now, snapshotAt){
  const t=asset?.technical;
  const world=t?.researchOnly===true;
  const q=world?t?.worldIntradayResearchQuote:t?.researchQuote;
  const at=time(q?.observedAt);
  const referenceAt=time(t?.observedAt);
  const expected=world?"YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY":"YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY";
  if(!q||at===null||referenceAt===null||referenceAt>=at||at-referenceAt>5*DAY||at>now||at>snapshotAt||now-at>30*60000
    ||q.evidenceType!==expected||q.feedCount!==1
    ||q.executionEligible!==false||q.paperCertificationEligible!==false
    ||q.brokerSubmissionAllowed!==false||q.liveTradingAllowed!==false
    ||!num(q.price)||q.price<=0||!num(asset.price)||asset.price<=0
    ||t.timestampSemantics!=="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
    ||t.dailyBarCompletion?.status!=="RESEARCH_SESSION_COMPLETED"
    ||!num(t.indicators?.sma20)||t.indicators.sma20<=0
    ||(world&&(q.currency!==asset.currency||q.exchangeMic!==t.exchangeMic||q.exactMicExecutionVerified!==false))
    ||(!world&&(t.market!=="USA"||asset.currency!=="USD")))return null;
  // Adjusted daily close is only a research reference, not an intraday
  // opening price; corporate actions can distort the comparison.
  const change=(q.price/asset.price-1)*100;
  const codes=[];
  if(change>=2)codes.push("ABOVE_DAILY_REFERENCE_2PCT");
  if(change<=-2)codes.push("BELOW_DAILY_REFERENCE_2PCT");
  if(asset.price<=t.indicators.sma20&&q.price>t.indicators.sma20)
    codes.push("CROSSED_ABOVE_20D_REFERENCE");
  if(!codes.length)return null;
  return {symbol:asset.symbol,venueMic:t.exchangeMic??null,observedAt:q.observedAt,
    codes,attentionOnly:true,comparisonBasis:"DAILY_ADJUSTED_REFERENCE_NOT_SESSION_OPEN",
    volumeConfirmed:false,breakoutConfirmed:false,investmentRecommendation:false,
    paperEligible:false,brokerOrderAllowed:false,liveTradingAllowed:false};
}

export function worldTacticalResearchRadar({terminal,nowIso}){
  const now=time(nowIso),observed=time(terminal?.generatedAt);
  if(now===null)throw Error("WORLD_RESEARCH_CLOCK_INVALID");
  if(!terminal||!Array.isArray(terminal.assets)||terminal.assets.length>1000)
    throw Error("WORLD_RESEARCH_INPUT_INVALID");
  const stale=observed===null||observed>now||now-observed>5*DAY;
  const eligible=stale?[]:terminal.assets.filter(a=>
    !nonEquity.has(a?.assetClass)&&typeof a?.symbol==="string")
    .map(a=>evaluate(a,now,observed)).filter(Boolean);
  const ordered=eligible.sort((a,b)=>b.rankScore-a.rankScore||
    a.venueRegion.localeCompare(b.venueRegion)||a.symbol.localeCompare(b.symbol));
  // Transparent global coverage, not a US-first ranking. Rank every genuine
  // venue on the same indicator rules, then expose the best of EACH region.
  const perRegion={};
  for(const row of ordered)(perRegion[row.venueRegion]??=[]).push(row);
  const regionOrder=["europe","asia-pacific","latin-america-caribbean",
    "middle-east-africa","oceania","north-america","unclassified"];
  const balanced=[];
  for(let layer=0;layer<4&&balanced.length<12;layer++)
    for(const region of regionOrder)if(perRegion[region]?.[layer]&&balanced.length<12)
      balanced.push(perRegion[region][layer]);
  return {
    mode:"ONE_GLOBAL_WORLD_TACTICAL_RESEARCH_ONLY",generatedAt:nowIso,
    terminalAsOf:terminal?.generatedAt??null,
    staleSnapshot:stale,universeReviewed:terminal.assets.length,
    equityResearchRows:ordered.length,globalRows:ordered.filter(x=>x.venueMic!==null).length,
    byRegion:Object.fromEntries(regionOrder.map(region=>[region,perRegion[region]?.length||0])),
    screenedResearch:ordered.map(({symbol,venueMic,stage,shortAttention,mediumAttention,codes})=>
      ({symbol,venueMic,stage,shortAttention,mediumAttention,codes})),
    topAcrossAllVenues:ordered.slice(0,12).map(({rankScore,...item})=>item),
    balancedGlobalWatchlist:balanced.map(({rankScore,...item})=>item),
    intradayAttention:stale?[]:terminal.assets.filter(a=>!nonEquity.has(a?.assetClass))
      .map(a=>intradayAttention(a,now,observed)).filter(Boolean)
      .sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||a.symbol.localeCompare(b.symbol)),
    policy:{researchOnly:true,usesDailyBarsOnly:true,intradayAttentionSeparate:true,notALiveQuote:true,
      forwardReturnPredictionsMade:false,shortHorizonNotValidated:true,
      noGeneratedBuySignals:true,phase9CertificationCredit:0,
      paperExecutionAllowed:false,brokerConnectivityAllowed:false,
      liveTradingAllowed:false},
    warning:stale?"STALE_OR_FUTURE_TERMINAL_SNAPSHOT":INTRADAY_NOTE,
  };
}
