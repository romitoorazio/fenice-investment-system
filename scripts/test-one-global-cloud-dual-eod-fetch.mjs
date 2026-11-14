import assert from 'node:assert/strict';
import {fetchOneGlobalCloudDualEod as collect} from '../lib/market/one-global-cloud-dual-eod-fetch.mjs';
const date='2026-11-13',now='2026-11-13T21:45:00.000Z';
const bars={};
for(let i=0;i<30;i++)bars[new Date(Date.parse(date+'T00:00:00Z')-i*86400000).toISOString().slice(0,10)]={'4. close':String(180-i)};
const a={'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':bars};
const e=[{date,close:180.1}];
let calls=0;
const fetcher=async(url,options)=>{
  calls++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.equal(url.protocol,'https:');
  assert(['www.alphavantage.co','eodhd.com'].includes(url.hostname));
  return Response.json(url.hostname==='eodhd.com'?e:a);
};
const input={symbol:'AAPL',sessionDate:date,alphaKey:'fixture-secret-key',fetcher,clock:()=>now};
const out=await collect(input);
assert.equal(calls,2);assert(Buffer.isBuffer(out.alphaRaw));assert(Buffer.isBuffer(out.eodhdRaw));
assert.equal(out.report.researchIndicator,'UPTREND_RESEARCH_ONLY');
assert.equal(out.report.paperSettlementEligible,false);
for(const status of [401,403,429,500]){
  const error=await collect({...input,fetcher:async()=>Response.json({private:'fixture-secret-key'},{status})}).catch(e=>e);
  assert.match(error.message,/^CLOUD_DUAL_EOD_[A-Z_]+$/);
  assert(!error.message.includes('fixture-secret-key'));
}
await assert.rejects(collect({...input,fetcher:async()=>new Response('x',
  {headers:{'content-type':'application/json'}})}),/EMPTY_OR_TOO_SHORT/);
await assert.rejects(collect({...input,fetcher:async()=>new Response('x'.repeat(500001),
  {headers:{'content-type':'application/json'}})}),/RESPONSE_TOO_LARGE/);
await assert.rejects(collect({...input,fetcher:async()=>new Response('<html>secret</html>',
  {headers:{'content-type':'text/html'}})}),/CONTENT_TYPE/);
await assert.rejects(collect({...input,fetcher:async()=>{throw Error('URL?apikey=private');}}),/TRANSPORT_UNAVAILABLE/);
await assert.rejects(collect({...input,fetcher:async url=>Response.json(url.hostname==='eodhd.com'?[{date,close:999}]:a)}),/INDEPENDENT_QUOTES_DIVERGE/);
const before=calls;
await assert.rejects(collect({...input,alphaKey:''}),/ALPHA_KEY_MISSING/);
await assert.rejects(collect({...input,symbol:'CBA'}),/UNSUPPORTED_IDENTITY/);
assert.equal(calls,before,'unsupported symbol/missing secret never calls providers');
console.log('PASS bounded dual-source cloud fetch: fixed HTTPS providers, private bytes, divergence, quota/auth/size/type/network redaction; no actual network.');
