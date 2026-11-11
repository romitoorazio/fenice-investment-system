/**
 * Read-only FENICE ONE GLOBAL web view of today's worldwide tactical research.
 *
 * No OHLC, last trade, bid, ask, target allocations, forecasts, order creation,
 * strategy PAPER credit or broker permissions are exposed. Research inputs
 * must be valid and the immutable forward-observation hash chain must replay.
 */
import {worldTacticalResearchRadar} from "../intelligence/one-global-tactical-watchlist.mjs";
import {summarizeWorldForwardResearchLedger,replayWorldForwardResearchLedger}
 from "../trading/one-global-forward-research.mjs";

const attentionLabels=Object.freeze({
 MOMENTUM_WATCH:"Momentum: approfondire",
 NEEDS_CONFIRMATION:"Conferme ancora mancanti",
 CAUTION_REVIEW:"Rischio elevato: cautela",
 TREND_WATCH:"Trend da approfondire",
});
const regionLabels=Object.freeze({
 europe:"Europa","asia-pacific":"Asia",
 "latin-america-caribbean":"America Latina","middle-east-africa":"Africa e Medio Oriente",
 oceania:"Oceania","north-america":"Nord America",
 unclassified:"Borsa non classificata",
});
const evidenceLabels=Object.freeze({
 ABOVE_20D_AVERAGE:"Sopra la media storica a 20 sedute",
 ABOVE_50D_AVERAGE:"Sopra la media storica a 50 sedute",
 "20D_ABOVE_50D":"Media a 20 sedute sopra quella a 50",
 ONE_MONTH_MOMENTUM_POSITIVE:"Momentum a un mese positivo",
 THREE_MONTH_MOMENTUM_POSITIVE:"Momentum a tre mesi positivo",
 RSI_BALANCED:"RSI nell'intervallo di studio 45–70",
 RSI_OVERBOUGHT_CAUTION:"RSI elevato: cautela",
 HIGH_RISK_CAUTION:"Indicatore di rischio elevato",
});
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))
 &&new Date(Date.parse(x)).toISOString()===x;

export function buildOneGlobalPublicTacticalView({terminal,ledger,nowIso}){
 if(!iso(nowIso)||!terminal||terminal.worldResearch?.brokerOrdersAllowed!==false
   ||terminal.worldResearch?.paperEligible!==0
   ||terminal.worldResearch?.verifiedExecutableQuotes!==0
   ||!Array.isArray(terminal.assets)||terminal.assets.length>1000
   ||terminal.assets.some(x=>x.globalVenueResearchOnly&&
    (x.targetWeightPercent>0||x.targetAmountEuro>0)))
  throw Error("ONE_GLOBAL_UI_SOURCE_RIGHTS_OR_CLOCK_INVALID");
 replayWorldForwardResearchLedger(ledger);
 const radar=worldTacticalResearchRadar({terminal,nowIso});
 if(radar.policy.liveTradingAllowed!==false||radar.policy.paperExecutionAllowed!==false
   ||radar.policy.noGeneratedBuySignals!==true||radar.policy.usesDailyBarsOnly!==true)
  throw Error("ONE_GLOBAL_UI_RADAR_RIGHTS_INVALID");
 const recorded=summarizeWorldForwardResearchLedger(ledger);
 if(recorded.phase9Credit!==0||recorded.paperFills!==0
   ||recorded.liveTradingAllowed!==false)
  throw Error("ONE_GLOBAL_UI_RESEARCH_PAPER_ESCALATION");
 const rows=radar.staleSnapshot?[]:radar.balancedGlobalWatchlist.map(x=>({
  key:(x.venueMic||"UNKNOWN")+":"+x.symbol,
  symbol:x.symbol,name:x.name,venueMic:x.venueMic,
  region:regionLabels[x.venueRegion]||regionLabels.unclassified,
  historicalBarBucketAt:x.historicalBarBucketAt,
  shortScore:x.shortTechnicalScore,mediumScore:x.mediumTechnicalScore,
  shortAttention:attentionLabels[x.shortAttention]||"Da verificare",
  mediumAttention:attentionLabels[x.mediumAttention]||"Da verificare",
  shortAttentionCode:x.shortAttention,mediumAttentionCode:x.mediumAttention,
  evidence:x.codes.filter(k=>Object.hasOwn(evidenceLabels,k))
   .map(k=>evidenceLabels[k]).slice(0,4),
  dataType:"HISTORICAL_DAILY_CANDLE_RESEARCH_ONLY",
  isBuySignal:false,expectedProfitEuro:null,forecastReturnPercent:null,
  lastTradedPrice:null,brokerOrderAllowed:false,paperEligible:false,
 }));
 return {
  mode:"ONE_GLOBAL_PUBLIC_TACTICAL_RESEARCH_ONLY",
  generatedAt:nowIso,
  terminalAsOf:radar.terminalAsOf,
  lastForwardObservationAt:ledger.events.at(-1)?.recordedAt??null,
  stale:radar.staleSnapshot,
  screenSize:radar.universeReviewed,
  researchEligible:radar.equityResearchRows,
  watchlist:rows,
  momentumCount:rows.filter(x=>x.shortAttentionCode==="MOMENTUM_WATCH").length,
  trendCount:rows.filter(x=>x.mediumAttentionCode==="TREND_WATCH").length,
  forwardObservations:recorded.observations,
  forwardSignals:recorded.setups,
  measuredAfterTwoNewDailySnapshots:recorded.shortOutcomesMeasured,
  measuredPositive:recorded.shortPositive,
  measuredNegative:recorded.shortNegative,
  measuredUnchanged:recorded.shortFlat,
  scope:"Only captured subsequent historical daily candle buckets, not missing sessions.",
  policy:{researchOnly:true,usesHistoricalDailyCandles:true,
   noLiveMarketPricePublished:true,notInvestmentRecommendation:true,
   noWinProbabilityOrFutureReturnForecast:true,phase9Credit:0,
   paperExecutionAllowed:false,liveTradingAllowed:false,
   brokerConnectivityAllowed:false},
 };
}
