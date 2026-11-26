import {createHash,createHmac} from 'node:crypto';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const hmac=(k,x)=>createHmac('sha256',k).update(x).digest();
// Only a fixed diagnostic key; no journal access or mutation.
export async function probePrivateR2({env=process.env,fetcher=fetch,now=new Date()}={}){
  const c=resolvePrivateR2Config(env);
  const url=new URL('/'+c.bucket+'/diagnostics/r2-readiness-v1',c.endpoint);
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
  const payload=hash('');
  const signed='host;x-amz-content-sha256;x-amz-date';
  const canonical=['HEAD',url.pathname,'','host:'+url.host+'\nx-amz-content-sha256:'+payload+'\nx-amz-date:'+stamp+'\n',signed,payload].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),'auto'),'s3'),'aws4_request');
  const signature=hmac(key,['AWS4-HMAC-SHA256',stamp,scope,hash(canonical)].join('\n')).toString('hex');
  let response;
  try{response=await fetcher(url,{method:'HEAD',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'x-amz-date':stamp,'x-amz-content-sha256':payload,authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature}});}catch{return {state:'R2_PROBE_NETWORK_FAILED'};}
  return {state:response.status===200?'R2_PROBE_OBJECT_PRESENT':response.status===404?'R2_PROBE_OBJECT_NOT_FOUND':response.status===403?'R2_PROBE_ACCESS_DENIED':'R2_PROBE_HTTP_FAILED',httpStatus:response.status};
}
