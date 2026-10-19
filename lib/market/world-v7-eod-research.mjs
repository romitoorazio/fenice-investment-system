/**
 * FENICE World V7: personal EOD research only, never broker execution.
 * Daily bars do not show an executable quote or a fill. Signals are determined
 * only from *completed* sessions and never use a future candle.
 */
export const EOD_PILOTS = Object.freeze({
  XTKS: Object.freeze({ticker:"7203",mic:"XTKS",currency:"JPY",region:"asia-pacific",country:"Japan",timezone:"Asia/Tokyo"}),
  XMIL: Object.freeze({ticker:"ENEL",mic:"XMIL",currency:"EUR",region:"europe",country:"Italy",timezone:"Europe/Rome"}),
  XETR: Object.freeze({ticker:"SIE",mic:"XETR",currency:"EUR",region:"europe",country:"Germany",timezone:"Europe/Berlin"}),
});
const isoDate = (v) => typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(v+"T00:00:00Z"))
  && new Date(v+"T00:00:00Z").toISOString().slice(0,10) === v;
const positive = (v) => typeof v==="number" && Number.isFinite(v) && v>0;
function marketDate(iso,timezone) {
  const stamp=Date.parse(iso);
  if(!Number.isFinite(stamp) || typeof iso!=="string" || !iso.endsWith("Z")) throw Error("INVALID_RESEARCH_TIME");
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"})
    .formatToParts(stamp);
  const get=(name)=>parts.find(p=>p.type===name)?.value;
  return get("year")+"-"+get("month")+"-"+get("day");
}
function errorFor(json) {
  if(!json || typeof json!=="object" || Array.isArray(json)) return "INVALID_PROVIDER_JSON";
  if(json["Note"] || json["Information"]) return "RATE_LIMIT_OR_PLAN_RESTRICTION";
  if(json["Error Message"]) return "INVALID_SYMBOL_OR_ACCESS";
  return null;
}
export function identifyAlphaListing(venue,payload) {
  const target=EOD_PILOTS[venue];if(!target)throw Error("UNSUPPORTED_EOD_VENUE");
  const reason=errorFor(payload);
  if(reason)return {status:reason,alphaSymbol:null,exactMicProof:false};
  const matches=payload.bestMatches;
  if(!Array.isArray(matches))return {status:"NO_SYMBOL_SEARCH_RESULTS",alphaSymbol:null,exactMicProof:false};
  const candidates=matches.filter(item=>{
    const s=String(item?.["1. symbol"]||"").trim().toUpperCase();
    const c=String(item?.["8. currency"]||"").trim().toUpperCase();
    const reg=String(item?.["4. region"]||"").trim().toLowerCase();
    const typ=String(item?.["3. type"]||"").toLowerCase();
    return new RegExp("^"+target.ticker+"[.]").test(s)
      && c===target.currency && reg.includes(target.country.toLowerCase())
      && /equity|stock|common/.test(typ) && /^[A-Z0-9.]{2,28}$/.test(s);
  });
  if(candidates.length!==1)return {status:candidates.length?"AMBIGUOUS_PROVIDER_SYMBOL":"SYMBOL_REGION_CURRENCY_UNCONFIRMED",
    alphaSymbol:null,exactMicProof:false,candidateCount:candidates.length};
  return {status:"MATCHED_FOR_DAILY_RESEARCH",alphaSymbol:String(candidates[0]["1. symbol"]).toUpperCase(),
    exactMicProof:false,provider:"alpha-vantage",candidateCount:1};
}
function parseBars(payload,expectedSymbol) {
  const reason=errorFor(payload);if(reason)return {status:reason,bars:[]};
  if(String(payload?.["Meta Data"]?.["2. Symbol"] || "").toUpperCase() !== expectedSymbol)
    return {status:"RETURNED_SYMBOL_MISMATCH",bars:[]};
  const series=payload["Time Series (Daily)"];
  if(!series || typeof series!=="object" || Array.isArray(series))return {status:"MISSING_DAILY_SERIES",bars:[]};
  const rows=[];
  for(const [date,value] of Object.entries(series)) {
    if(!isoDate(date) || !value || typeof value!=="object")return {status:"INVALID_OHLC_BAR",bars:[]};
    const o=Number(value["1. open"]),h=Number(value["2. high"]),l=Number(value["3. low"]),c=Number(value["4. close"]),v=Number(value["5. volume"]);
    if(![o,h,l,c].every(positive) || !Number.isFinite(v) || v<0 || h<Math.max(o,c) || l>Math.min(o,c) || h<l)
      return {status:"INVALID_OHLC_BAR",bars:[]};
    rows.push({date,open:o,high:h,low:l,close:c,volume:v});
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  return {status:"PARSED",bars:rows};
}
export function evaluateEodResearch(venue,listing,dailyPayload,nowIso) {
  const target=EOD_PILOTS[venue];if(!target)throw Error("UNSUPPORTED_EOD_VENUE");
  const today=marketDate(nowIso,target.timezone);
  const core={
    venue, ticker:target.ticker, currency:target.currency, region:target.region,
    provider:"alpha-vantage", mode:"WORLD_V7_EOD_RESEARCH_ONLY",
    analyzedAt:nowIso, providerSymbol:listing?.alphaSymbol??null,
    providerSymbolConfirmed:listing?.status==="MATCHED_FOR_DAILY_RESEARCH",
    exactMicCertified:false, licensedPaperSource:false, licensedRedistribution:false,
    dataUsedForOrderExecution:false, liveTradingAllowed:false,
    paperFillCount:0, EodResearchIsNotRealtimeQuote:true,
    lastCompleteBarDate:null, researchSignal:"NO_SIGNAL", decisionTimeGate:"NEXT_SESSION_ONLY",
  };
  if(listing?.status!=="MATCHED_FOR_DAILY_RESEARCH")
    return {...core,status:listing?.status??"PROVIDER_SYMBOL_NOT_MATCHED"};
  const parsed=parseBars(dailyPayload,listing.alphaSymbol);
  if(parsed.status!=="PARSED")return {...core,status:parsed.status};
  const complete=parsed.bars.filter(row=>row.date<today); // NEVER use today's possibly incomplete bar.
  if(complete.length<22)return {...core,status:"INSUFFICIENT_COMPLETED_SESSIONS",
    completeSessions:complete.length};
  const last=complete.at(-1);
  const ageDays=Math.floor((Date.parse(today+"T00:00:00Z")-Date.parse(last.date+"T00:00:00Z"))/86400000);
  // Market holidays and weekends can legitimately create gaps; only a 7-day gap blocks.
  if(ageDays>7)return {...core,status:"STALE_COMPLETED_DAILY_HISTORY",lastCompleteBarDate:last.date,ageDays};
  const sma=(n,end)=>complete.slice(end-n,end).reduce((sum,row)=>sum+row.close,0)/n;
  const end=complete.length;
  const current5=sma(5,end),current20=sma(20,end);
  const prior5=sma(5,end-1),prior20=sma(20,end-1);
  const diff=current5/current20-1;
  // No prospective fills: the signal is only generated after the complete daily
  // bar, so any fill using this close or any earlier OHLC is look-ahead.
  const direction=diff>0.005 && current5>=prior5 && last.close>=current20 ? "UPTREND_RESEARCH"
    : diff< -0.005 && current5<=prior5 ? "DOWNTREND_RESEARCH" : "NEUTRAL_RESEARCH";
  return {...core,status:"COMPLETE_EOD_RESEARCH",completeSessions:complete.length,
    lastCompleteBarDate:last.date,ageDays,researchSignal:direction,
    nextSessionFillVerified:false, futureOpenRequired:true,
    // Direction only: no price, OHLC, volume or indicator value redistributed.
    rawPricePublished:false, outputIsNonReconstructableDerivedMetadata:true};
}
