import {getVenue} from "./venue-registry.mjs";
/** Read-only Yahoo chart research fetch. Public HTTP is NOT independent provenance attestation. */
export async function fetchPhase3YahooChartHistory({symbols=[],fetchImpl=fetch,nowIso=new Date().toISOString(),timeoutMs=12000}={}){
 if(!Array.isArray(symbols)||symbols.length>20||!Number.isFinite(Date.parse(nowIso))||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error("INVALID_RESEARCH_FETCH_POLICY");
 const histories=[],errors=[];
 for(const [index,s] of symbols.entries()){
  const symbol=s?.symbol;
  if(typeof symbol!=="string"||!/^\^?[A-Za-z0-9][A-Za-z0-9.\-^=]{0,29}$/.test(symbol)||!getVenue(s.mic)||typeof s.instrumentId!=="string"||!s.instrumentId.startsWith(s.mic+":")){errors.push({index,reason:"INVALID_SYMBOL_MAPPING"});continue;}
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  // Retry bounded transient public HTTP failures, never substitute guessed quotes.
  for(let attempt=1;attempt<=3;attempt++){
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const response=await fetchImpl(url,{signal:controller.signal,headers:{accept:"application/json"}});
   if(!response.ok)throw Error(`HTTP_${response.status}`);
   const payload=await response.json();
   const result=payload?.chart?.result?.[0];
   if(result?.meta?.symbol!==symbol)throw Error("PROVIDER_SYMBOL_MISMATCH");
   const sourceCurrency=result?.meta?.currency;
   // Yahoo London Stock Exchange quotes may use GBp (pence); normalize to GBP before any FX calculation.
   const penceQuoted=sourceCurrency==="GBp";
   const currency=penceQuoted?"GBP":sourceCurrency;
   if(typeof currency!=="string"||!/^[A-Z]{3}$/.test(currency))throw Error("INVALID_PROVIDER_CURRENCY");
   const timestamps=result?.timestamp,closes=result?.indicators?.quote?.[0]?.close;
   if(!Array.isArray(timestamps)||!Array.isArray(closes)||timestamps.length!==closes.length)throw Error("INVALID_PROVIDER_HISTORY");
   const scale=penceQuoted?0.01:1;
   const points=timestamps.map((t,i)=>({observedAt:new Date(t*1000).toISOString(),close:closes[i]*scale})).filter(p=>typeof p.close==="number"&&Number.isFinite(p.close)&&p.close>0);
   if(points.length<21)throw Error("INSUFFICIENT_PROVIDER_HISTORY");
   if(points.some((p,i)=>i>0&&Date.parse(p.observedAt)<=Date.parse(points[i-1].observedAt)))throw Error("UNSORTED_PROVIDER_HISTORY");
    histories.push({mic:s.mic,instrumentId:s.instrumentId,symbol,currency,sourceCurrency,priceScaleToCurrencyUnit:scale,closes:points,synthetic:false,provenanceVerified:false,sourceId:"yahoo-chart-public-unattested",sourceUrl:url,classification:"UNATTESTED_HTTP_RESEARCH"});
    break;
   }catch(error){
    const reason=String(error?.message||"RESEARCH_FETCH_FAILED").slice(0,100);
    const retryable=/^HTTP_(429|500|502|503|504)$/.test(reason)||/AbortError|fetch failed|network/i.test(reason);
    if(!retryable||attempt===3){errors.push({index,symbol,reason,attempts:attempt});break;}
    await new Promise(resolve=>setTimeout(resolve,250*attempt));
   }finally{clearTimeout(timer);}
  }
 }
 return {mode:"PUBLIC_RESEARCH_HTTP_UNATTESTED",liveTradingAllowed:false,paperFillAuthorized:false,histories,errors};
}
