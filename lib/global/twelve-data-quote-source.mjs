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
    const quoteTime=payload?.timestamp;
    const observedAt=Number.isFinite(Number(quoteTime))&&Number(quoteTime)>0?new Date(Number(quoteTime)*1000).toISOString():null;
    const normalized={mic,instrumentId,currency:venue.currency,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,observedAt};
    // Validate symbol/venue mapping externally before using any normalized evidence.
    if(payload?.symbol&&String(payload.symbol).toUpperCase()!==symbol.toUpperCase())return {ok:true,status:200,headers:response.headers,json:async()=>({...normalized,instrumentId:"PROVIDER_SYMBOL_MISMATCH"})};
    return {ok:true,status:200,headers:response.headers,json:async()=>normalized};
  },nowIso});
}
