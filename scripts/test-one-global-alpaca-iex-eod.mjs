import assert from 'node:assert/strict';
import {fetchOneGlobalAlpacaIexEod as get,parseOneGlobalAlpacaIexDaily as parse} from '../lib/market/one-global-alpaca-iex-eod.mjs';
import {fetchOneGlobalCloudDualEod as collect} from '../lib/market/one-global-cloud-dual-eod-fetch.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod} from '../lib/trading/one-global-prospective-dual-eod-bridge.mjs';
import {newOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
const date='2026-11-13',now='2026-11-13T21:45:00.000Z';
const env={APCA_API_KEY_ID:'SYNTHETIC_KEY_ID',APCA_API_SECRET_KEY:'SYNTHETIC_SECRET_KEY'};
const bar=(t='2026-11-13T05:00:00Z')=>({t,o:179,h:181,l:178,c:180,v:1000,n:100});
const body=(b=bar())=>({symbol:'AAPL',feed:'iex',bars:[b],next_page_token:null});
let hits=0;
const iex=async(u,o)=>{
  hits++;assert.equal(u.origin,'https://data.alpaca.markets');
  assert.equal(u.pathname,'/v2/stocks/AAPL/bars');assert.equal(u.searchParams.get('feed'),'iex');
  assert.equal(u.searchParams.get('adjustment'),'raw');assert.equal(u.searchParams.get('timeframe'),'1Day');
  assert.equal(u.searchParams.get('asof'),date);assert.equal(o.method,'GET');
  assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  assert.equal(o.headers['APCA-API-KEY-ID'],env.APCA_API_KEY_ID);
  assert.equal(o.headers['APCA-API-SECRET-KEY'],env.APCA_API_SECRET_KEY);
  return Response.json(body());
};
const got=await get({symbol:'AAPL',sessionDate:date,env,clock:()=>now,fetcher:iex});
assert.equal(got.receipt.close,180);
assert.equal(got.receipt.providerId,'alpaca-iex');
assert.equal(got.receipt.feed,'iex');
assert.equal(got.receipt.priceScope,'US_IEX_SINGLE_VENUE_DAILY_CLOSE_NOT_CONSOLIDATED');
assert.equal(got.receipt.transport,'FIXED_HTTPS_ORIGIN_NO_REDIRECT');
assert.equal(hits,1);
for(const d of [body({...bar(),c:999}),body({...bar(),n:0}),body({...bar(),t:'2026-11-12T05:00:00Z'}),
  {...body(),feed:'sip'},{...body(),symbol:'MSFT'},{...body(),bars:[bar(),bar()]},
  {...body(),next_page_token:'more'},{code:42210000,message:'SYNTHETIC_SECRET'}])
  assert.throws(()=>parse({raw:Buffer.from(JSON.stringify(d)),symbol:'AAPL',sessionDate:date}));
for(const patch of [{env:{}},{symbol:'../orders'},{mic:'XASX'},{currency:'AUD'},
  {sessionDate:'2026-11-14'},{clock:()=> '2026-11-13T21:20:00.000Z'},
  {clock:()=> '2026-11-13T05:00:00.000Z'}]){
  const old=hits;await assert.rejects(get({symbol:'AAPL',sessionDate:date,env,
    clock:()=>now,fetcher:iex,...patch}));
  assert.equal(hits,old,'malformed or preclose input must make no HTTP request');
}
for(const status of [401,403,422,429,500])await assert.rejects(get({symbol:'AAPL',sessionDate:date,env,clock:()=>now,
  fetcher:async()=>Response.json({message:'SECRET'},{status})}),e=>{
   assert.match(e.message,/^CLOUD_SETTLEMENT_SOURCE_ALPACA_IEX_[A-Z_]+$/);assert(!e.message.includes('SECRET'));return true;
  });
const summer=await get({symbol:'AAPL',sessionDate:'2026-07-10',env,clock:()=> '2026-07-11T12:00:00.000Z',
  fetcher:async(u)=>{assert.equal(u.searchParams.get('feed'),'iex');
    assert.equal(u.searchParams.get('start'),'2026-07-10T04:00:00.000Z');
    assert.equal(u.searchParams.get('end'),'2026-07-11T03:59:59.999Z');
    return Response.json(body(bar('2026-07-10T04:00:00Z')));}});
assert.equal(summer.receipt.sessionDate,'2026-07-10');
const alphaBars={};
for(let i=0;i<30;i++)alphaBars[new Date(Date.parse(date+'T00:00:00Z')-i*86400000)
  .toISOString().slice(0,10)]={'4. close':String(180-i)};
const alpha={'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':alphaBars};
let visited=[];
const paired=await collect({symbol:'AAPL',sessionDate:date,alphaKey:'SYNTHETIC_ALPHA_KEY',
  env,clock:()=>now,fetcher:async(u,o)=>{visited.push(u.hostname);
    if(u.hostname==='www.alphavantage.co')return Response.json(alpha);
    assert.equal(u.searchParams.get('feed'),'iex','Paper Basic must not query SIP');
    return iex(u,o);
  }});
assert.deepEqual(visited.sort(),['data.alpaca.markets','www.alphavantage.co']);
assert.equal(paired.alpacaRaw,undefined);
assert(Buffer.isBuffer(paired.alpacaIexRaw));
assert.deepEqual(paired.report.sources.map(s=>s.providerId),['alpha-vantage','alpaca-iex']);
assert.equal(paired.report.comparisonScope,'IEX_SINGLE_VENUE_VS_OTHER_SOURCE_NOT_CONSOLIDATED');
assert.equal(paired.report.paperSettlementEligible,false);
assert.equal(paired.report.paperDataRightsEstablished,false);
assert.equal(paired.report.researchIndicator,'UPTREND_RESEARCH_ONLY');
const signal=buildOneGlobalProspectiveSignalFromDualEod({report:paired.report,previousLedger:newOneGlobalEodPaperLedger(),nowIso:now});
assert.equal(signal.kind,'SIGNAL');
assert.equal(signal.paperFillCreated,false);
assert.equal(signal.independentlyVerifiedProviderRights,false);
assert.equal(signal.liveTradingAllowed,false);
const forged={...paired.report,comparisonScope:'US_CONSOLIDATED_DAILY_CLOSE'};
assert.throws(()=>buildOneGlobalProspectiveSignalFromDualEod({report:forged,previousLedger:newOneGlobalEodPaperLedger(),nowIso:now}),
  /TWO_SOURCE_METADATA_INVALID/);
console.log('PASS USA Paper Basic IEX: historical IEX only, NY DST, strict raw identity, no SIP fallback, no fake consolidated close, no PAPER FILL or broker calls. SYNTHETIC fixtures only.');
