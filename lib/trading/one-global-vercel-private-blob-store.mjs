/**
 * Vercel private Blob adapter for the ONE GLOBAL original strict EOD journal.
 * Do not instantiate in CI or in a public route. Access token remains a
 * server-side Vercel secret; never return storage bodies to the browser.
 * Private store must be created/connected by a permitted Vercel admin.
 */
const PATH='fenice/one-global/private-eod/original-ledger.json';
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
  token=process.env.BLOB_READ_WRITE_TOKEN,sdk,
}={}){
  if(typeof token!=='string'||!token.trim()||token.length<10)
    fail('PRIVATE_BLOB_TOKEN_UNAVAILABLE');
  const client=sdk??await import('@vercel/blob');
  if(typeof client.get!=='function'||typeof client.put!=='function')
    fail('PRIVATE_BLOB_SDK_INVALID');
  // Contract flags for the strict private EOD CAS writer. The *real*
  // provider enforces ifMatch; this adapter never implements fake locks.
  return {
    privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){
      const snapshot=await client.get(PATH,{access:'private',token});
      if(snapshot===null)return null; // cannot silently seed a new journal
      if(snapshot?.statusCode!==200||!snapshot.blob
        ||typeof snapshot.blob.etag!=='string'||!snapshot.blob.etag
        ||!snapshot.stream)fail('PRIVATE_BLOB_READ_INVALID');
      if(typeof snapshot.blob.size==='number'&&snapshot.blob.size>MAX_BYTES)
        fail('PRIVATE_JOURNAL_TOO_LARGE');
      const body=await readBoundedStream(snapshot.stream);
      return {etag:snapshot.blob.etag,body};
    },
    async compareAndSwap({expectedEtag,body,contentType}){
      if(typeof expectedEtag!=='string'||!expectedEtag.trim()
        ||typeof body!=='string'||Buffer.byteLength(body,'utf8')>MAX_BYTES
        ||contentType!=='application/json')
        fail('PRIVATE_BLOB_CAS_ARGUMENTS_INVALID');
      // The Vercel SDK's ifMatch is an atomic precondition at the storage
      // backend. allowOverwrite WITHOUT ifMatch is forbidden for journals.
      const receipt=await client.put(PATH,body,{
        access:'private',token,contentType:'application/json',
        addRandomSuffix:false,allowOverwrite:true,ifMatch:expectedEtag,
        cacheControlMaxAge:60,
      });
      if(typeof receipt?.etag!=='string'||!receipt.etag)
        fail('PRIVATE_BLOB_WRITE_UNCONFIRMED');
      return {committed:true,etag:receipt.etag};
    },
  };
}
