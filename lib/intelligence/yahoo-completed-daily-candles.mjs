/**
 * ONE GLOBAL: reject in-progress daily chart OHLC before technical scoring.
 *
 * Yahoo daily timestamps describe candle buckets, not definitive closes.
 * A same-venue-local-day candle is eligible for historical RESEARCH only when
 * the provider's exact regular-session end is known and at least 20 minutes
 * have elapsed. Otherwise retain the previous fully elapsed local-day bar.
 * This does NOT independently certify an exchange closing price or market
 * data rights, and is NEVER execution/PAPER evidence.
 */
const SETTLEMENT_DELAY_MS=20*60*1000;
const UNIX_MIN=946684800,UNIX_MAX=4102444800;
const epoch=value=>Number.isSafeInteger(value)&&value>=UNIX_MIN&&value<UNIX_MAX
  ?value*1000:null;
const dateMs=value=>value instanceof Date&&Number.isFinite(value.getTime())?value.getTime():null;
function localDay(ms,timezone){
  try{
    const parts=new Intl.DateTimeFormat("en-US",{
      timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
    }).formatToParts(new Date(ms));
    const dict=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return dict.year+"-"+dict.month+"-"+dict.day;
  }catch{return null;}
}
export function selectCompletedYahooDailyCandles({rows,meta,now}){
  const current=dateMs(now);
  if(current===null||!Array.isArray(rows)||rows.length<1||rows.length>1500
    ||rows.some(r=>!r||epoch(r.timestamp)===null))
    throw Error("WORLD_DAILY_COMPLETION_INPUT_INVALID");
  const timezone=typeof meta?.exchangeTimezoneName==="string"
    ?meta.exchangeTimezoneName:"UTC";
  if(localDay(current,timezone)===null)
    throw Error("WORLD_DAILY_COMPLETION_TIMEZONE_INVALID");
  const today=localDay(current,timezone);
  const regular=meta?.currentTradingPeriod?.regular;
  const start=epoch(regular?.start),end=epoch(regular?.end);
  const exactSessionWindow=start!==null&&end!==null
    &&end>start&&end-start<=18*3600000;
  const result=rows.slice();
  let heldBack=0,reason=null;
  while(result.length){
    const candidate=result.at(-1);
    const at=epoch(candidate.timestamp),sessionDay=localDay(at,timezone);
    if(at>current){
      result.pop();heldBack++;reason="FUTURE_CANDLE_BUCKET";continue;
    }
    if(sessionDay>today){
      result.pop();heldBack++;reason="EXCHANGE_LOCAL_FUTURE_DAY";continue;
    }
    if(sessionDay===today){
      const exactSameDay=exactSessionWindow
        &&localDay(start,timezone)===today
        &&localDay(end-1000,timezone)===today;
      if(!exactSameDay||current<end+SETTLEMENT_DELAY_MS){
        result.pop();heldBack++;
        reason=exactSameDay?"REGULAR_SESSION_NOT_SETTLED":
          "CURRENT_LOCAL_DAY_NO_MATCHING_REGULAR_SESSION_END";
        continue;
      }
    }
    break;
  }
  return {
    rows:result,
    heldBack,
    reason,
    completedDailyResearchBarsOnly:true,
    lastBarEligibleForResearch:result.length>0,
    latestRetainedSessionBucket:result.length?new Date(result.at(-1).timestamp*1000).toISOString():null,
    eligibilityRule:"EXCHANGE_LOCAL_DAY_ELAPSED_OR_PROVIDER_REGULAR_SESSION_END_PLUS_20M",
    independentExchangeCloseCertified:false,
    authorizedRealtimeQuote:false,paperEligible:false,liveTradingAllowed:false,
  };
}
