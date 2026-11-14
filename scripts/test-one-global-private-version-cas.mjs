import assert from 'node:assert/strict';
import {createVercelPrivateEodBlobStore} from '../lib/trading/one-global-vercel-private-blob-store.mjs';
const context='fenice/one-global/private-eod/settlement-inputs.json';
const ledger='fenice/one-global/private-eod/original-ledger.json';
const body='{"kind":"SYNTHETIC-original-context-only"}\n';
function provider(){
  const objects=new Map([[context,{body,version:1}],[ledger,{body,version:1}]]);
  let mutateHead=false,badSize=false,writes=0,headFail=false;
  const sdk={async get(path,options){assert.equal(options.useCache,false);assert.equal(options.access,'private');
    const x=objects.get(path);if(!x)return null;
    return {statusCode:200,blob:{etag:'"http-content-'+x.version+'"',size:Buffer.byteLength(x.body)},stream:new Response(x.body).body};},
   async head(path,options){assert.equal(options.storeId,'store_SYNTHETIC');
    if(headFail)throw Error('PRIVATE-SDK-EXCEPTION-DO-NOT-PRINT');
    const x=objects.get(path),result={etag:'"control-version-'+x.version+'"',size:Buffer.byteLength(x.body)+(badSize?1:0)};
    if(mutateHead)objects.set(path,{version:x.version+1,body:x.body+'CHANGED'});
    return result;},
   async put(path,next,options){const x=objects.get(path);
    assert.equal(options.allowOverwrite,true);
    if(options.ifMatch!=='"control-version-'+x.version+'"')throw Error('SYNTHETIC_PRECONDITION_FAILED');
    writes++;objects.set(path,{body:next,version:x.version+1});return {etag:'"control-version-'+(x.version+1)+'"'};}};
  return {sdk,objects,get writes(){return writes;},set mutateHead(x){mutateHead=x;},set badSize(x){badSize=x;},set headFail(x){headFail=x;}};
}
const p=provider(),storage=await createVercelPrivateEodBlobStore({storeId:'store_SYNTHETIC',token:'',sdk:p.sdk});
const first=await storage.readSettlementContext();assert.equal(first.etag,'"control-version-1"');assert.equal(first.body,body);
const saved=await storage.writeSettlementContext({expectedEtag:first.etag,body:body+'\n'});
assert.equal(saved.etag,'"control-version-2"');assert.equal((await storage.readSettlementContext()).body,body+'\n');
await assert.rejects(storage.writeSettlementContext({expectedEtag:first.etag,body:body+'\nSTALE'}),/PRECONDITION_FAILED/);
assert.equal(p.writes,1);assert.equal((await storage.readSettlementContext()).body,body+'\n');
const original=await storage.read();assert.equal(original.etag,'"control-version-1"');
await storage.compareAndSwap({expectedEtag:original.etag,body:body+'\n',contentType:'application/json'});
assert.equal(p.writes,2);assert.equal((await storage.read()).body,body+'\n');
for(const flag of ['mutateHead','badSize','headFail']){
  const r=provider();r[flag]=true;const s=await createVercelPrivateEodBlobStore({storeId:'store_SYNTHETIC',token:'',sdk:r.sdk});
  await assert.rejects(s.readSettlementContext(),e=>{
    assert.match(e.message,/^CLOUD_BLOB_PRIVATE_CONTEXT_(?:CHANGED_DURING_VERSION_READ|VERSION_METADATA_INVALID|VERSION_METADATA_UNAVAILABLE)$/);
    assert(!e.message.includes('PRIVATE-SDK-EXCEPTION'));return true;
  });assert.equal(r.writes,0);
}
console.log('PASS private version CAS: distinct control-plane/HTTP ETags, exact GET-HEAD-GET byte/size binding, current/stale context and journal CAS, concurrent changes, metadata/transport errors, no blind overwrite. SYNTHETIC providers only.');
