/** Read-only provider probe: inspect real availability without fabricating fills or exposing API keys. */
import {fetchTwelveDataGlobalQuote} from "./twelve-data-quote-source.mjs";
export async function probeTwelveDataCoverage({instruments,apiKey,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString()}){
 if(!Array.isArray(instruments)||instruments.length<1||instruments.length>30)throw Error("INVALID_PROBE_UNIVERSE");
 const seen=new Set(),rows=[];
 for(const item of instruments){
  const key=`${item?.mic}:${item?.instrumentId}`;
  if(seen.has(key)){rows.push({mic:item?.mic,instrumentId:item?.instrumentId,ok:false,reason:"DUPLICATE_INSTRUMENT"});continue;}
  seen.add(key);
  const result=await fetchTwelveDataGlobalQuote({mic:item?.mic,instrumentId:item?.instrumentId,symbol:item?.symbol,apiKey,fetchImpl,nowIso});
  rows.push({mic:item?.mic,instrumentId:item?.instrumentId,ok:result.ok,reason:result.reason??null,
   observedAt:result.ok?result.quote.observedAt:null,
   provider:result.ok?result.quote.provider:null,
   verificationStatus:result.ok?result.quote.verificationStatus:null});
 }
 return {mode:"READ_ONLY_PROVIDER_COVERAGE",generatedAt:nowIso,countsTowardRealPaper:false,
  totals:{attempted:rows.length,validTransportQuotes:rows.filter(r=>r.ok).length,verifiedMarketEvidence:0},
  rows};
}
