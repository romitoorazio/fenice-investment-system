// Read-only next-campaign feasibility: NEVER imported into fingerprinted V6.
import { normalizePaperProviderTimestamp } from "../trading/paper-timestamp-integrity.ts";

export function diagnosticQuoteAgeSeconds(value,now=Date.now()){
  const normalized=normalizePaperProviderTimestamp(value);
  const t=normalized===null?NaN:Date.parse(normalized);
  if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(t))return null;
  return (now-t)/1000;
}
export function diagnosticQuoteFresh(value,now,maxAgeSeconds){
  const age=diagnosticQuoteAgeSeconds(value,now);
  return age!==null&&Number.isFinite(maxAgeSeconds)&&maxAgeSeconds>0&&age>=0&&age<=maxAgeSeconds;
}

// Re-evaluate at report time: a boolean captured before slow provider calls
// must not preserve an expired quote's apparent quorum compatibility.
export function recheckProviderProbeQuote(row,now,maxAgeSeconds){
  const age=diagnosticQuoteAgeSeconds(row?.observedAt,now);
  const fresh=row?.ok===true&&row?.freshVerifiedQuote===true
    &&diagnosticQuoteFresh(row?.observedAt,now,maxAgeSeconds);
  return {...row,freshVerifiedQuote:fresh,ageSeconds:age===null?null:Number(age.toFixed(1)),
    reason:row?.freshVerifiedQuote===true&&!fresh?"quote-expired-or-invalid-at-report":row?.reason??null};
}

export function providerProbeMarketOpen(session,now=Date.now()){
  const age=diagnosticQuoteAgeSeconds(session?.evidence?.observedAt,now);
  return session?.configured===true&&session?.evidence?.authoritative===true
    &&session?.evidence?.venue==="US_EQUITIES"&&session?.evidence?.state==="OPEN"
    &&session?.decision?.allowed===true&&session?.decision?.state==="OPEN"
    &&age!==null&&age>=-5&&age<=90
    &&session?.brokerConnectivityAllowed===false&&session?.liveTradingAllowed===false;
}
export function chooseAlpacaIexDiagnosticPrice({quote,trade=null,now=Date.now(),maxAgeSeconds=120}){
  const bp=Number(quote?.bp),ap=Number(quote?.ap);
  const qAt=quote?.t,tAt=trade?.t??trade?.timestamp,tradePrice=Number(trade?.p??trade?.price);
  const qOk=Number.isFinite(bp)&&bp>0&&Number.isFinite(ap)&&ap>=bp&&diagnosticQuoteAgeSeconds(qAt,now)!==null;
  const tOk=Number.isFinite(tradePrice)&&tradePrice>0&&diagnosticQuoteAgeSeconds(tAt,now)!==null;
  if(qOk&&diagnosticQuoteFresh(qAt,now,maxAgeSeconds)){
    return {ok:true,freshVerifiedQuote:true,observedAt:new Date(Date.parse(qAt)).toISOString(),
      ageSeconds:Number(diagnosticQuoteAgeSeconds(qAt,now).toFixed(1)),midpoint:Number(((bp+ap)/2).toFixed(6)),
      provenance:"authenticated-alpaca-iex-latest-quote",priceBasis:"IEX_QUOTE_MIDPOINT",reason:null};
  }
  if(tOk&&diagnosticQuoteFresh(tAt,now,maxAgeSeconds)){
    return {ok:true,freshVerifiedQuote:true,observedAt:new Date(Date.parse(tAt)).toISOString(),
      ageSeconds:Number(diagnosticQuoteAgeSeconds(tAt,now).toFixed(1)),midpoint:tradePrice,
      provenance:"authenticated-alpaca-iex-latest-trade-fallback",priceBasis:"IEX_LAST_TRADE_DIAGNOSTIC",reason:null};
  }
  const last=[qOk?qAt:null,tOk?tAt:null].filter(Boolean).sort().at(-1)||null;
  return {ok:qOk||tOk,freshVerifiedQuote:false,observedAt:last?new Date(Date.parse(last)).toISOString():null,
    ageSeconds:last?Number(diagnosticQuoteAgeSeconds(last,now).toFixed(1)):null,
    midpoint:null,provenance:null,priceBasis:null,
    reason:qOk||tOk?"stale-or-future-iex-evidence":"invalid-iex-quote-and-trade"};
}
