/**
 * World V7 daily historical REPLAY — a research backtest, not realtime PAPER.
 * Never imports brokers, V6, realtime quote gates, or order interfaces.
 * A signal uses completed closes through D; an entry/exit may use ONLY D+1 open.
 * Provider identity and market-data rights are deliberately NOT certified here.
 */
import { EOD_PILOTS } from "./world-v7-eod-research.mjs";

const START_CASH = 1000;
const MAX_POSITION_EUR = START_CASH * .05;
const MAX_BARS = 600;
const MAX_GAP_DAYS = 7;
const IMPACT_BPS = 5;
const FEE_RATE = .0015;
const MIN_FEE_EUR = 1;
const dateOk = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v+"T00:00:00Z"))
  && new Date(v+"T00:00:00Z").toISOString().slice(0,10) === v;
const num = v => typeof v === "number" && Number.isFinite(v) && v > 0;
const round = v => Math.round(v * 10000) / 10000;
const gap = (a,b) => (Date.parse(b+"T00:00:00Z") - Date.parse(a+"T00:00:00Z"))/86400000;
const avg = (rows, end, length) => rows.slice(end-length,end).reduce((s,b)=>s+b.close,0)/length;

function validateHistory(entry, asOfDate) {
  const target=EOD_PILOTS[entry?.venue];
  if (!target || entry?.ticker!==target.ticker || entry?.currency!==target.currency
    || entry?.region!==target.region || typeof entry.provider!=="string"
    || !/^[a-z0-9._-]{3,40}$/i.test(entry.provider))
    return {status:"INSTRUMENT_OR_SOURCE_NOT_IDENTIFIED"};
  if (!Array.isArray(entry.bars) || entry.bars.length>MAX_BARS)
    return {status:"INVALID_DAILY_SERIES"};
  let previous="";
  const bars=[];
  for (const b of entry.bars) {
    if(!dateOk(b?.date) || b.date<=previous || b.date>asOfDate
      || ![b.open,b.high,b.low,b.close].every(num)
      || typeof b.volume!=="number" || !Number.isFinite(b.volume) || b.volume<0
      || b.high<Math.max(b.open,b.close) || b.low>Math.min(b.open,b.close)
      || b.low>b.high || (previous && gap(previous,b.date)>MAX_GAP_DAYS))
      return {status:"INVALID_OR_UNSORTED_DAILY_BARS"};
    previous=b.date;
    // The bar for asOfDate could still be open: do not include it.
    if (b.date<asOfDate) bars.push(b);
  }
  if (bars.length<22) return {status:"INSUFFICIENT_COMPLETED_BARS"};
  if(target.currency==="EUR")return {status:"READY_FOR_HISTORICAL_REPLAY",bars,fx:[]};
  if(!Array.isArray(entry.fxRates) || entry.fxRates.length===0)
    return {status:"PRIOR_DAY_FX_REQUIRED"};
  const fx=[];previous="";
  for(const x of entry.fxRates){
    if(!dateOk(x?.date) || x.date<=previous || x.date>asOfDate || !num(x.rateToEuro))
      return {status:"INVALID_OR_UNSORTED_FX"};
    previous=x.date;
    if(x.date<asOfDate)fx.push(x);
  }
  if(!fx.length)return {status:"PRIOR_DAY_FX_REQUIRED"};
  return {status:"READY_FOR_HISTORICAL_REPLAY",bars,fx};
}
function priorFx(prepared, priorDate, currency) {
  if(currency==="EUR")return 1;
  const eligible=prepared.fx.filter(x=>x.date<priorDate && gap(x.date,priorDate)<=MAX_GAP_DAYS);
  return eligible.length ? eligible.at(-1).rateToEuro : null;
}
function signal(prior, dateIndex) {
  const current5=avg(prior,dateIndex,5), current20=avg(prior,dateIndex,20);
  const preceding5=avg(prior,dateIndex-1,5);
  return current5>current20*1.005 && current5>=preceding5
    && prior[dateIndex-1].close>=current20 ? "UP" : "OUT";
}
/** All prices and results stay private to the caller; never publish raw bars. */
export function runWorldV7DailyHistoricalReplay({histories=[],asOfDate}={}) {
  if(!dateOk(asOfDate) || !Array.isArray(histories) || histories.length>3)
    throw Error("INVALID_WORLD_V7_EOD_REPLAY_INPUT");
  const seen=new Set(), sources=[], actions=[], blocked=[];
  for(const h of histories){
    const venue=String(h?.venue||"");
    if(seen.has(venue)){blocked.push({venue,status:"DUPLICATE_VENUE"});continue;}
    seen.add(venue);
    const v=validateHistory(h,asOfDate);
    if(v.status!=="READY_FOR_HISTORICAL_REPLAY"){
      blocked.push({venue,status:v.status});continue;
    }
    const pilot=EOD_PILOTS[venue];
    let missingFx=false;
    for(let i=21;i<v.bars.length;i++){
      const previous=v.bars[i-1], next=v.bars[i];
      const rate=priorFx(v,previous.date,pilot.currency);
      if(rate===null){missingFx=true;continue;}
      actions.push({venue,date:next.date,previousDate:previous.date,side:signal(v.bars,i)==="UP"?"BUY":"SELL",
        open:next.open,fxToEuro:rate});
    }
    sources.push({venue,provider:h.provider,periodStart:v.bars[0].date,
      periodEnd:v.bars.at(-1).date,bars:v.bars,fx:v.fx,currency:pilot.currency});
    if(missingFx)blocked.push({venue,status:"SOME_SESSIONS_MISSING_PRIOR_FX"});
  }
  // A fixed same-date ordering is a backtest convention, not a market-open clock.
  actions.sort((a,b)=>a.date.localeCompare(b.date)
    || (a.side==="SELL"?0:1)-(b.side==="SELL"?0:1)
    || a.venue.localeCompare(b.venue));
  let cash=START_CASH,fees=0;
  const holdings=new Map(), trades=[], discarded=[];
  for(const a of actions){
    const held=holdings.get(a.venue)||0;
    const fillUnit=a.open*a.fxToEuro*(1+(a.side==="BUY"?1:-1)*IMPACT_BPS/10000);
    if(a.side==="BUY"){
      if(held>0)continue;
      const quantity=Math.floor(Math.min(MAX_POSITION_EUR,Math.max(0,cash-MIN_FEE_EUR))/fillUnit);
      const notional=round(quantity*fillUnit);
      const fee=Math.max(MIN_FEE_EUR,round(notional*FEE_RATE));
      if(quantity<1 || round(notional+fee)>cash){
        discarded.push({venue:a.venue,date:a.date,reason:"PRICE_TOO_HIGH_OR_CASH_LIMIT"});continue;
      }
      cash=round(cash-notional-fee);fees=round(fees+fee);
      holdings.set(a.venue,quantity);
      trades.push({venue:a.venue,date:a.date,signalDate:a.previousDate,side:"BUY",
        quantity,notionalEuro:notional,feeEuro:fee,simulatedHistorical:true});
    }else if(held>0){
      const notional=round(held*fillUnit);
      const fee=Math.max(MIN_FEE_EUR,round(notional*FEE_RATE));
      cash=round(cash+notional-fee);fees=round(fees+fee);
      holdings.set(a.venue,0);
      trades.push({venue:a.venue,date:a.date,signalDate:a.previousDate,side:"SELL",
        quantity:held,notionalEuro:notional,feeEuro:fee,simulatedHistorical:true});
    }
  }
  let equity=cash,markAvailable=true;
  for(const s of sources){
    const held=holdings.get(s.venue)||0;
    if(!held)continue;
    const last=s.bars.at(-1);
    const fx=priorFx(s,last.date,s.currency);
    if(fx===null){markAvailable=false;break;}
    equity+=held*last.close*fx;
  }
  const mark=sources.length>0 && markAvailable?round(equity):null;
  return {
    version:1,mode:"WORLD_V7_HISTORICAL_REPLAY_RESEARCH_ONLY",asOfDate,
    originalCashEuro:START_CASH,closingCashEuro:cash,
    markedEquityEuro:mark,estimatedNetReturnPct:mark===null?null:round((mark/START_CASH-1)*100),
    performanceStatus:sources.length===0?"NO_VERIFIED_HISTORICAL_DATA":mark===null?"MARK_FX_MISSING":"HISTORICAL_ESTIMATE_ONLY",
    estimatedFeesEuro:fees,transactions:trades.length,
    buys:trades.filter(t=>t.side==="BUY").length,sells:trades.filter(t=>t.side==="SELL").length,
    // Trades are historically reconstructed, NEVER forward-observed PAPER fills.
    historicalTrades:trades,blocked,discarded,
    sources:sources.map(s=>({venue:s.venue,provider:s.provider,completedBars:s.bars.length,
      lastCompleteBarDate:s.periodEnd,exactMicIndependentlyVerified:false})),
    pendingPositions:[...holdings].filter(([,q])=>q>0).map(([venue,quantity])=>({venue,quantity})),
    syntheticInputsCertified:false,providerRightsIndependentlyVerified:false,
    independentForwardValidation:false,realtimePaperEligible:false,
    certifiedPaperFills:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,modifiesV6:false,
    assumptions:{maxInitialPositionFraction:.05,wholeShares:true,minFeeEuro:MIN_FEE_EUR,
      variableFeeRate:FEE_RATE,impactBps:IMPACT_BPS,
      priorDayFx:true,sameDateSortIsNotMarketOpenSequence:true,
      closingMarksAreNotExecutable:true},
  };
}
/** Public, aggregate-only projection. No underlying bars, quotes, trade prices, or positions. */
export function summarizeWorldV7DailyHistoricalReplay(result) {
  return {
    mode:result.mode,asOfDate:result.asOfDate,
    historicalResearchTransactions:result.transactions,
    historicalResearchBuys:result.buys,historicalResearchSells:result.sells,
    estimatedNetReturnPct:result.estimatedNetReturnPct,
    estimatedFeesEuro:result.estimatedFeesEuro,
    performanceStatus:result.performanceStatus,
    inputsWithCompletedBars:result.sources.length,
    blockedVenues:result.blocked.map(x=>({venue:x.venue,status:x.status})),
    excludedOrders:result.discarded.length,
    forwardVerifiedPaperFills:0,independentForwardValidation:false,
    marketDataRightsCertified:false,realtimePaperEligible:false,
    liveTradingAllowed:false,modifiesV6:false,
  };
}
