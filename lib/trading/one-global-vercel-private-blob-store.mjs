/**
 * Vercel private Blob adapter for the ONE GLOBAL original strict EOD journal.
 * Do not instantiate in CI or a public route. Current Vercel connections use
 * short-lived OIDC credentials and BLOB_STORE_ID; legacy connections may use
 * a server-side BLOB_READ_WRITE_TOKEN. Never expose either to the browser.
 * Private store must be connected to the authenticated project.
 */
import {createHash} from 'node:crypto';
const PATH='fenice/one-global/private-eod/original-ledger.json';
const CONTEXT_PATH='fenice/one-global/private-eod/settlement-inputs.json';
const fail=s=>{throw Error('CLOUD_BLOB_'+s);};
const MAX_BYTES=1_500_000;
const RAW_MAX_BYTES=8_000_000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function readBoundedBytes(stream,maxBytes=MAX_BYTES,tooLarge='PRIVATE_JOURNAL_TOO_LARGE'){
  if(!stream||typeof stream.getReader!=='function')fail('PRIVATE_READ_STREAM_MISSING');
  const reader=stream.getReader();
  let bytes=0;const chunks=[];
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      const part=Buffer.from(value);
      bytes+=part.length;
      if(bytes>maxBytes)fail(tooLarge);
      chunks.push(part);
    }
  }finally{try{reader.releaseLock()}catch{}}
  return Buffer.concat(chunks);
}
async function readBoundedStream(stream,maxBytes=MAX_BYTES,tooLarge='PRIVATE_JOURNAL_TOO_LARGE'){
  return (await readBoundedBytes(stream,maxBytes,tooLarge)).toString('utf8');
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
  async function confirmPrivateWrite(path,body,label){
    const check=await client.get(path,{access:'private',useCache:false,...auth});
    if(check?.statusCode!==200||typeof check.blob?.etag!=='string'
      ||!check.blob.etag.trim()||check.blob.etag.length>256||!check.stream)
      fail(label+'_READBACK_INVALID');
    if(await readBoundedStream(check.stream,MAX_BYTES,label+'_TOO_LARGE')!==body)fail(label+'_READBACK_BODY_MISMATCH');
    // PUT returns the control-plane version identifier; GET returns the HTTP
    // representation ETag. They need not be the same opaque string. Confirm
    // every byte at the private origin. CAS reads use HEAD version metadata.
    return check.blob.etag;
  }
  async function readVersioned(path,maxBytes,label){
    const first=await client.get(path,{access:'private',useCache:false,...auth});
    if(first===null)return null;
    if(first?.statusCode!==200||typeof first.blob?.etag!=='string'||!first.blob.etag.trim()
      ||first.blob.etag.length>256||!first.stream)fail(label+'_READ_INVALID');
    if(typeof first.blob.size==='number'&&first.blob.size>maxBytes)fail(path===PATH?'PRIVATE_JOURNAL_TOO_LARGE':label+'_TOO_LARGE');
    const body=await readBoundedStream(first.stream,maxBytes,label+'_TOO_LARGE');
    if(Buffer.byteLength(body)>maxBytes)fail(label+'_TOO_LARGE');
    // Provider control-plane ETags are the SDK's documented CAS token. HTTP
    // representation ETags are used only to bind consistent content reads.
    // Never strip quotes, substitute a guessed token, or overwrite on conflict.
    if(typeof client.head!=='function'){
      if(sdk===undefined)fail('PRIVATE_BLOB_HEAD_REQUIRED');
      return {etag:first.blob.etag,body}; // explicitly injected legacy test SDK
    }
    let metadata;
    try{metadata=await client.head(path,{...auth});}catch{fail(label+'_VERSION_METADATA_UNAVAILABLE');}
    if(typeof metadata?.etag!=='string'||!metadata.etag.trim()||metadata.etag.length>256
      ||metadata.size!==Buffer.byteLength(body))fail(label+'_VERSION_METADATA_INVALID');
    const second=await client.get(path,{access:'private',useCache:false,...auth});
    if(second?.statusCode!==200||!second.stream||second.blob?.etag!==first.blob.etag
      ||await readBoundedStream(second.stream,maxBytes,label+'_TOO_LARGE')!==body)fail(label+'_CHANGED_DURING_VERSION_READ');
    return {etag:metadata.etag,body};
  }
  // Read-only forensic access is restricted to immutable, content-addressed
  // evidence beside this journal. No caller-supplied URL or arbitrary path.
  async function readEvidence(claimed,raw){
    if(typeof claimed!=='string'||!/^[a-f0-9]{64}$/.test(claimed))fail('FORENSIC_HASH_INVALID');
    const path='fenice/one-global/private-eod/observations/'+(raw?'raw/'+claimed:claimed+'.json');
    const found=await client.get(path,{access:'private',useCache:false,...auth});
    if(found===null)return null;
    const max=raw?RAW_MAX_BYTES:MAX_BYTES;
    if(found?.statusCode!==200||!found.stream||found.blob?.size>max)fail('FORENSIC_EVIDENCE_READ_INVALID');
    const bytes=await readBoundedBytes(found.stream,max,'FORENSIC_EVIDENCE_TOO_LARGE');
    if(raw&&hash(bytes)!==claimed)fail('FORENSIC_RAW_HASH_MISMATCH');
    // SDK get().blob.uploadedAt is reconstructed from HTTP Last-Modified,
    // which has only whole-second precision. It can appear just AFTER a
    // millisecond FILL timestamp although the archive was written first.
    // Use the provider's original control-plane timestamp, never a tolerance
    // or a fabricated earlier time. Missing metadata remains fail-closed.
    if(typeof client.head!=='function')fail('FORENSIC_VERSION_METADATA_REQUIRED');
    const metadata=await client.head(path,{...auth});
    if(metadata?.size!==bytes.length||!metadata.uploadedAt
      ||!Number.isFinite(new Date(metadata.uploadedAt).getTime()))fail('FORENSIC_VERSION_METADATA_INVALID');
    return {body:bytes,uploadedAt:metadata.uploadedAt,
      uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD',httpLastModified:found.blob?.uploadedAt??null};
  }
  // The backend enforces ifMatch using its control-plane version identifier.
  return {
    privateAccess:true,durable:true,atomicCompareAndSwap:true,
    /** Owner-initiated bounded scan, NEVER part of the scheduled PAPER cycle. */
    async readArchivedOriginalContexts(){
      if(typeof client.list!=='function')fail('PRIVATE_ARCHIVE_LIST_UNSUPPORTED');
      const prefix='fenice/one-global/private-eod/observations/';
      const contexts=[];let cursor,complete=false,listed=0,read=0,invalid=0;
      for(let page=0;page<4;page++){
        const result=await client.list({prefix,limit:100,...auth,...(cursor?{cursor}:{})});
        if(!Array.isArray(result?.blobs)||typeof result.hasMore!=='boolean'
          ||result.blobs.length>100)fail('PRIVATE_ARCHIVE_LIST_INVALID');
        for(const blob of result.blobs){
          listed++;
          const match=typeof blob?.pathname==='string'
            ?/^fenice\/one-global\/private-eod\/observations\/([a-f0-9]{64})\.json$/.exec(blob.pathname):null;
          if(!match)continue; // Raw source artifacts are outside this JSON-input scan.
          if(!Number.isSafeInteger(blob.size)||blob.size<20||blob.size>MAX_BYTES){
            invalid++;continue; // An unreadable candidate cannot prove absence.
          }
          if(read>=40)return {contexts,complete:false,listed,read,invalid};
          read++;
          try{
            const obj=await client.get(blob.pathname,{access:'private',useCache:false,...auth});
            if(obj?.statusCode!==200||!obj.stream)throw Error('UNREADABLE');
            const raw=await readBoundedStream(obj.stream,MAX_BYTES,'PRIVATE_ARCHIVE_TOO_LARGE');
            const packet=JSON.parse(raw);
            if(typeof packet?.kind!=='string')throw Error('PACKET_KIND');
            // Research observations use the report digest as their object key;
            // only original input packets promise a hash of the entire body.
            if(packet.kind!=='ONE_GLOBAL_PRIVATE_INPUT_ORIGINAL')continue;
            if(packet.inputKind==='ORIGINAL_OWNER_PAPER_CONSENT')continue;
            if(hash(Buffer.from(raw,'utf8'))!==match[1])throw Error('HASH');
            if(packet.inputKind!=='SETTLEMENT_CONTEXT'
              ||typeof packet.originalFileBase64!=='string'
              ||packet.originalFileBase64.length>666668
              ||!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.originalFileBase64)
              ||packet.originalFileBase64.length%4
              ||!/^[a-f0-9]{64}$/.test(packet.originalFileSha256||'')
              ||typeof packet.receivedAt!=='string'||!Number.isFinite(Date.parse(packet.receivedAt))
              ||new Date(packet.receivedAt).toISOString()!==packet.receivedAt)throw Error('INPUT_PACKET_INVALID');
            const original=Buffer.from(packet.originalFileBase64,'base64');
            if(original.length<20||original.length>500000
              ||original.toString('base64')!==packet.originalFileBase64
              ||!Buffer.from(original.toString('utf8'),'utf8').equals(original)
              ||hash(original)!==packet.originalFileSha256)throw Error('ORIGINAL_HASH');
            const parsed=JSON.parse(original.toString('utf8'));
            if(JSON.stringify(parsed)!==JSON.stringify(packet.context))throw Error('CONTEXT_MISMATCH');
            if(contexts.length<25)contexts.push({receivedAt:packet.receivedAt,context:parsed});
            else return {contexts,complete:false,listed,read,invalid};
          }catch{invalid++;}
        }
        if(!result.hasMore){complete=invalid===0;break;}
        if(typeof result.cursor!=='string'||!result.cursor)fail('PRIVATE_ARCHIVE_CURSOR_INVALID');
        cursor=result.cursor;
      }
      return {contexts,complete,listed,read,invalid};
    },
    // Diagnostic snapshot only: no CAS token is returned. A single uncached
    // origin GET is sufficient for replay of a point-in-time journal body.
    // Never use this method for settlement, writes or forensic certification.
    async readStatusSnapshot(){
      const found=await client.get(PATH,{access:'private',useCache:false,...auth});
      if(found===null)return null;
      if(found?.statusCode!==200||typeof found.blob?.etag!=='string'
        ||!found.blob.etag.trim()||found.blob.etag.length>256||!found.stream
        ||(typeof found.blob.size==='number'&&found.blob.size>MAX_BYTES))
        fail('PRIVATE_STATUS_READ_INVALID');
      const bytes=await readBoundedBytes(found.stream,MAX_BYTES,'PRIVATE_STATUS_TOO_LARGE');
      // Blob GET derives size from HTTP Content-Length, defaulting to zero
      // when absent. Fetch also decodes compressed responses before streaming.
      const headers=found.headers;
      const encoding=headers?.get('content-encoding')?.trim().toLowerCase();
      const identityBody=!encoding||encoding==='identity';
      const length=headers?.get('content-length');
      if(length!=null&&!/^\d+$/.test(length))fail('PRIVATE_STATUS_SIZE_MISMATCH');
      // Older adapters can supply object size directly without HTTP headers.
      const expectedSize=headers?(length==null?null:Number(length)):found.blob.size;
      if(identityBody&&expectedSize!=null&&expectedSize!==bytes.length)
        fail('PRIVATE_STATUS_SIZE_MISMATCH');
      const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      return {body,representationEtag:found.blob.etag};
    },
    async read(){return readVersioned(PATH,MAX_BYTES,'PRIVATE_BLOB');},
    async readSettlementContext(){return readVersioned(CONTEXT_PATH,500000,'PRIVATE_CONTEXT');},
    async readResearchObservation(claimed){return readEvidence(claimed,false);},
    async readSourceArtifact(claimed){return readEvidence(claimed,true);},
    async writeSettlementContext({expectedEtag,body}){
      if(typeof body!=='string'||Buffer.byteLength(body)>500000||Buffer.byteLength(body)<30
        ||!(expectedEtag===null||typeof expectedEtag==='string'&&expectedEtag.trim()&&expectedEtag.length<=256))
        fail('PRIVATE_CONTEXT_WRITE_INVALID');
      // Context only. The original journal pathname is never a caller input.
      const result=await client.put(CONTEXT_PATH,body,{access:'private',...auth,
        contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,
        allowOverwrite:expectedEtag!==null,...(expectedEtag===null?{}:{ifMatch:expectedEtag})});
      if(typeof result?.etag!=='string'||!result.etag)fail('PRIVATE_CONTEXT_WRITE_UNCONFIRMED');
      const confirmed=await readVersioned(CONTEXT_PATH,500000,'PRIVATE_CONTEXT');
      if(confirmed?.body!==body)fail('PRIVATE_CONTEXT_READBACK_BODY_MISMATCH');
      return {committed:true,etag:confirmed.etag};
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
      await confirmPrivateWrite(path,body,'PRIVATE_OBSERVATION');
      return {created:true};
    },
    async createSourceArtifact({hash:claimed,body,contentType}){
      if(typeof claimed!=='string'||!/^[a-f0-9]{64}$/.test(claimed)
        ||!Buffer.isBuffer(body)||body.length<20||body.length>RAW_MAX_BYTES||hash(body)!==claimed
        ||!['application/zip','text/csv','text/html','application/pdf','application/json'].includes(contentType))
        fail('PRIVATE_SOURCE_ARTIFACT_INVALID');
      const path='fenice/one-global/private-eod/observations/raw/'+claimed;
      let created=true;
      try{
        const receipt=await client.put(path,body,{access:'private',...auth,contentType,
          addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60});
        if(typeof receipt?.etag!=='string'||!receipt.etag)fail('PRIVATE_SOURCE_ARTIFACT_NOT_CONFIRMED');
      }catch(error){
        // Create-only is intentionally idempotent: a pre-existing object may
        // be reused only after an exact private-origin byte/hash readback.
        if(/^CLOUD_BLOB_PRIVATE_SOURCE_ARTIFACT_/.test(error?.message||''))throw error;
        created=false;
      }
      const check=await client.get(path,{access:'private',useCache:false,...auth});
      if(check?.statusCode!==200||!check.stream)fail('PRIVATE_SOURCE_ARTIFACT_READBACK_INVALID');
      const received=await readBoundedBytes(check.stream,RAW_MAX_BYTES,'PRIVATE_SOURCE_ARTIFACT_TOO_LARGE');
      if(!received.equals(body)||hash(received)!==claimed)fail('PRIVATE_SOURCE_ARTIFACT_READBACK_MISMATCH');
      return {created,verified:true};
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
