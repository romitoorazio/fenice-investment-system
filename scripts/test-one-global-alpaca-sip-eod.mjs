import assert from 'node:assert/strict';
import {fetchOneGlobalAlpacaSipEod as get,parseOneGlobalAlpacaSipDaily as parse} from '../lib/market/one-global-alpaca-sip-eod.mjs';
import {fetchOneGlobalCloudDualEod as pair} from '../lib/market/one-global-cloud-dual-eod-fetch.mjs';
import {fetchOneGlobalSettlementSource as settleSource} from '../lib/market/one-global-cloud-settlement-sources.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod as prospective} from '../lib/trading/one-global-prospective-dual-eod-bridge.mjs';
import {runOneGlobalCloudProspectiveCycle} from '../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {recordOneGlobalEodSignal,newOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
const env={APCA_API_KEY_ID:'SYNTHETIC_KEY_ID',APCA_API_SECRET_KEY:'SYNTHETIC_SECRET_KEY'};
const now='2026-11-13T21:45:00.000Z',date='2026-11-13';
const bar=(t='2026-11-13T05:00:00Z')=>({t,o:179,h:181,l:178,c:180,v:1000,n:100});
const data=(b=bar())=>({symbol:'AAPL',bars:[b],next_page_token:null});
let calls=0,lastUrl;
const fetcher=async(u,o)=>{
  calls++;lastUrl=new URL(u);assert.equal(lastUrl.origin,'https://data.alpaca.markets');
  assert.equal(lastUrl.pathname,'/v2/stocks/AAPL/bars');assert.equal(o.method,'GET');
  assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  assert.equal(o.headers['APCA-API-KEY-ID'],env.APCA_API_KEY_ID);
  assert.equal(o.headers['APCA-API-SECRET-KEY'],env.APCA_API_SECRET_KEY);
  assert.equal(lastUrl.searchParams.get('feed'),'sip');assert.equal(lastUrl.searchParams.get('adjustment'),'raw');
  assert.equal(lastUrl.searchParams.get('timeframe'),'1Day');assert.equal(lastUrl.searchParams.get('asof'),date);
  assert(Date.parse(now)-Date.parse(lastUrl.searchParams.get('end'))>=16*60000);
  return Response.json(data());
};
const input={symbol:'AAPL',sessionDate:date,env,clock:()=>now,fetcher};
const got=await get(input);assert.equal(got.receipt.close,180);assert.equal(got.receipt.feed,'sip');
assert.equal(got.receipt.priceScope,'US_CONSOLIDATED_DAILY_CLOSE');assert.equal(calls,1);
assert.equal(lastUrl.searchParams.get('start'),'2026-11-13T05:00:00.000Z');
for(const patch of [{env:{}},{mic:'XASX'},{currency:'AUD'},{symbol:'../orders'},{sessionDate:'2026-02-30'},
  {sessionDate:'2026-11-14'},{clock:()=> '2026-11-13T21:20:00.000Z'},{clock:()=> '2026-11-13T05:00:00.000Z'}]){
  const before=calls;await assert.rejects(get({...input,...patch}));assert.equal(calls,before);
}
for(const d of [{...data(),symbol:'MSFT'},{...data(),feed:'iex'},{...data(),currency:'AUD'},
  {...data(),next_page_token:'more'},data(bar('2026-11-12T05:00:00Z')),data(bar('2026-11-13T04:00:00Z')),
  {...data(),bars:[bar(),bar()]},data({...bar(),c:500}),data({...bar(),n:0}),{code:42210000,message:'SECRET'}]){
  assert.throws(()=>parse({raw:Buffer.from(JSON.stringify(d)),symbol:'AAPL',sessionDate:date}));
}
for(const status of [401,403,422,429,500])await assert.rejects(get({...input,fetcher:async()=>Response.json({message:'SYNTHETIC_SECRET_KEY'},{status})}),e=>{
  assert.match(e.message,/^CLOUD_SETTLEMENT_SOURCE_ALPACA_[A-Z_]+$/);assert(!e.message.includes('SYNTHETIC_SECRET_KEY'));return true;
});
await assert.rejects(get({...input,fetcher:async()=>new Response('x'.repeat(500001),{headers:{'Content-Type':'application/json'}})}),/BODY_TOO_LARGE/);
await assert.rejects(get({...input,fetcher:async()=>{throw Error('SYNTHETIC_SECRET_KEY');}}),/TRANSPORT_UNAVAILABLE/);
// DST and a complete previous-day bar use New York midnight, never UTC dates.
const summer=await get({...input,sessionDate:'2026-07-10',clock:()=> '2026-07-11T12:00:00.000Z',fetcher:async(u)=>{
  assert.equal(u.searchParams.get('start'),'2026-07-10T04:00:00.000Z');
  assert.equal(u.searchParams.get('end'),'2026-07-11T03:59:59.999Z');return Response.json(data(bar('2026-07-10T04:00:00Z')));
}});assert.equal(summer.receipt.sessionDate,'2026-07-10');
const alphaBars={};for(let i=0;i<30;i++)alphaBars[new Date(Date.parse(date+'T00:00:00Z')-i*86400000).toISOString().slice(0,10)]={'4. close':String(180-i)};
const alpha={'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':alphaBars};
let hosts=[];
const combined=await pair({symbol:'AAPL',sessionDate:date,alphaKey:'SYNTHETIC_ALPHA_KEY',env,clock:()=>now,fetcher:async(u,o)=>{
  hosts.push(u.hostname);if(u.hostname==='www.alphavantage.co'){
    assert.equal(o.headers['APCA-API-SECRET-KEY'],undefined);return Response.json(alpha);
  }assert.equal(u.searchParams.get('feed'),'iex');return Response.json({...data(),feed:'iex'});
}});
assert.deepEqual(hosts.sort(),['data.alpaca.markets','www.alphavantage.co']);
assert.equal(combined.report.sources[1].providerId,'alpaca-iex');assert.equal(combined.report.paperSettlementEligible,false);
assert(Buffer.isBuffer(combined.alpacaIexRaw));assert.equal(combined.alpacaRaw,undefined);assert.equal(combined.eodhdRaw,undefined);
const signal=prospective({report:combined.report,previousLedger:newOneGlobalEodPaperLedger(),nowIso:now});
assert.equal(signal.kind,'SIGNAL');assert.equal(signal.paperFillCreated,false);
const source={providerId:'alpaca-sip',sourceFamily:'SYNTHETIC-reviewed-direct-sip',key:'XNAS:AAPL',mic:'XNAS',currency:'USD',symbol:'AAPL'};
const receipt=await settleSource({source,signal:{key:'XNAS:AAPL',mic:'XNAS',currency:'USD'},sessionDate:date,env,fetcher,clock:()=>now});
assert.equal(receipt.receipt.sourceFamily,source.sourceFamily);
await assert.rejects(settleSource({source:{...source,key:'XNAS:MSFT'},signal:{key:'XNAS:MSFT',mic:'XNAS',currency:'USD'},sessionDate:date,env,fetcher,clock:()=>now}),/SYMBOL_MISMATCH/);
console.log('PASS Alpaca SIP EOD: existing keys only, fixed DATA GET, explicit historical cutoff, raw daily semantics, US identity, DST/date/OHLCV/pagination, no IEX fallback, credential isolation, research bridge and settlement transport. SYNTHETIC fixtures only.');

let fallbackHosts=[];
const fallback=await pair({symbol:'AAPL',sessionDate:date,alphaKey:'SYNTHETIC_ALPHA_KEY',env,clock:()=>now,fetcher:async(u,o)=>{
 fallbackHosts.push(u.hostname);
 if(u.hostname==='www.alphavantage.co')return Response.json(alpha);
 if(u.hostname==='data.alpaca.markets')return Response.json({message:'SYNTHETIC_PRIVATE_FAILURE'},{status:403});
 assert.equal(u.origin,'https://eodhd.com');assert.equal(o.headers['APCA-API-SECRET-KEY'],undefined);
 return Response.json([{date,close:180.1}]);
}});
assert.equal(fallback.report.sources[1].providerId,'eodhd');assert.equal(fallback.alpacaRaw,undefined);
assert.deepEqual(fallbackHosts.sort(),['data.alpaca.markets','eodhd.com','www.alphavantage.co']);

// A quota/error body with HTTP 200 must not make Alpha a permanent single
// point of failure: the actual EODHD history and SIP bytes form the pair.
const eodHistory=Object.entries(alphaBars).map(([date,r])=>({date,close:Number(r['4. close'])}));
for(const alphaKey of ['SYNTHETIC_ALPHA_KEY','']){
 const recovered=await pair({symbol:'AAPL',sessionDate:date,alphaKey,env,clock:()=>now,fetcher:async(u,o)=>{
  if(u.hostname==='www.alphavantage.co')return Response.json({Information:'quota exhausted'});
  if(u.hostname==='data.alpaca.markets'){assert.equal(u.searchParams.get('feed'),'iex');return Response.json({...data(),feed:'iex'});}
  assert.equal(u.hostname,'eodhd.com');assert(u.searchParams.get('from')<date);return Response.json(eodHistory);
 }});
 assert.equal(recovered.alphaRaw,undefined);assert(Buffer.isBuffer(recovered.eodhdRaw));assert(Buffer.isBuffer(recovered.alpacaIexRaw));
 assert.deepEqual(recovered.report.sources.map(x=>x.providerId),['eodhd','alpaca-iex']);
 assert.equal(recovered.report.researchIndicator,'UPTREND_RESEARCH_ONLY');
 const decision=prospective({report:recovered.report,previousLedger:newOneGlobalEodPaperLedger(),nowIso:now});
 assert.equal(decision.kind,'SIGNAL');assert.equal(decision.paperFillCreated,false);
 let journal=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-12T22:00:00.000Z',
  signal:{signalId:'synthetic-existing-original',key:'XNAS:OTHER',mic:'XNAS',currency:'USD',side:'BUY',decisionAt:'2026-11-12T22:00:00.000Z',
   referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T21:00:00.000Z',referencePublishedAt:'2026-11-12T21:30:00.000Z',
   sourceSnapshotHash:'a'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
 let archived=0,archivedBody=null,archivedHash=null;
 const storage={privateAccess:true,durable:true,atomicCompareAndSwap:true,
  async read(){return {etag:'"original"',body:JSON.stringify(journal)};},
  async createResearchObservation({hash,body}){const payload=JSON.parse(body);
   assert.equal(payload.alphaRawBase64,undefined);assert.equal(typeof payload.eodhdRawBase64,'string');
   assert.equal(typeof payload.alpacaIexRawBase64,'string');
   archivedBody=body;archivedHash=hash;archived++;return {created:true};},
  async readResearchObservation(hash){
   return hash===archivedHash?{body:Buffer.from(archivedBody),uploadedAt:new Date(now),
     uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'}:null;
  },
  async compareAndSwap({body,expectedEtag}){assert.equal(archived,1);assert.equal(expectedEtag,'"original"');
   journal=JSON.parse(body);return {committed:true,etag:'"new"'};}};
 const committed=await runOneGlobalCloudProspectiveCycle({storage,clock:()=>now,collect:async()=>recovered});
 assert.equal(committed.newSignals,1);assert.equal(committed.paperFillsCreated,0);
 assert.equal(journal.events.length,2);assert.equal(journal.events.at(-1).kind,'SIGNAL');
}
