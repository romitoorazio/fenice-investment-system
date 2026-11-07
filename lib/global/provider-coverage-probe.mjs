/** Read-only provider probe: inspect real availability without fabricating fills or exposing API keys. */
import {fetchTwelveDataGlobalQuote} from "./twelve-data-quote-source.mjs";
const REGION_BY_MIC={XTKS:"ASIA",XHKG:"ASIA",XSHG:"ASIA",XNSE:"ASIA",XMIL:"EUROPE",XETR:"EUROPE",XLON:"EUROPE",XNYS:"AMERICAS",XNAS:"AMERICAS"};
const REGIONS=["ASIA","EUROPE","AMERICAS"];
// Deterministic one-per-region scheduling: input order must not consume the entire
// API budget on one exchange. Rotating the first region daily avoids permanent bias.
export function planRegionalProbeOrder(instruments,nowIso){
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now))throw Error("INVALID_PROBE_CLOCK");
 const groups=Object.fromEntries(REGIONS.map(r=>[r,[]]));
 instruments.forEach((item,i)=>groups[REGION_BY_MIC[item.mic]].push(i));
 const first=(Math.floor(now/86400000)+1)%REGIONS.length;
 const order=[];
 while(REGIONS.some(r=>groups[r].length)){
  for(let j=0;j<REGIONS.length;j++){
   const region=REGIONS[(first+j)%REGIONS.length];
   if(groups[region].length)order.push(groups[region].shift());
  }
 }
 return order;
}
export async function probeTwelveDataCoverage({instruments,apiKey,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString()}){
 if(!Array.isArray(instruments)||instruments.length<1||instruments.length>10)throw Error("INVALID_PROBE_UNIVERSE");
 const seen=new Set(),rows=new Array(instruments.length);
 let quotaBlocked=false;
 let networkBlocked=false;
 // Validate the whole universe before any network request; invalid entries must not spend quota.
 for(const item of instruments){
  if(!item||!Object.hasOwn(REGION_BY_MIC,item.mic)||typeof item.instrumentId!=="string"||!new RegExp("^"+item.mic+":[A-Za-z0-9._-]{1,32}$").test(item.instrumentId)||typeof item.symbol!=="string"||!/^[A-Za-z0-9._:-]{1,32}$/.test(item.symbol))throw Error("INVALID_PROBE_INSTRUMENT");
 }
 let actualRequests=0;
 for(const index of planRegionalProbeOrder(instruments,nowIso)){
  const item=instruments[index];
  const key=`${item?.mic}:${item?.instrumentId}`;
  if(seen.has(key)){rows[index]={mic:item?.mic,instrumentId:item?.instrumentId,ok:false,reason:"DUPLICATE_INSTRUMENT",requestSent:false,attemptSequence:null};continue;}
  seen.add(key);
  if(quotaBlocked||networkBlocked){rows[index]={mic:item?.mic,instrumentId:item?.instrumentId,ok:false,reason:quotaBlocked?"PROVIDER_QUOTA_STOPPED":"PROVIDER_NETWORK_STOPPED",requestSent:false,attemptSequence:null};continue;}
  actualRequests++;
  const result=await fetchTwelveDataGlobalQuote({mic:item?.mic,instrumentId:item?.instrumentId,symbol:item?.symbol,apiKey,fetchImpl,nowIso});
  if(result.reason==="PROVIDER_RATE_LIMITED")quotaBlocked=true;
  if(result.reason==="PROVIDER_NETWORK_FAILURE")networkBlocked=true;
  rows[index]={mic:item?.mic,instrumentId:item?.instrumentId,ok:result.ok,reason:result.reason??null,requestSent:true,attemptSequence:actualRequests,
   observedAt:result.ok?result.quote.observedAt:null,
   provider:result.ok?result.quote.provider:null,
   verificationStatus:result.ok?result.quote.verificationStatus:null,
   // Reference availability is research coverage, NEVER executable fill evidence.
   referenceOnly:Boolean(result.reference),referenceObservation:result.reference??null};
 }
 const regions=Object.fromEntries(REGIONS.map(region=>{const subset=rows.filter(r=>REGION_BY_MIC[r.mic]===region);return [region,{requested:subset.length,attempted:subset.filter(r=>r.requestSent).length,validTransportQuotes:subset.filter(r=>r.ok).length,referenceOnlyQuotes:subset.filter(r=>r.referenceOnly).length,recentReferenceQuotes:subset.filter(r=>r.referenceObservation?.freshness==="RECENT_UNVERIFIED").length,staleReferenceQuotes:subset.filter(r=>r.referenceObservation?.freshness==="STALE_HISTORICAL").length,hardFailures:subset.filter(r=>!r.ok&&!r.referenceOnly).length,unsupportedOrFailed:subset.filter(r=>!r.ok).length,verifiedMarketEvidence:0}];}));
 const rejectionReasons=Object.fromEntries([...new Set(rows.filter(r=>!r.ok).map(r=>r.reason))].sort().map(reason=>[reason,rows.filter(r=>r.reason===reason).length]));
 return {mode:"READ_ONLY_PROVIDER_COVERAGE",generatedAt:nowIso,countsTowardRealPaper:false,regions,rejectionReasons,
  totals:{requested:rows.length,attempted:rows.filter(r=>r.requestSent).length,validTransportQuotes:rows.filter(r=>r.ok).length,referenceOnlyQuotes:rows.filter(r=>r.referenceOnly).length,recentReferenceQuotes:rows.filter(r=>r.referenceObservation?.freshness==="RECENT_UNVERIFIED").length,staleReferenceQuotes:rows.filter(r=>r.referenceObservation?.freshness==="STALE_HISTORICAL").length,hardFailures:rows.filter(r=>!r.ok&&!r.referenceOnly).length,verifiedMarketEvidence:0},
  rows};
}
