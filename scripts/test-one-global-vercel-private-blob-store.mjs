import assert from 'node:assert/strict';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {createVercelPrivateEodBlobStore} from '../lib/trading/one-global-vercel-private-blob-store.mjs';
import {commitOneGlobalCloudPrivateLedger} from '../lib/trading/one-global-cloud-private-ledger.mjs';
const now='2026-11-13T22:40:00.000Z';
const initial=newOneGlobalEodPaperLedger();
const base=JSON.stringify(initial);
let body=base,etag='"v1"',calls=0;
const PATH='fenice/one-global/private-eod/original-ledger.json';
const streamed=text=>new ReadableStream({
 start(controller){controller.enqueue(new TextEncoder().encode(text));controller.close();}
});
const api={
 async get(path,options){
  assert.equal(path,PATH);
  assert.equal(options.access,'private');
  assert.equal(options.token,'TEST_ONLY_BLOB_TOKEN');
  return {statusCode:200,blob:{etag,size:Buffer.byteLength(body)},stream:streamed(body)};
 },
 async put(path,next,options){
  assert.equal(path,PATH);
  assert.equal(options.access,'private');
  assert.equal(options.ifMatch,etag);
  assert.equal(options.allowOverwrite,true);
  assert.equal(options.addRandomSuffix,false);
  assert.equal(options.token,'TEST_ONLY_BLOB_TOKEN');
  assert.equal(options.contentType,'application/json');
  calls++;body=next;etag='"v2"';
  return {etag};
 }
};
const storage=await createVercelPrivateEodBlobStore({
 token:'TEST_ONLY_BLOB_TOKEN',sdk:api,
});
const mutation=origin=>recordOneGlobalEodSignal({previousLedger:origin,nowIso:now,
 signal:{
  signalId:'fenice-xnas-aapl-cloud-replay-test',
  key:'XNAS:AAPL',mic:'XNAS',currency:'USD',side:'BUY',
  decisionAt:now,referenceSessionDate:'2026-11-13',
  referenceCloseAt:'2026-11-13T21:00:00.000Z',
  referencePublishedAt:'2026-11-13T22:15:00.000Z',
  sourceSnapshotHash:'d'.repeat(64),maxNotionalEuro:50,
  strategyReason:'UPTREND_CONFIRMATION',
  researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
 }});
const result=await commitOneGlobalCloudPrivateLedger({storage,makeNext:mutation});
assert.equal(result.committed,true);
assert.equal(result.newEvents,1);
assert.equal(result.eventKind,'SIGNAL');
assert.equal(result.virtualBuys,0);
assert.equal(result.liveTradingAllowed,false);
assert.equal(calls,1);
assert.equal(JSON.parse(body).events.length,1);
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage,makeNext:mutation}),
 /EOD_PAPER_PENDING_SIGNAL_ALREADY_EXISTS/
);
assert.equal(calls,1);
await assert.rejects(
 createVercelPrivateEodBlobStore({token:'',storeId:'',sdk:api}),
 /CLOUD_BLOB_PRIVATE_BLOB_AUTH_CONFIGURATION_MISSING/
);
const missing=await createVercelPrivateEodBlobStore({
 token:'TEST_ONLY_BLOB_TOKEN',sdk:{...api,get:async()=>null}});
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:missing,makeNext:mutation}),
 /CLOUD_PRIVATE_LEDGER_ORIGINAL_JOURNAL_NOT_MIGRATED/
);
assert.equal(calls,1);
const stale=await createVercelPrivateEodBlobStore({
 token:'TEST_ONLY_BLOB_TOKEN',sdk:{
  ...api,
  put:async()=>{throw Error('BlobPreconditionFailedError: other writer');}
 }});
await assert.rejects(
 commitOneGlobalCloudPrivateLedger({storage:stale,makeNext:origin=>{
  return recordOneGlobalEodSignal({previousLedger:origin,
   nowIso:'2026-11-13T22:45:00.000Z',
   signal:{...mutation(initial).ledger.events[0],
    signalId:'fenice-xnas-msft-cloud-replay-test',
    key:'XNAS:MSFT',decisionAt:'2026-11-13T22:45:00.000Z',
   }});
 }}),
 /CLOUD_PRIVATE_LEDGER_ATOMIC_WRITE_REJECTED_RELOAD_REQUIRED/
);
const badRead=await createVercelPrivateEodBlobStore({
 token:'TEST_ONLY_BLOB_TOKEN',sdk:{...api,
 get:async()=>({statusCode:200,blob:{etag:'"e"',size:2_000_000},
  stream:streamed('{}')})
 }});
await assert.rejects(
 badRead.read(),/CLOUD_BLOB_PRIVATE_JOURNAL_TOO_LARGE/
);
// New Vercel Blob stores attach OIDC + BLOB_STORE_ID and intentionally have
// NO permanent BLOB_READ_WRITE_TOKEN. A real Vercel Function obtains its
// short-lived credential internally; tests supply a fake OIDC token only.
let oidcBody=JSON.stringify(initial),oidcEtag='"oidc-v1"',oidcWrites=0;
const oidcSdk={
 async get(path,options){
  assert.equal(path,PATH);
  assert.equal(options.access,'private');
  assert.equal(options.storeId,'store_FENICE_DEMO');
  assert.equal(options.oidcToken,'TEST_ONLY_OIDC_JWT');
  assert.equal(options.token,undefined,'OIDC route must not require a legacy token');
  return {statusCode:200,
    blob:{etag:oidcEtag,size:Buffer.byteLength(oidcBody)},
    stream:streamed(oidcBody)};
 },
 async put(path,next,options){
  assert.equal(path,PATH);
  assert.equal(options.access,'private');
  assert.equal(options.storeId,'store_FENICE_DEMO');
  assert.equal(options.oidcToken,'TEST_ONLY_OIDC_JWT');
  assert.equal(options.token,undefined,'never attach a legacy read-write token');
  assert.equal(options.ifMatch,oidcEtag);
  assert.equal(options.allowOverwrite,true);
  assert.equal(options.addRandomSuffix,false);
  oidcBody=next;oidcEtag='"oidc-v2"';oidcWrites++;
  return {etag:oidcEtag};
 }
};
const oidcStore=await createVercelPrivateEodBlobStore({
 token:'',storeId:'store_FENICE_DEMO',
 oidcToken:'TEST_ONLY_OIDC_JWT',sdk:oidcSdk,
});
const oidcResult=await commitOneGlobalCloudPrivateLedger({
 storage:oidcStore,makeNext:mutation,
});
assert.equal(oidcResult.committed,true);
assert.equal(oidcResult.eventKind,'SIGNAL');
assert.equal(oidcResult.virtualBuys,0);
assert.equal(oidcWrites,1);
assert.equal(JSON.parse(oidcBody).events.length,1);
await assert.rejects(createVercelPrivateEodBlobStore({
 token:'',storeId:'not a store id',sdk:oidcSdk,
}),/CLOUD_BLOB_PRIVATE_BLOB_AUTH_CONFIGURATION_MISSING/);

console.log('PASS Vercel private Blob mock: original journal, legacy token + OIDC scopes, CAS ifMatch, duplicate, missing original and precondition failures; NO actual store provisioned.');
