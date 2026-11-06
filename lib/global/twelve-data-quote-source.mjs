/** Twelve Data /quote read-only adapter. Never invent bid/ask from close or price. */
import {getVenue} from "./venue-registry.mjs";
import {fetchProviderQuote} from "./quote-provider-adapter.mjs";
export async function fetchTwelveDataGlobalQuote({mic,instrumentId,symbol,apiKey,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString()}){
  const fail=reason=>({ok:false,reason});
  const venue=getVenue(mic);
  if(!venue||typeof instrumentId!=="string"||!instrumentId.trim()||typeof symbol!=="string"||!symbol.trim()||typeof apiKey!=="string"||!apiKey.trim())return fail("TWELVE_DATA_CONFIGURATION_MISSING");
  const endpoint=new URL("https://api.twelvedata.com/quote");
  endpoint.searchParams.set("symbol",symbol);
  endpoint.searchParams.set("apikey",apiKey);
  return fetchProviderQuote({mic,instrumentId,endpoint:endpoint.toString(),provider:"twelve-data",family:"twelve-data",fetchImpl:async(url,options)=>{
    const response=await fetchImpl(url,options);
    if(!response.ok)return response;
    const payload=await response.json();
    if(payload?.status==="error"||payload?.code||payload?.error)return {ok:true,status:200,headers:response.headers,json:async()=>payload};
    // Twelve Data quote is often last/close only. Never fabricate an executable spread.
    const bid=Number(payload?.bid),ask=Number(payload?.ask);
    const quoteTime=Number(payload?.timestamp);
    const timestampMs=quoteTime*1000;
    const observedAt=Number.isFinite(timestampMs)&&timestampMs>0&&Math.abs(timestampMs)<=8.64e15?new Date(timestampMs).toISOString():null;
    const normalized={mic,instrumentId,currency:venue.currency,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,observedAt};
    // A matching symbol and provider-reported currency are mandatory; no inferred listing identity.
    if(typeof payload?.symbol!=="string"||payload.symbol.trim().toUpperCase()!==symbol.trim().toUpperCase()||typeof payload?.currency!=="string"||payload.currency.toUpperCase()!==venue.currency)return {ok:true,status:200,headers:response.headers,json:async()=>({...normalized,instrumentId:"PROVIDER_SYMBOL_OR_CURRENCY_UNVERIFIED"})};
    return {ok:true,status:200,headers:response.headers,json:async()=>normalized};
  },nowIso});
}
