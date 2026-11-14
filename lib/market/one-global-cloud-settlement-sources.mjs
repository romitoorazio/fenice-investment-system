/** Fixed-origin, bounded EOD receipts. A provider name never proves upstream independence. */
import {createHash} from 'node:crypto';
const fail=code=>{throw Error('CLOUD_SETTLEMENT_SOURCE_'+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)
  &&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const positive=x=>(typeof x==='number'||typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x))
  &&Number.isFinite(Number(x))&&Number(x)>0;
const keyOk=x=>typeof x==='string'&&/^[-_A-Za-z0-9]{4,150}$/.test(x);

export async function readOneGlobalBoundedSource(url,{fetcher=fetch,accept='application/json',maxBytes=500000}={}){
  try{
    const response=await fetcher(url,{redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(10000),headers:{Accept:accept}});
    if(!response.ok){
      if([401,403].includes(response.status))fail('AUTH_OR_PLAN_DENIED');
      if(response.status===429)fail('RATE_LIMIT');
      fail('HTTP_REJECTED');
    }
    if(!/json|xml|csv|text\/plain/.test(response.headers.get('content-type')||''))fail('CONTENT_TYPE');
    const reader=response.body?.getReader();if(!reader)fail('BODY_MISSING');
    let size=0;const parts=[];
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;
        size+=value.length;if(size>maxBytes){await reader.cancel();fail('BODY_TOO_LARGE');}
        parts.push(Buffer.from(value));}
    }finally{reader.releaseLock();}
    if(size<10)fail('BODY_EMPTY');
    return Buffer.concat(parts);
  }catch(error){
    if(/^CLOUD_SETTLEMENT_SOURCE_[A-Z_]+$/.test(error?.message||''))throw error;
    fail('TRANSPORT_UNAVAILABLE');
  }
}

/** Parse the exact unadjusted daily row, not a current quote or adjusted_close. */
export function parseOneGlobalSettlementClose({raw,source,signal,sessionDate}){
  if(!Buffer.isBuffer(raw)||raw.length<10||raw.length>500000||!day(sessionDate))fail('RAW_RECEIPT_REQUIRED');
  let data;try{data=JSON.parse(raw.toString('utf8'));}catch{fail('JSON_INVALID');}
  if(data?.Information||data?.Note||data?.['Error Message']||data?.status==='error'||data?.error)fail('PROVIDER_ERROR_OR_LIMIT');
  let close;
  if(source.providerId==='alpha-vantage'){
    if(data?.['Meta Data']?.['2. Symbol']!==source.symbol)fail('SYMBOL_MISMATCH');
    close=data?.['Time Series (Daily)']?.[sessionDate]?.['4. close'];
  }else if(source.providerId==='eodhd'){
    if(!Array.isArray(data)||data.length>366)fail('DATED_SERIES_REQUIRED');
    const rows=data.filter(r=>r?.date===sessionDate);
    if(rows.length!==1)fail('EXACT_SESSION_MISSING_OR_DUPLICATED');
    if(rows[0].symbol!==undefined&&rows[0].symbol!==source.symbol)fail('SYMBOL_MISMATCH');
    close=rows[0].close;
  }else if(source.providerId==='twelve-data'){
    if(data?.meta?.symbol!==source.symbol||data?.meta?.mic_code!==signal.mic
      ||data?.meta?.currency!==signal.currency||data?.meta?.interval!=='1day')fail('IDENTITY_OR_DAILY_INTERVAL_MISMATCH');
    if(!Array.isArray(data.values)||data.values.length>366)fail('DATED_SERIES_REQUIRED');
    const rows=data.values.filter(r=>r?.datetime===sessionDate);
    if(rows.length!==1)fail('EXACT_SESSION_MISSING_OR_DUPLICATED');
    close=rows[0].close;
  }else fail('PROVIDER_NOT_SUPPORTED');
  if(!positive(close))fail('EXACT_UNADJUSTED_CLOSE_MISSING');
  return Number(close);
}

export async function fetchOneGlobalSettlementSource({source,signal,sessionDate,
  fetcher=fetch,clock=()=>new Date().toISOString(),env=process.env}={}){
  if(!source||source.key!==signal?.key||source.mic!==signal.mic||source.currency!==signal.currency
    ||typeof source.symbol!=='string'||!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(source.symbol)
    ||!day(sessionDate))fail('REVIEWED_MAPPING_REQUIRED');
  let url;
  if(source.providerId==='alpha-vantage'){
    if(!keyOk(env.ALPHA_VANTAGE_API_KEY)||env.ALPHA_VANTAGE_API_KEY==='demo')fail('ALPHA_KEY_MISSING');
    url=new URL('https://www.alphavantage.co/query');
    url.search=new URLSearchParams({function:'TIME_SERIES_DAILY',symbol:source.symbol,
      outputsize:'compact',apikey:env.ALPHA_VANTAGE_API_KEY});
  }else if(source.providerId==='eodhd'){
    const token=env.EODHD_API_TOKEN||'demo';
    if(!keyOk(token))fail('EODHD_KEY_INVALID');
    // A free DEMO request cannot grant non-demo exchange access.
    if(token==='demo'&&!['AAPL.US','MSFT.US','TSLA.US'].includes(source.symbol))fail('EODHD_FREE_KEY_REQUIRED_FOR_THIS_SYMBOL');
    url=new URL('https://eodhd.com/api/eod/'+source.symbol);
    url.search=new URLSearchParams({api_token:token,fmt:'json',from:sessionDate,to:sessionDate});
  }else if(source.providerId==='twelve-data'){
    const token=env.TWELVE_DATA_API_KEY||env.TWELVEDATA_API_KEY;
    if(!keyOk(token)||token==='demo')fail('TWELVE_DATA_KEY_MISSING');
    url=new URL('https://api.twelvedata.com/time_series');
    url.search=new URLSearchParams({symbol:source.symbol,mic_code:signal.mic,interval:'1day',
      start_date:sessionDate,end_date:sessionDate,outputsize:'1',adjust:'none',format:'JSON',apikey:token});
  }else fail('PROVIDER_NOT_SUPPORTED');
  const raw=await readOneGlobalBoundedSource(url,{fetcher});
  const observedAt=clock();if(!iso(observedAt))fail('CLOCK_INVALID');
  const close=parseOneGlobalSettlementClose({raw,source,signal,sessionDate});
  return {raw,receipt:{providerId:source.providerId,sourceFamily:source.sourceFamily,
    key:signal.key,mic:signal.mic,currency:signal.currency,sessionDate,close,
    payloadSha256:sha(raw),publishedAt:observedAt,observedAt,
    timestampMeaning:'FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE',
    transport:'FIXED_HTTPS_ORIGIN_NO_REDIRECT',simulatedOrSynthetic:false}};
}
