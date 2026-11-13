/**
 * Independent, no-key Yahoo Finance daily historical RESEARCH fallback for
 * the BAMI XMIL pilot. A Yahoo chart is NOT an exchange-certified close,
 * independent price quorum, broker fill or evidence of data use rights.
 * Never publish OHLC, price values, chart payload or provider credentials.
 */
import {selectCompletedYahooDailyCandles} from "../intelligence/yahoo-completed-daily-candles.mjs";
import {EOD_PILOTS} from "./world-v7-eod-research.mjs";
const POS=x=>typeof x==="number"&&Number.isFinite(x)&&x>0;
const DAY=x=>{
  const d=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",
    year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(x));
  const get=n=>d.find(p=>p.type===n)?.value;
  return get("year")+"-"+get("month")+"-"+get("day");
};
const UNIX=s=>Number.isSafeInteger(s)&&s>=946684800&&s<4102444800;
const candle=(v,i)=>Array.isArray(v)&&i<v.length?v[i]:null;
export function evaluateYahooBamiEodResearch(payload,nowIso){
  const at=Date.parse(nowIso);
  if(typeof nowIso!=="string"||!Number.isFinite(at)
    ||new Date(at).toISOString()!==nowIso)throw Error("YAHOO_BAMI_INVALID_AUDIT_CLOCK");
  const target=EOD_PILOTS.XMIL;
  const base={
    venue:"XMIL",ticker:target.ticker,currency:"EUR",region:"europe",
    provider:"yahoo-finance",mode:"WORLD_V7_EOD_RESEARCH_ONLY",
    analyzedAt:nowIso,providerSymbol:"BAMI.MI",
    providerSymbolConfirmed:false,exactMicCertified:false,
    licensedPaperSource:false,licensedRedistribution:false,
    dataUsedForOrderExecution:false,liveTradingAllowed:false,
    paperFillCount:0,EodResearchIsNotRealtimeQuote:true,
    lastCompleteBarDate:null,researchSignal:"NO_SIGNAL",
    decisionTimeGate:"NEXT_SESSION_ONLY",yahooSingleFamilyResearchOnly:true,
    independentProviderReceipts:0,rawPricePublished:false,
  };
  const reject=status=>({observation:{...base,status},bars:[]});
  const chart=payload?.chart;
  if(chart?.error||!Array.isArray(chart?.result)||chart.result.length!==1)
    return reject("YAHOO_CHART_UNAVAILABLE");
  const result=chart.result[0], meta=result?.meta;
  // Strict identity/currency/timezone gate. A self-reported MIC is not
  // independently authenticated, even when this exact candidate matches.
  if(meta?.symbol!=="BAMI.MI"||meta?.currency!=="EUR"
    ||meta?.instrumentType!=="EQUITY"||meta?.exchangeTimezoneName!=="Europe/Rome")
    return reject("YAHOO_BAMI_IDENTITY_UNVERIFIED");
  const times=result.timestamp,series=result.indicators?.quote?.[0];
  if(!Array.isArray(times)||times.length<1||times.length>700||!series)
    return reject("YAHOO_DAILY_SCHEMA_INVALID");
  if(["open","high","low","close","volume"].some(k=>
    !Array.isArray(series[k])||series[k].length!==times.length))
    return reject("YAHOO_DAILY_SCHEMA_INVALID");
  const rows=[];let last=0;
  for(let i=0;i<times.length;i++){
    const timestamp=times[i];
    if(!UNIX(timestamp)||timestamp<=last)return reject("YAHOO_DAILY_TIME_INVALID");
    last=timestamp;
    const open=candle(series.open,i),high=candle(series.high,i),
      low=candle(series.low,i),close=candle(series.close,i),
      volume=candle(series.volume,i);
    // Yahoo may include an empty candle for a venue holiday.
    if([open,high,low,close].every(x=>x===null))continue;
    if(![open,high,low,close].every(POS)||!Number.isFinite(volume)
      ||volume<0||high<Math.max(open,close)||low>Math.min(open,close)
      ||high<low)return reject("YAHOO_INVALID_OHLC");
    rows.push({timestamp,open,high,low,close,volume});
  }
  if(rows.length<22)return reject("INSUFFICIENT_COMPLETED_SESSIONS");
  let selected;
  try{selected=selectCompletedYahooDailyCandles({rows,meta,now:new Date(at)});}
  catch{return reject("YAHOO_COMPLETION_PROVENANCE_INVALID");}
  const complete=selected.rows, today=DAY(at);
  if(complete.length<22)return reject("INSUFFICIENT_COMPLETED_SESSIONS");
  const bars=complete.map(row=>({date:DAY(row.timestamp*1000),
    open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume}));
  if(new Set(bars.map(x=>x.date)).size!==bars.length)
    return reject("YAHOO_DUPLICATE_SESSION");
  // Deliberately reject today's candle even if Yahoo claims it completed:
  // the existing Alpha EOD research requires the next venue-local day.
  const strictBars=bars.filter(x=>x.date<today);
  if(strictBars.length<22)return reject("INSUFFICIENT_COMPLETED_SESSIONS");
  const final=strictBars.at(-1);
  const ageDays=Math.floor((Date.parse(today+"T00:00:00Z")-Date.parse(final.date+"T00:00:00Z"))/86400000);
  if(ageDays>7)return reject("YAHOO_STALE_HISTORY");
  const avg=(end,n)=>strictBars.slice(end-n,end).reduce((s,x)=>s+x.close,0)/n;
  const end=strictBars.length,current5=avg(end,5),current20=avg(end,20),
    prev5=avg(end-1,5),prev20=avg(end-1,20);
  const gap=current5/current20-1;
  const trend=gap>.005&&current5>=prev5&&final.close>=current20?"UPTREND_RESEARCH":
    gap<-.005&&current5<=prev5?"DOWNTREND_RESEARCH":"NEUTRAL_RESEARCH";
  return {observation:{...base,status:"TENTATIVE_COMPLETED_DAILY_RESEARCH",
      providerSymbolConfirmed:true,provisionalResearchMapping:true,
      completeSessions:strictBars.length,lastCompleteBarDate:final.date,
      ageDays,researchSignal:trend,heldBackUnsettledCandles:selected.heldBack,
      futureOpenRequired:true,nextSessionFillVerified:false,
      independentExchangeCloseCertified:false,
      outputIsNonReconstructableDerivedMetadata:true,
    },bars:strictBars};
}
