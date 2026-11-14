/**
 * Vercel private Blob adapter for the ONE GLOBAL original strict EOD journal.
 * Do not instantiate in CI or a public route. Current Vercel connections use
 * short-lived OIDC credentials and BLOB_STORE_ID; legacy connections may use
 * a server-side BLOB_READ_WRITE_TOKEN. Never expose either to the browser.
 * Private store must be connected to the authenticated project.
 */
const PATH='fenice/one-global/private-eod/original-ledger.json';
const CONTEXT_PATH='fenice/one-global/private-eod/settlement-inputs.json';
const fail=s=>{throw Error('CLOUD_BLOB_'+s);};
const MAX_BYTES=1_500_000;
async function readBoundedStream(stream){
  if(!stream||typeof stream.getReader!=='function')fail('PRIVATE_READ_STREAM_MISSING');
  const reader=stream.getReader();
  let bytes=0;const chunks=[];
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      const part=Buffer.from(value);
      bytes+=part.length;
      if(bytes>MAX_BYTES)fail('PRIVATE_JOURNAL_TOO_LARGE');
      chunks.push(part);
    }
  }finally{try{reader.releaseLock()}catch{}}
  return Buffer.concat(chunks).toString('utf8');
}
export async function createVercelPrivateEodBlobStore({
  token=process.env.BLOB_READ_WRITE_TOKEN,
  storeId=process.env.BLOB_STORE_ID,
  // Only explicit test/one-shot overrides are pinned. In production let the
  // SDK resolve and refresh OIDC on EVERY operation, including after awaits.
  oidcToken,
  sdk,
}={}){
  const hasStoreId=typeof storeId==='string'&&/^(?:store_)?[A-Za-z0-9_-]{6,100}$/.test(storeId);
  const hasToken=typeof token==='string'&&token.trim().length>=10;
  if(!hasStoreId&&!hasToken)
    fail('PRIVATE_BLOB_AUTH_CONFIGURATION_MISSING');
  // Vercel projects created since June 2026 use automatically rotated OIDC.
  // The SDK obtains its current short-lived Vercel credential at request time.
  // A connected project exposes BLOB_STORE_ID instead of a read-write token.
  // Never manufacture OIDC tokens, copy credentials into Actions or logs,
  // or make a public Blob store fallback.
  const auth=hasStoreId?{
    storeId,
    ...(typeof oidcToken==='string'&&oidcToken.trim()?{oidcToken}:{}),
  }:{token};
  const client=sdk??await import('@vercel/blob');
  if(typeof client.get!=='function'||typeof client.put!=='function')
    fail('PRIVATE_BLOB_SDK_INVALID');
  // Contract flags for the strict private EOD CAS writer. The *real*
  // provider enforces ifMatch; this adapter never implements fake locks.
  return {
    privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){
      const snapshot=await client.get(PATH,{access:'private',useCache:false,...auth});
      if(snapshot===null)return null; // cannot silently seed a new journal
      if(snapshot?.statusCode!==200||!snapshot.blob
        ||typeof snapshot.blob.etag!=='string'||!snapshot.blob.etag
        ||!snapshot.stream)fail('PRIVATE_BLOB_READ_INVALID');
      if(typeof snapshot.blob.size==='number'&&snapshot.blob.size>MAX_BYTES)
        fail('PRIVATE_JOURNAL_TOO_LARGE');
      const body=await readBoundedStream(snapshot.stream);
      return {etag:snapshot.blob.etag,body};
    },
    async readSettlementContext(){
      // Original owner consent, usage-rights and upstream/session evidence
      // are supplied privately. Missing input is NEVER generated from env,
      // research labels, recovery bytes or this development request.
      const snapshot=await client.get(CONTEXT_PATH,{access:'private',useCache:false,...auth});
      if(snapshot===null)return null;
      if(snapshot?.statusCode!==200||typeof snapshot.blob?.etag!=='string'
        ||!snapshot.blob.etag||!snapshot.stream)fail('PRIVATE_CONTEXT_READ_INVALID');
      if(snapshot.blob.size>500000)fail('PRIVATE_CONTEXT_TOO_LARGE');
      const body=await readBoundedStream(snapshot.stream);
      if(Buffer.byteLength(body)>500000)fail('PRIVATE_CONTEXT_TOO_LARGE');
      return {etag:snapshot.blob.etag,body};
    },
    async createResearchObservation({hash,body}){
      if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)
        ||typeof body!=='string'||Buffer.byteLength(body,'utf8')>MAX_BYTES)
        fail('PRIVATE_OBSERVATION_INVALID');
      // Evidence objects live beside the original journal in the SAME private
      // store. They are immutable source receipts, never another ledger.
      const path='fenice/one-global/private-eod/observations/'+hash+'.json';
      const receipt=await client.put(path,body,{
        access:'private',...auth,contentType:'application/json',
        addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60,
      });
      if(typeof receipt?.etag!=='string'||!receipt.etag)
        fail('PRIVATE_OBSERVATION_NOT_CONFIRMED');
      // Verify durable evidence before its hash may enter a SIGNAL.
      const check=await client.get(path,{access:'private',useCache:false,...auth});
      if(check?.statusCode!==200||check?.blob?.etag!==receipt.etag
        ||await readBoundedStream(check.stream)!==body)
        fail('PRIVATE_OBSERVATION_READBACK_FAILED');
      return {created:true};
    },
    async createIfAbsent(body){
      if(typeof body!=='string'||Buffer.byteLength(body,'utf8')<30
        ||Buffer.byteLength(body,'utf8')>MAX_BYTES)
        fail('PRIVATE_BLOB_IMPORT_SIZE_INVALID');
      // Create-only storage conditional: never overwrite an existing original
      // journal even if two owner sessions click simultaneously.
      const receipt=await client.put(PATH,body,{
        access:'private',...auth,contentType:'application/json',
        addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60,
      });
      if(typeof receipt?.etag!=='string'||!receipt.etag)
        fail('PRIVATE_BLOB_IMPORT_NOT_CONFIRMED');
      return {created:true,etag:receipt.etag};
    },
    async compareAndSwap({expectedEtag,body,contentType}){
      if(typeof expectedEtag!=='string'||!expectedEtag.trim()
        ||typeof body!=='string'||Buffer.byteLength(body,'utf8')>MAX_BYTES
        ||contentType!=='application/json')
        fail('PRIVATE_BLOB_CAS_ARGUMENTS_INVALID');
      // The Vercel SDK's ifMatch is an atomic precondition at the storage
      // backend. allowOverwrite WITHOUT ifMatch is forbidden for journals.
      const receipt=await client.put(PATH,body,{
        access:'private',...auth,contentType:'application/json',
        addRandomSuffix:false,allowOverwrite:true,ifMatch:expectedEtag,
        cacheControlMaxAge:60,
      });
      if(typeof receipt?.etag!=='string'||!receipt.etag)
        fail('PRIVATE_BLOB_WRITE_UNCONFIRMED');
      return {committed:true,etag:receipt.etag};
    },
  };
}
