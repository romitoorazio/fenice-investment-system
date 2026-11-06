/** Twelve Data /quote read-only adapter. Never invent bid/ask from close or price. */
import {getVenue} from "./venue-registry.mjs";
import {fetchProviderQuote} from "./quote-provider-adapter.mjs";
export async function fetchTwelveDataGlobalQuote({mic,instrumentId,symbol,apiKey,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString()}){
  const fail=reason=>({ok:false,reason});
  const venue=getVenue(mic);
  if(!venue||typeof instrumentId!=="string"||!instrumentId.trim()||typeof symbol!=="string"||!symbol.trim()||typeof apiKey!=="string"||!apiKey.trim())return fail("TWELVE_DATA_CONFIGURATION_MISSING");
  let referenceOnly=null;
  const endpoint=new URL("https://api.twelvedata.com/quote");
  endpoint.searchParams.set("symbol",symbol);
  // Symbol alone is ambiguous across worldwide listings: request the exact MIC.
  endpoint.searchParams.set("mic_code",mic);
  endpoint.searchParams.set("apikey",apiKey);
  const transport=await fetchProviderQuote({mic,instrumentId,endpoint:endpoint.toString(),provider:"twelve-data",family:"twelve-data",fetchImpl:async(url,options)=>{
    const response=await fetchImpl(url,options);
    if(!response.ok)return response;
    const payload=await response.json();
    if(payload?.status==="error"||payload?.code||payload?.error)return {ok:true,status:200,headers:response.headers,json:async()=>payload};
    // Twelve Data quote is often last/close only. Never fabricate an executable spread.
    const bid=Number(payload?.bid),ask=Number(payload?.ask);
    // Twelve Data's "timestamp" is the candle opening, NOT the latest quote time.
    // Do not manufacture a fresh bid/ask from a stale daily-candle timestamp.
    const lastQuoteAt=payload?.last_quote_at;
    const quoteTime=typeof lastQuoteAt==="number"&&Number.isSafeInteger(lastQuoteAt)?lastQuoteAt:NaN;
    const timestampMs=quoteTime*1000;
    const observedAt=Number.isFinite(timestampMs)&&timestampMs>0&&Math.abs(timestampMs)<=8.64e15?new Date(timestampMs).toISOString():null;
    const normalized={mic,instrumentId,currency:venue.currency,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,observedAt};
    // Never trust caller-supplied MIC: the provider must echo the exact listing venue.
    if(typeof payload?.symbol!=="string"||payload.symbol.trim().toUpperCase()!==symbol.trim().toUpperCase()||typeof payload?.mic_code!=="string"||payload.mic_code.trim().toUpperCase()!==mic||typeof payload?.currency!=="string"||payload.currency.trim().toUpperCase()!==venue.currency)return {ok:true,status:200,headers:response.headers,json:async()=>({...normalized,instrumentId:"PROVIDER_SYMBOL_MIC_OR_CURRENCY_UNVERIFIED"})};
    // The standard /quote endpoint often supplies only OHLC/last. Keep this useful
    // read-only reference separately; it is NEVER an executable bid/ask or PAPER evidence.
    const last=typeof payload?.close==="number"?payload.close:
      (typeof payload?.close==="string"&&payload.close.trim()?Number(payload.close):NaN);
    const observedMs=Date.parse(observedAt??"");
    const nowMs=Date.parse(nowIso);
    if(payload?.bid==null&&payload?.ask==null&&Number.isFinite(last)&&last>0&&
      Number.isFinite(observedMs)&&Number.isFinite(nowMs)&&observedMs<=nowMs){
      referenceOnly={mic,instrumentId,currency:venue.currency,last,observedAt,
        provider:"twelve-data",verificationStatus:"PROVIDER_RESPONSE_UNVERIFIED",
        executableBidAsk:false,countsTowardRealPaper:false};
    }
    return {ok:true,status:200,headers:response.headers,json:async()=>normalized};
  },nowIso});
  if(transport.reason==="PROVIDER_INVALID_SPREAD"&&referenceOnly){
    return {...transport,reason:"PROVIDER_REFERENCE_ONLY_NO_BID_ASK",reference:referenceOnly};
  }
  return transport;
}
