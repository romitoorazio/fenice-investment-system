import assert from 'node:assert/strict';
import {readLatestPublicMissionSnapshot,validPublicMissionSnapshot}
  from '../lib/ui/public-mission-snapshot-runtime.mjs';

const fallback={
  generatedAt:'2026-11-20T10:00:00.000Z',mode:'live',headline:'Built-in',
  pulse:{opportunity:50,risk:30},providers:[{id:'p',name:'P',state:'operativo'}],
  markets:[{symbol:'ABC',name:'Company',assetClass:'Azioni',source:'public',score:50,risk:25}],
  macro:[],discoveries:[],warnings:[],
};
const fresh={...fallback,generatedAt:'2026-11-21T13:30:00.000Z',headline:'Fresh public research'};
assert(validPublicMissionSnapshot(fallback));
assert(validPublicMissionSnapshot(fresh));
assert(!validPublicMissionSnapshot({...fresh,markets:[{symbol:'ABC'}]}));
assert(!validPublicMissionSnapshot({...fresh,generatedAt:'not a date'}));
assert(!validPublicMissionSnapshot({...fresh,providers:null}));
const nowMs=Date.parse('2026-11-21T14:00:00.000Z');
function mockResponse(payload,{ok=true,contentLength=null}={}){
  const body=typeof payload==='string'?payload:JSON.stringify(payload);
  return {ok,headers:{get:()=>contentLength===null?String(Buffer.byteLength(body)):String(contentLength)},
    text:async()=>body};
}
let calls=0;
const read=(payload,opts={})=>readLatestPublicMissionSnapshot({
  fallback,nowMs,fetcher:async (url,request)=>{
    calls++;
    assert.equal(url,'https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/latest-snapshot.json');
    assert.equal(request.cache,'no-store');
    assert.equal(request.redirect,'error');
    return mockResponse(payload,opts);
  },
});
const good=await read(fresh);
assert.equal(good.source,'GITHUB_MAIN_PUBLIC');
assert.equal(good.snapshot.headline,'Fresh public research');
assert.equal(calls,1);
for(const payload of [
  {...fresh,generatedAt:'2026-11-19T13:30:00.000Z'},
  {...fresh,generatedAt:'2026-11-21T14:06:00.000Z'},
  {...fresh,markets:undefined},
  {...fresh,providers:[{id:4}]},
  'This is not JSON',
]){
  const got=await read(payload);
  assert.equal(got.source,'BUNDLED');
  assert.deepEqual(got.snapshot,fallback);
}
assert.equal((await read(fresh,{ok:false})).source,'BUNDLED');
assert.equal((await read(fresh,{contentLength:4_000_000})).source,'BUNDLED');
assert.equal((await readLatestPublicMissionSnapshot({
  fallback,nowMs,fetcher:async()=>{throw Error('offline');}
})).source,'BUNDLED');
assert.equal((await readLatestPublicMissionSnapshot({
  fallback,nowMs:Number.NaN,fetcher:async()=>{throw Error('should not run');}
})).source,'BUNDLED');
assert.equal(validPublicMissionSnapshot({...fresh,pulse:{risk:5}}),false);
console.log('PASS mission public read-only snapshot: newer valid JSON, stale/future/malformed/oversized/offline fail-closed fallback; no broker or ledger writes');
