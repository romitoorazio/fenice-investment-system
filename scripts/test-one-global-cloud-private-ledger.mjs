import assert from 'node:assert/strict';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {commitOneGlobalCloudPrivateLedger} from '../lib/trading/one-global-cloud-private-ledger.mjs';
const initial=newOneGlobalEodPaperLedger();
const now='2026-11-13T22:40:00.000Z';
const signal={
 signalId:'fenice-xnas-aapl-20261113-cloud-strict',
 key:'XNAS:AAPL',mic:'XNAS',side:'BUY',currency:'USD',
 decisionAt:now,referenceSessionDate:'2026-11-13',
 referenceCloseAt:'2026-11-13T21:00:00.000Z',
 referencePublishedAt:'2026-11-13T22:15:00.000Z',
 sourceSnapshotHash:'f'.repeat(64),maxNotionalEuro:50,
 strategyReason:'UPTREND_CONFIRMATION',researchSignalOnly:true,
 sourceRightsIndependentlyCertified:false,
};
const oneEvent=original=>recordOneGlobalEodSignal({previousLedger:original,nowIso:now,signal});
function backend(value=JSON.stringify(initial)){
 let body=value,etag='"etag-1"',writes=0;
 return {
  privateAccess:true,durable:true,atomicCompareAndSwap:true,
  async read(){return body===null?null:{body,etag};},
  async compareAndSwap(next){
   if(next.expectedEtag!==etag)throw Error('CONCURRENT_WRITER');
   if(next.contentType!=='application/json')throw Error('WRONG_TYPE');
   writes++;body=next.body;etag='"etag-'+(writes+1)+'"';
   return {committed:true,etag};
  },
  get body(){return body;},
  get writes(){return writes;},
  race(){etag='"other-writer"';}
 };
}
const b=backend();
const out=await commitOneGlobalCloudPrivateLedger({storage:b,makeNext:oneEvent});
assert.equal(out.committed,true);
assert.equal(out.newEvents,1);
assert.equal(out.eventKind,'SIGNAL');
assert.equal(out.virtualBuys,0);
assert.equal(out.liveTradingAllowed,false);
assert.equal(out.brokerConnectivityAllowed,false);
assert.equal(out.certifiedTrades,0);
assert.equal(b.writes,1);
assert.equal(replayOneGlobalEodPaperLedger(JSON.parse(b.body)).valid,true);
assert.equal(initial.events.length,0,'original input remains immutable');
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:b,makeNext:oneEvent}),
 /EOD_PAPER_PENDING_SIGNAL_ALREADY_EXISTS/,
 'duplicate id/signal cannot be appended again'
);
assert.equal(b.writes,1,'duplicate never writes');
const missing=backend(null);
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:missing,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_ORIGINAL_JOURNAL_NOT_MIGRATED/
);
assert.equal(missing.writes,0,'missing original never auto-boots an empty ledger');
const publicStore={...backend(),privateAccess:false};
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:publicStore,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_AUTHENTICATED_DURABLE_CAS_STORE_REQUIRED/
);
const volatileStore={...backend(),durable:false};
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:volatileStore,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_AUTHENTICATED_DURABLE_CAS_STORE_REQUIRED/
);
const noCAS={...backend(),atomicCompareAndSwap:false};
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:noCAS,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_AUTHENTICATED_DURABLE_CAS_STORE_REQUIRED/
);
const corrupted=backend('{"version":1,"mode":"BOGUS","events":[]}');
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:corrupted,makeNext:oneEvent}),
 /EOD_PAPER_LEDGER_SCHEMA_OR_SAFETY_INVALID/
);
assert.equal(corrupted.writes,0);
const overAppend=backend();
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:overAppend,makeNext:origin=>{
   const a=oneEvent(origin).ledger;
   const second=recordOneGlobalEodSignal({previousLedger:a,
     nowIso:'2026-11-13T22:41:00.000Z',signal:{
      ...signal,key:'XNAS:MSFT',signalId:'fenice-xnas-msft-20261113-cloud',
      decisionAt:'2026-11-13T22:41:00.000Z',
     }}).ledger;
   return second;
 }}),
 /CLOUD_PRIVATE_LEDGER_NOT_EXACTLY_ONE_VALID_FORWARD_EVENT/
);
assert.equal(overAppend.writes,0);
const concurrent=backend();
const version=concurrent.compareAndSwap.bind(concurrent);
concurrent.compareAndSwap=async args=>{concurrent.race();return version(args);};
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:concurrent,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_ATOMIC_WRITE_REJECTED_RELOAD_REQUIRED/
);
assert.equal(concurrent.writes,0,'CAS conflict must never overwrite the other writer');
const unconfirmed=backend();
unconfirmed.compareAndSwap=async()=>({committed:false,etag:'"ambiguous"'});
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:unconfirmed,makeNext:oneEvent}),
 /CLOUD_PRIVATE_LEDGER_ATOMIC_WRITE_NOT_CONFIRMED/
);
console.log('PASS private cloud journal: strict engine replay, single event, no reset, no public/volatile store, real ETag CAS, no Directa.');
