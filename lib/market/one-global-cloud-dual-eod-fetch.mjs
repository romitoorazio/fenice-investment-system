/** Bounded server-side research intake. Exact existing demo universe, never a fill. */
import {alpacaSipCredentialsPresent} from './one-global-alpaca-sip-eod.mjs';
import {fetchOneGlobalAlpacaIexEod} from './one-global-alpaca-iex-eod.mjs';
import {parseOneGlobalSettlementClose} from './one-global-cloud-settlement-sources.mjs';
import {buildFirstPaperFreeEodEvidence} from './one-global-first-paper-dual-eod.mjs';
const fail=code=>{throw Error('CLOUD_DUAL_EOD_'+code);};
async function get(url,fetcher){
  try{
    const r=await fetcher(url,{redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
    if(!r.ok){
      if([401,403].includes(r.status))fail('AUTH_OR_PLAN_DENIED');
      if(r.status===429)fail('RATE_LIMIT');
      fail('HTTP_REJECTED');
    }
    if(!/json|text\/plain/.test(r.headers.get('content-type')||''))fail('CONTENT_TYPE');
    const reader=r.body?.getReader();if(!reader)fail('EMPTY_RESPONSE');
    let size=0;const chunks=[];
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;
        size+=value.length;if(size>500000){await reader.cancel();fail('RESPONSE_TOO_LARGE');}
        chunks.push(Buffer.from(value));}
    }finally{reader.releaseLock();}
    if(size<10)fail('EMPTY_OR_TOO_SHORT');
    return Buffer.concat(chunks);
  }catch(e){
    if(/^CLOUD_DUAL_EOD_[A-Z_]+$/.test(e?.message||''))throw e;
    fail('TRANSPORT_UNAVAILABLE');
  }
}
export async function fetchOneGlobalCloudDualEod({symbol,sessionDate,
  alphaKey=process.env.ALPHA_VANTAGE_API_KEY,
  eodhdKey=process.env.EODHD_API_TOKEN||'demo',fetcher=fetch,
  clock=()=>new Date().toISOString(),env=process.env}={}){
  if(!['AAPL','MSFT','TSLA'].includes(symbol)||!/^\d{4}-\d\d-\d\d$/.test(sessionDate||''))fail('UNSUPPORTED_IDENTITY');
  // Paper-only Basic entitlement: use the IEX-only feed, NEVER silently SIP.
  const useIex=alpacaSipCredentialsPresent(env);
  const hasAlpha=typeof alphaKey==='string'&&/^[-_A-Za-z0-9]{8,120}$/.test(alphaKey);
  if(!hasAlpha&&!useIex)fail('ALPHA_KEY_MISSING');
  if(typeof eodhdKey!=='string'||!/^[-_A-Za-z0-9]{4,150}$/.test(eodhdKey))fail('EODHD_KEY_INVALID');
  const deadline=AbortSignal.timeout(11000);
  const boundedFetcher=(url,options)=>fetcher(url,{...options,signal:AbortSignal.any([deadline,options.signal].filter(Boolean))});
  const a=new URL('https://www.alphavantage.co/query');
  a.search=new URLSearchParams({function:'TIME_SERIES_DAILY',symbol,outputsize:'compact',apikey:alphaKey});
  const e=new URL('https://eodhd.com/api/eod/'+symbol+'.US');
  const historyStart=new Date(Date.parse(sessionDate+'T00:00:00Z')-100*86400000).toISOString().slice(0,10);
  e.search=new URLSearchParams({api_token:eodhdKey,fmt:'json',from:historyStart,to:sessionDate});
  const alpha=hasAlpha?get(a,boundedFetcher).then(raw=>{
    parseOneGlobalSettlementClose({raw,source:{providerId:'alpha-vantage',symbol},signal:{mic:'XNAS',currency:'USD'},sessionDate});
    return raw;
  }):Promise.reject(Error('CLOUD_DUAL_EOD_ALPHA_KEY_MISSING'));
  const second=useIex?fetchOneGlobalAlpacaIexEod({symbol,sessionDate,fetcher:boundedFetcher,clock,env}).then(x=>x.raw):get(e,boundedFetcher);
  const results=await Promise.allSettled([alpha,second]);
  const bytes={};
  if(results[0].status==='fulfilled')bytes.alphaRaw=results[0].value;
  if(results[1].status==='fulfilled')bytes[useIex?'alpacaIexRaw':'eodhdRaw']=results[1].value;
  if(useIex&&Object.keys(bytes).length===1){
    // An Alpha HTTP-200 quota/error response is also a failure, not a quote.
    // EODHD's separate daily history can supply both the close and trend.
    if(deadline.aborted)fail('PROVIDER_TIME_BUDGET_EXHAUSTED');
    bytes.eodhdRaw=await get(e,boundedFetcher);
  }
  if(Object.keys(bytes).length!==2)throw results.find(x=>x.status==='rejected')?.reason??Error('CLOUD_DUAL_EOD_TWO_PROVIDERS_REQUIRED');
  const report=buildFirstPaperFreeEodEvidence({...bytes,symbol,sessionDate,observedAt:clock()});
  return {report,...bytes};
}
