/** Read-only provider probe: inspect real availability without fabricating fills or exposing API keys. */
import {fetchTwelveDataGlobalQuote} from "./twelve-data-quote-source.mjs";
const REGION_BY_MIC={XTKS:"ASIA",XHKG:"ASIA",XSHG:"ASIA",XNSE:"ASIA",XMIL:"EUROPE",XETR:"EUROPE",XLON:"EUROPE",XNYS:"AMERICAS",XNAS:"AMERICAS"};
export async function probeTwelveDataCoverage({instruments,apiKey,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString()}){
 if(!Array.isArray(instruments)||instruments.length<1||instruments.length>10)throw Error("INVALID_PROBE_UNIVERSE");
 const seen=new Set(),rows=[];
 let quotaBlocked=false;
 // Validate the whole universe before any network request; invalid entries must not spend quota.
 for(const item of instruments){
  if(!item||!Object.hasOwn(REGION_BY_MIC,item.mic)||typeof item.instrumentId!=="string"||!new RegExp("^"+item.mic+":[A-Za-z0-9._-]{1,32}$").test(item.instrumentId)||typeof item.symbol!=="string"||!/^[A-Za-z0-9._:-]{1,32}$/.test(item.symbol))throw Error("INVALID_PROBE_INSTRUMENT");
 }
 for(const item of instruments){
  const key=`${item?.mic}:${item?.instrumentId}`;
  if(seen.has(key)){rows.push({mic:item?.mic,instrumentId:item?.instrumentId,ok:false,reason:"DUPLICATE_INSTRUMENT",requestSent:false});continue;}
  seen.add(key);
  if(quotaBlocked){rows.push({mic:item?.mic,instrumentId:item?.instrumentId,ok:false,reason:"PROVIDER_QUOTA_STOPPED",requestSent:false});continue;}
  const result=await fetchTwelveDataGlobalQuote({mic:item?.mic,instrumentId:item?.instrumentId,symbol:item?.symbol,apiKey,fetchImpl,nowIso});
  if(result.reason==="PROVIDER_RATE_LIMITED")quotaBlocked=true;
  rows.push({mic:item?.mic,instrumentId:item?.instrumentId,ok:result.ok,reason:result.reason??null,requestSent:true,
   observedAt:result.ok?result.quote.observedAt:null,
   provider:result.ok?result.quote.provider:null,
   verificationStatus:result.ok?result.quote.verificationStatus:null});
 }
 const regions=Object.fromEntries(["ASIA","EUROPE","AMERICAS"].map(region=>{const subset=rows.filter(r=>REGION_BY_MIC[r.mic]===region);return [region,{requested:subset.length,attempted:subset.filter(r=>r.requestSent).length,validTransportQuotes:subset.filter(r=>r.ok).length,unsupportedOrFailed:subset.filter(r=>!r.ok).length,verifiedMarketEvidence:0}];}));
 const rejectionReasons=Object.fromEntries([...new Set(rows.filter(r=>!r.ok).map(r=>r.reason))].sort().map(reason=>[reason,rows.filter(r=>r.reason===reason).length]));
 return {mode:"READ_ONLY_PROVIDER_COVERAGE",generatedAt:nowIso,countsTowardRealPaper:false,regions,rejectionReasons,
  totals:{requested:rows.length,attempted:rows.filter(r=>r.requestSent).length,validTransportQuotes:rows.filter(r=>r.ok).length,verifiedMarketEvidence:0},
  rows};
}
