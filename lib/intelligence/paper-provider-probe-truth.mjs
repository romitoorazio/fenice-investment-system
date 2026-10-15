// Read-only next-campaign feasibility: NEVER imported into fingerprinted V6.
export function diagnosticQuoteAgeSeconds(value,now=Date.now()){
  if(typeof value!=="string"|| !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))return null;
  const t=Date.parse(value);
  if(!Number.isSafeInteger(now)||!Number.isFinite(t)||new Date(t).toISOString().slice(0,19)!==value.slice(0,19))return null;
  return (now-t)/1000;
}
export function diagnosticQuoteFresh(value,now,maxAgeSeconds){
  const age=diagnosticQuoteAgeSeconds(value,now);
  return age!==null&&Number.isFinite(maxAgeSeconds)&&maxAgeSeconds>0&&age>=-5&&age<=maxAgeSeconds;
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
