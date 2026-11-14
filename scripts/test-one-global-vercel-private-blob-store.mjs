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
  assert.equal(options.useCache,false,'original journal reads must bypass stale CDN entries');
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

// Original-journal migration is allowed once in the PRIVATE store. No
// overwrite=true and no suffix are allowed under any circumstances.
let created=0;
const importSdk={
 async get(){return null;},
 async put(path,body,opts){
  assert.equal(path,PATH);
  assert.equal(opts.access,'private');
  assert.equal(opts.allowOverwrite,false);
  assert.equal(opts.addRandomSuffix,false);
  assert.equal(opts.storeId,'store_FENICE_DEMO');
  assert.equal(opts.oidcToken,'TEST_ONLY_OIDC_JWT');
  assert.equal(opts.ifMatch,undefined);
  assert.equal(opts.contentType,'application/json');
  assert.ok(body.includes('ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER_V1'));
  created++;
  if(created>1)throw Error('BlobAlreadyExistsError');
  return {etag:'"created1"'};
 }
};
const upload=await createVercelPrivateEodBlobStore({
 token:'',storeId:'store_FENICE_DEMO',oidcToken:'TEST_ONLY_OIDC_JWT',sdk:importSdk,
});
const createdFirst=await upload.createIfAbsent(JSON.stringify(newOneGlobalEodPaperLedger()));
assert.equal(createdFirst.created,true);
await assert.rejects(
 upload.createIfAbsent(JSON.stringify(newOneGlobalEodPaperLedger())),
 /BlobAlreadyExistsError/
);
assert.equal(created,2,'provider must enforce create-only conflict');
console.log('PASS Vercel private Blob mock: original journal, legacy token + OIDC scopes, CAS ifMatch, duplicate, missing original and precondition failures; NO actual store provisioned.');

// An environment OIDC token must never be pinned across awaits or rotations.
const originalEnv=process.env.VERCEL_OIDC_TOKEN;
try{
 process.env.VERCEL_OIDC_TOKEN='SYNTHETIC_FIRST_ENV_OIDC';let reads=0;
 const rotating=await createVercelPrivateEodBlobStore({token:'',storeId:'store_FENICE_DEMO',sdk:{
  async get(path,opts){assert.equal(opts.oidcToken,undefined,'SDK must resolve a fresh token each operation');
   assert.equal(opts.useCache,false);reads++;return null;},async put(){}
 }});
 await rotating.read();process.env.VERCEL_OIDC_TOKEN='SYNTHETIC_ROTATED_ENV_OIDC';
 await rotating.read();assert.equal(reads,2);
}finally{
 if(originalEnv===undefined)delete process.env.VERCEL_OIDC_TOKEN;else process.env.VERCEL_OIDC_TOKEN=originalEnv;
}
let archivedBody,archivedPath;
const archiveStore=await createVercelPrivateEodBlobStore({token:'',storeId:'store_FENICE_DEMO',sdk:{
 async put(path,body,opts){
  assert.equal(opts.access,'private');assert.equal(opts.allowOverwrite,false);
  assert.equal(opts.addRandomSuffix,false);assert.equal(opts.ifMatch,undefined);
  archivedBody=body;archivedPath=path;return {etag:'"archive"'};
 },
 async get(path,opts){assert.equal(path,archivedPath);assert.equal(opts.useCache,false);
  return {statusCode:200,blob:{etag:'"archive"'},stream:streamed(archivedBody)};}
}});
assert.deepEqual(await archiveStore.createResearchObservation({hash:'a'.repeat(64),body:'{"synthetic":true}'}),{created:true});
assert.equal(archivedPath,'fenice/one-global/private-eod/observations/'+'a'.repeat(64)+'.json');
await assert.rejects(archiveStore.createResearchObservation({hash:'../path',body:'x'}),/PRIVATE_OBSERVATION_INVALID/);
console.log('PASS Blob evidence: rotating SDK-managed OIDC, origin reads, immutable private observations and exact readback.');

let contextReads=0;
const contextStore=await createVercelPrivateEodBlobStore({token:'',storeId:'store_FENICE_DEMO',sdk:{
 async get(path,opts){
  assert.equal(path,'fenice/one-global/private-eod/settlement-inputs.json');
  assert.equal(opts.access,'private');assert.equal(opts.useCache,false);
  assert.equal(opts.storeId,'store_FENICE_DEMO');contextReads++;
  if(contextReads===1)return null;
  if(contextReads===3)return {statusCode:200,blob:{etag:'"context"',size:500001},stream:streamed('{}')};
  return {statusCode:200,blob:{etag:'"context"'},stream:streamed('{"synthetic":"original context"}')};
 },async put(){throw Error('context read must never write or generate approval');}
}});
assert.equal(await contextStore.readSettlementContext(),null);
assert.equal((await contextStore.readSettlementContext()).body,'{"synthetic":"original context"}');
await assert.rejects(contextStore.readSettlementContext(),/PRIVATE_CONTEXT_TOO_LARGE/);
console.log('PASS Blob settlement context: fixed private path, consistent read, missing originals preserved, bounded size and no generated authority.');

// Reproduce production: control-plane PUT and origin GET use distinct opaque
// identifiers. Confirmation depends on exact bytes; CAS retains the GET ETag.
for(const corrupt of [false,true]){
  let stored;
  const differing=await createVercelPrivateEodBlobStore({token:'',storeId:'store_SYNTHETIC',sdk:{
    async put(path,body,options){assert.equal(options.access,'private');stored=body;return {etag:'control-plane-version'};},
    async get(path,options){assert.equal(options.useCache,false);return {statusCode:200,blob:{etag:'"http-representation"'},stream:streamed(corrupt?stored+'CORRUPTED':stored)};}
  }});
  const archive=()=>differing.createResearchObservation({hash:'c'.repeat(64),body:'{"synthetic":"original bytes"}'});
  const context=()=>differing.writeSettlementContext({expectedEtag:null,body:'{"kind":"synthetic-original-context"}'});
  if(corrupt){
    await assert.rejects(archive(),/PRIVATE_OBSERVATION_READBACK_BODY_MISMATCH/);
    await assert.rejects(context(),/PRIVATE_CONTEXT_READBACK_BODY_MISMATCH/);
  }else{
    assert.equal((await archive()).created,true);
    assert.equal((await context()).etag,'"http-representation"');
  }
}
console.log('PASS distinct PUT/GET ETags: exact origin bytes required, corruption rejected, HTTP ETag retained for CAS.');
