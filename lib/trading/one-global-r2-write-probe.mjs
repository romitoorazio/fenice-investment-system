import {createHash,createHmac,randomUUID} from 'node:crypto';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(k,x)=>createHmac('sha256',k).update(x).digest();

// No caller-supplied keys, payloads, or URLs. Never accesses the journal.
export async function probePrivateR2Write({env=process.env,fetcher=fetch,clock=()=>new Date()}={}){
  let c;
  try{c=resolvePrivateR2Config(env);}catch{return {state:'R2_WRITE_PROBE_CONFIGURATION_FAILED'};}
  const id=randomUUID();
  const url=new URL('/'+c.bucket+'/diagnostics/r2-write-probe/'+id,c.endpoint);
  const payloadA='fenice-diagnostic-a:'+id, payloadB='fenice-diagnostic-b:'+id;
  const checks={conditionalCreate:false,concurrentExclusive:false,sha256Verified:false,conditionalUpdate:false,staleUpdateRejected:false,finalSha256Verified:false,cleanup:false};
  const request=async(method,body='',condition={})=>{
    const stamp=clock().toISOString().replace(/[:-]|\.\d{3}/g,'');
    const day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
    const headers={'host':url.host,'x-amz-date':stamp,'x-amz-content-sha256':sha(body),...condition};
    const names=Object.keys(headers).sort();
    const signed=names.join(';');
    const canonical=[method,url.pathname,'',names.map(k=>k+':'+headers[k]+'\n').join(''),signed,sha(body)].join('\n');
    const key=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),'auto'),'s3'),'aws4_request');
    const signature=hmac(key,['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n')).toString('hex');
    return fetcher(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
      headers:{...headers,authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature},
      ...(method==='PUT'?{body}:{} )});
  };
  let step='CREATE';
  let failure;
  try{
    const writes=await Promise.allSettled([request('PUT',payloadA,{'if-none-match':'*'}),request('PUT',payloadB,{'if-none-match':'*'})]);
    if(writes.some(x=>x.status!=='fulfilled'))throw Error();
    const statuses=writes.map(x=>x.value.status);
    const wins=statuses.filter(x=>x===200).length;
    checks.conditionalCreate=wins===1;
    checks.concurrentExclusive=wins===1&&statuses.includes(412);
    if(!checks.concurrentExclusive)throw Error();
    const winner=statuses[0]===200?payloadA:payloadB;
    step='READ';
    const read=await request('GET');
    const etag=read.headers.get('etag');
    checks.sha256Verified=read.status===200&&sha(Buffer.from(await read.arrayBuffer()))===sha(winner);
    if(!checks.sha256Verified||!etag||!/^"[a-f0-9]{32}"$/i.test(etag))throw Error();
    const next=winner===payloadA?payloadB:payloadA;
    step='CAS';
    const update=await request('PUT',next,{'if-match':etag});
    checks.conditionalUpdate=update.status===200;
    if(!checks.conditionalUpdate)throw Error();
    step='STALE_CAS';
    const stale=await request('PUT',winner,{'if-match':etag});
    checks.staleUpdateRejected=stale.status===412;
    if(!checks.staleUpdateRejected)throw Error();
    step='FINAL_READ';
    const final=await request('GET');
    checks.finalSha256Verified=final.status===200&&sha(Buffer.from(await final.arrayBuffer()))===sha(next);
    if(!checks.finalSha256Verified)throw Error();
  }catch{failure=step;}
  // The randomly generated key belongs exclusively to this probe, even after an ambiguous timeout.
  try{const deleted=await request('DELETE');checks.cleanup=deleted.status===204;}catch{}
  if(!checks.cleanup&&!failure)failure='CLEANUP';
  return {state:failure?'R2_WRITE_PROBE_FAILED':'R2_WRITE_PROBE_VERIFIED',checks,...(failure?{failedStep:failure}:{})};
}
