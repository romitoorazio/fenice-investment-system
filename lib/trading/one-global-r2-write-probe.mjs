import {createHash,createHmac,randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(k,x)=>createHmac('sha256',k).update(x).digest();
// ETags are opaque version validators, not necessarily 32-digit MD5 hashes.
// Accept exactly one strong, bounded tag; never wildcard, weak or list values.
// A bare safe token is serialized as a quoted HTTP entity tag.
function strongEtag(value){
  if(typeof value!=='string'||value.length>258)return null;
  if(/^"[A-Za-z0-9._:+/=~-]{1,256}"$/.test(value))return value;
  if(/^[A-Za-z0-9._:+/=~-]{1,256}$/.test(value))return '"'+value+'"';
  return null;
}

// For missing metadata, bypass framework fetch wrappers with a bounded direct
// HTTPS read. Only signed HEAD/GET of the same isolated diagnostic key.
function directMetadataRead(url,{method,headers,signal}){
  if(url.protocol!=='https:'||!['HEAD','GET'].includes(method))throw Error('METADATA_METHOD');
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method,headers:{...headers,'accept-encoding':'identity'},signal},res=>{
      let size=0;const chunks=[];
      res.on('error',reject);
      res.on('aborted',()=>reject(Error('METADATA_ABORTED')));
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>65536){res.destroy(Error('METADATA_BODY_LIMIT'));return;}
        chunks.push(chunk);
      });
      res.on('end',()=>{
        const etags=res.headersDistinct.etag??[];
        const tag=etags.length===1?etags[0]:null;
        const body=Buffer.concat(chunks);
        resolve({status:res.statusCode,headers:{get:name=>name==='etag'?tag:null},arrayBuffer:async()=>body});
      });
    });
    req.on('error',reject);req.end();
  });
}
// No caller-supplied keys, payloads, or URLs. Never accesses the journal.
export async function probePrivateR2Write({env=process.env,fetcher=fetch,metadataFetcher=fetcher===fetch?directMetadataRead:fetcher,clock=()=>new Date()}={}){
  let c;
  try{c=resolvePrivateR2Config(env);}catch{return {state:'R2_WRITE_PROBE_CONFIGURATION_FAILED'};}
  const id=randomUUID();
  const url=new URL('/'+c.bucket+'/diagnostics/r2-write-probe/'+id,c.endpoint);
  const payloadA='fenice-diagnostic-a:'+id, payloadB='fenice-diagnostic-b:'+id;
  const checks={conditionalCreate:false,concurrentExclusive:false,sha256Verified:false,conditionalUpdate:false,staleUpdateRejected:false,finalSha256Verified:false,cleanup:false};
  let writeOutcomeAmbiguous=false;
  const request=async(method,body='',condition={},transport=fetcher)=>{
    const stamp=clock().toISOString().replace(/[:-]|\.\d{3}/g,'');
    const day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
    const headers={'host':url.host,'x-amz-date':stamp,'x-amz-content-sha256':sha(body),...condition};
    const names=Object.keys(headers).sort();
    const signed=names.join(';');
    const canonical=[method,url.pathname,'',names.map(k=>k+':'+headers[k]+'\n').join(''),signed,sha(body)].join('\n');
    const key=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),'auto'),'s3'),'aws4_request');
    const signature=hmac(key,['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n')).toString('hex');
    try{
      const response=await transport(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
        headers:{...headers,authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature},
        ...(method==='PUT'?{body}:{} )});
      // Only the expected definitive PUT outcomes can establish that no write is outstanding.
      if(method==='PUT'&&![200,412].includes(response.status))writeOutcomeAmbiguous=true;
      return response;
    }catch(error){if(method==='PUT')writeOutcomeAmbiguous=true;throw error;}
  };
  let step='CREATE';
  let failure, failureCode;
  try{
    const writes=await Promise.allSettled([request('PUT',payloadA,{'if-none-match':'*'}),request('PUT',payloadB,{'if-none-match':'*'})]);
    if(writes.some(x=>x.status!=='fulfilled'))throw Error();
    const statuses=writes.map(x=>x.value.status);
    const wins=statuses.filter(x=>x===200).length;
    checks.conditionalCreate=wins===1;
    checks.concurrentExclusive=wins===1&&statuses.includes(412);
    if(!checks.concurrentExclusive)throw Error();
    const winnerIndex=statuses[0]===200?0:1;
    const winner=winnerIndex===0?payloadA:payloadB;
    step='READ';
    const read=await request('GET');
    let etag=strongEtag(read.headers.get('etag'));
    checks.sha256Verified=read.status===200&&sha(Buffer.from(await read.arrayBuffer()))===sha(winner);
    if(!checks.sha256Verified){failureCode='READBACK_SHA256_MISMATCH';throw Error();}
    if(!etag){
      step='METADATA';
      const putTag=strongEtag(writes[winnerIndex].value.headers.get('etag'));
      const head=await request('HEAD','',{},metadataFetcher);
      if(head.status!==200){failureCode='METADATA_HEAD_HTTP_'+head.status;throw Error();}
      const headTag=strongEtag(head.headers.get('etag'));
      if(putTag&&headTag&&putTag!==headTag){failureCode='METADATA_ETAG_CONFLICT';throw Error();}
      etag=headTag??putTag;
      if(!etag){
        // Some intermediary transports remove response headers. Try a direct
        // GET as well; its actual bytes must still match the winning write.
        const direct=await request('GET','',{},metadataFetcher);
        if(direct.status!==200||sha(Buffer.from(await direct.arrayBuffer()))!==sha(winner)){failureCode='METADATA_READBACK_MISMATCH';throw Error();}
        etag=strongEtag(direct.headers.get('etag'));
      }
      if(!etag){failureCode='STRONG_ETAG_MISSING_OR_UNSUPPORTED';throw Error();}
      // Bind the recovered validator to the already verified winning bytes.
      // Never synthesize a validator from MD5/SHA or issue an unconditional PUT.
      const bound=await request('GET','',{'if-match':etag},metadataFetcher);
      const boundTag=strongEtag(bound.headers.get('etag'));
      if(bound.status!==200||(boundTag&&boundTag!==etag)||sha(Buffer.from(await bound.arrayBuffer()))!==sha(winner)){
        failureCode='METADATA_CONDITIONAL_READ_FAILED';throw Error();
      }
    }
    const next=winner===payloadA?payloadB:payloadA;
    step='CAS';
    const update=await request('PUT',next,{'if-match':etag});
    checks.conditionalUpdate=update.status===200;
    if(!checks.conditionalUpdate){failureCode='CONDITIONAL_PUT_HTTP_'+update.status;throw Error();}
    step='STALE_CAS';
    const stale=await request('PUT',winner,{'if-match':etag});
    checks.staleUpdateRejected=stale.status===412;
    if(!checks.staleUpdateRejected){failureCode='STALE_PUT_HTTP_'+stale.status;throw Error();}
    step='FINAL_READ';
    const final=await request('GET');
    checks.finalSha256Verified=final.status===200&&sha(Buffer.from(await final.arrayBuffer()))===sha(next);
    if(!checks.finalSha256Verified)throw Error();
  }catch{failure=step;}
  // Best-effort deletion, then confirm absence. A late PUT can recreate an absent key,
  // so even a 404 is not proof of cleanup after an ambiguous PUT outcome.
  try{
    const deleted=await request('DELETE');
    const absent=deleted.status===204&&(await request('HEAD')).status===404;
    checks.cleanup=absent&&!writeOutcomeAmbiguous;
  }catch{}
  if(!checks.cleanup&&!failure)failure='CLEANUP';
  return {state:failure?'R2_WRITE_PROBE_FAILED':'R2_WRITE_PROBE_VERIFIED',checks,
    ...(failure?{failedStep:failure}:{}),
    ...(failureCode?{failureCode}:{}),
    ...(!checks.cleanup?{cleanupPending:true,diagnosticId:id}:{}),
    ...(writeOutcomeAmbiguous?{writeOutcomeAmbiguous:true}:{})};
}
