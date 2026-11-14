/** Bounded server-side research intake. Exact existing demo universe, never a fill. */
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
  clock=()=>new Date().toISOString()}={}){
  if(!['AAPL','MSFT','TSLA'].includes(symbol)||!/^\d{4}-\d\d-\d\d$/.test(sessionDate||''))fail('UNSUPPORTED_IDENTITY');
  if(typeof alphaKey!=='string'||!/^[-_A-Za-z0-9]{8,120}$/.test(alphaKey))fail('ALPHA_KEY_MISSING');
  if(typeof eodhdKey!=='string'||!/^[-_A-Za-z0-9]{4,150}$/.test(eodhdKey))fail('EODHD_KEY_INVALID');
  const a=new URL('https://www.alphavantage.co/query');
  a.search=new URLSearchParams({function:'TIME_SERIES_DAILY',symbol,outputsize:'compact',apikey:alphaKey});
  const e=new URL('https://eodhd.com/api/eod/'+symbol+'.US');
  e.search=new URLSearchParams({api_token:eodhdKey,fmt:'json',from:sessionDate,to:sessionDate});
  const results=await Promise.allSettled([get(a,fetcher),get(e,fetcher)]);
  const failure=results.find(x=>x.status==='rejected');if(failure)throw failure.reason;
  const [alphaRaw,eodhdRaw]=results.map(x=>x.value);
  const report=buildFirstPaperFreeEodEvidence({alphaRaw,eodhdRaw,symbol,sessionDate,observedAt:clock()});
  return {report,alphaRaw,eodhdRaw};
}
