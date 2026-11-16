/** Paper Basic authorised IEX-only historical EOD observation.
 * NOT the consolidated SIP close, a PAPER fill, or a licence attestation.
 * GET data only: never call Alpaca paper/live ORDER endpoints.
 */
import {createHash} from 'node:crypto';
import {alpacaSipCredentialsPresent} from './one-global-alpaca-sip-eod.mjs';
const fail=x=>{throw Error('CLOUD_SETTLEMENT_SOURCE_ALPACA_IEX_'+x);};
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function ny(time){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(new Date(time)).map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
function midnight(date){
  for(const hour of [4,5]){const time=date+'T0'+hour+':00:00.000Z',p=ny(time);
    if(p.date===date&&p.hour===0&&p.minute===0)return Date.parse(time);}
  fail('TIMEZONE_INVALID');
}
export function parseOneGlobalAlpacaIexDaily({raw,symbol,sessionDate}={}){
  if(!Buffer.isBuffer(raw)||raw.length<10||raw.length>500000||!day(sessionDate))fail('RAW_REQUIRED');
  let data;try{data=JSON.parse(raw.toString('utf8'));}catch{fail('JSON_INVALID');}
  if(data?.code||data?.message||data?.error)fail('PROVIDER_ERROR_OR_ENTITLEMENT');
  if(data?.symbol!==symbol||!Array.isArray(data.bars)||data.bars.length!==1
    ||data.next_page_token!==null&&data.next_page_token!==undefined
    ||data.feed!==undefined&&data.feed!=='iex'||data.currency!==undefined&&data.currency!=='USD')
    fail('IEX_SYMBOL_FEED_OR_DAILY_SERIES_MISMATCH');
  const bar=data.bars[0],stamp=Date.parse(bar?.t);
  if(!Number.isFinite(stamp)||stamp!==midnight(sessionDate))fail('EXACT_NY_DATE_MISSING');
  if(['o','h','l','c'].some(k=>typeof bar[k]!=='number'||!Number.isFinite(bar[k])||bar[k]<=0)
    ||bar.h<Math.max(bar.o,bar.c,bar.l)||bar.l>Math.min(bar.o,bar.c,bar.h)
    ||typeof bar.v!=='number'||!Number.isFinite(bar.v)||bar.v<=0
    ||!Number.isSafeInteger(bar.n)||bar.n<=0)fail('IEX_OHLCV_INVALID');
  return bar.c;
}
export async function fetchOneGlobalAlpacaIexEod({symbol,mic='XNAS',currency='USD',sessionDate,
  env=process.env,fetcher=fetch,clock=()=>new Date().toISOString()}={}){
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.]{0,19}$/.test(symbol)
    ||!['XNAS','XNYS'].includes(mic)||currency!=='USD'||!day(sessionDate)
    ||[0,6].includes(new Date(sessionDate+'T12:00:00Z').getUTCDay()))fail('IDENTITY_OR_DATE_INVALID');
  if(!alpacaSipCredentialsPresent(env))fail('EXISTING_PAPER_KEYS_MISSING');
  const before=clock();if(!iso(before))fail('CLOCK_INVALID');
  const time=Date.parse(before),local=ny(time),start=midnight(sessionDate);
  if(local.date<sessionDate||time-start>4*86400000
    ||local.date===sessionDate&&local.hour*60+local.minute<16*60+35)fail('INCOMPLETE_OR_STALE_SESSION');
  const following=new Date(Date.parse(sessionDate+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const end=Math.min(midnight(following)-1,time-16*60000);
  const url=new URL('https://data.alpaca.markets/v2/stocks/'+symbol+'/bars');
  url.search=new URLSearchParams({timeframe:'1Day',feed:'iex',adjustment:'raw',asof:sessionDate,
    start:new Date(start).toISOString(),end:new Date(end).toISOString(),limit:'2',sort:'asc'});
  let raw;
  try{
    const response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',
        'APCA-API-KEY-ID':env.APCA_API_KEY_ID||env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY||env.ALPACA_API_SECRET}});
    if(!response.ok){
      if([401,403,422].includes(response.status))fail('AUTH_OR_ENTITLEMENT_DENIED');
      if(response.status===429)fail('RATE_LIMIT');fail('HTTP_REJECTED');
    }
    if(!/application\/json/.test(response.headers.get('content-type')||''))fail('CONTENT_TYPE');
    const reader=response.body?.getReader();if(!reader)fail('BODY_MISSING');
    let size=0;const chunks=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>500000){await reader.cancel();fail('BODY_TOO_LARGE');}
      chunks.push(Buffer.from(value));}}
    finally{reader.releaseLock();}
    raw=Buffer.concat(chunks);
  }catch(error){
    if(/^CLOUD_SETTLEMENT_SOURCE_ALPACA_IEX_[A-Z_]+$/.test(error?.message||''))throw error;
    fail('TRANSPORT_UNAVAILABLE');
  }
  const close=parseOneGlobalAlpacaIexDaily({raw,symbol,sessionDate}),observedAt=clock();
  if(!iso(observedAt)||observedAt<before)fail('CLOCK_INVALID');
  return {raw,receipt:{providerId:'alpaca-iex',sourceFamily:'alpaca-iex',key:mic+':'+symbol,
    mic,currency,sessionDate,close,payloadSha256:createHash('sha256').update(raw).digest('hex'),
    observedAt,publishedAt:observedAt,feed:'iex',adjustment:'raw',
    priceScope:'US_IEX_SINGLE_VENUE_DAILY_CLOSE_NOT_CONSOLIDATED',
    timestampMeaning:'FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE',
    transport:'FIXED_HTTPS_ORIGIN_NO_REDIRECT',simulatedOrSynthetic:false}};
}
