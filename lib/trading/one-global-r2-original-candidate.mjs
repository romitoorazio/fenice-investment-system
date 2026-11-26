/** Read-only candidate inspection; never a writer or authoritative store. */
import {createHash,createHmac} from 'node:crypto';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
const PATH='fenice/one-global/private-eod/original-ledger.json';
const PREFIX_HASH='a733637275ad95c086566a6d29213035fbb0f5060d222df7eddbf99f074adf89';
const MAX_BYTES=1_500_000;
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(key,x)=>createHmac('sha256',key).update(x).digest();
const safe=(state,extra={})=>({state,sourceProvenanceIndependentlyVerified:false,authoritativeStoreChanged:false,journalMutationAllowed:false,brokerConnectivityAllowed:false,liveTradingAllowed:false,...extra});
/** expectedSha256 must originate from the authenticated original, not R2 itself. */
export async function inspectPrivateR2OriginalCandidate({expectedSha256,env=process.env,fetcher=fetch,now=new Date()}={}){
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))return safe('R2_ORIGINAL_FINGERPRINT_REQUIRED');
  let c;
  try{c=resolvePrivateR2Config(env);}catch{return safe('R2_ORIGINAL_CONFIGURATION_FAILED');}
  const url=new URL('/'+c.bucket+'/'+PATH,c.endpoint);
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
  const payload=sha('');
  const signed='host;x-amz-content-sha256;x-amz-date';
  const canonical=['GET',url.pathname,'','host:'+url.host+'\nx-amz-content-sha256:'+payload+'\nx-amz-date:'+stamp+'\n',signed,payload].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),'auto'),'s3'),'aws4_request');
  const signature=hmac(key,['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n')).toString('hex');
  let response;
  try{response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'x-amz-date':stamp,'x-amz-content-sha256':payload,authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature}});}catch{return safe('R2_ORIGINAL_READ_FAILED');}
  if(response.status!==200)return safe(response.status===404?'R2_ORIGINAL_NOT_FOUND':'R2_ORIGINAL_READ_REJECTED');
  let reader;
  let bytes=0;const chunks=[];
  try{
    if(!response.body)return safe('R2_ORIGINAL_READ_FAILED');
    reader=response.body.getReader();
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){void reader.cancel().catch(()=>{});return safe('R2_ORIGINAL_TOO_LARGE');}
      chunks.push(Buffer.from(value));
    }
  }catch{return safe('R2_ORIGINAL_READ_FAILED');}
  finally{try{reader?.releaseLock();}catch{}}
  const body=Buffer.concat(chunks);
  if(sha(body)!==expectedSha256)return safe('R2_ORIGINAL_FINGERPRINT_MISMATCH');
  const json=body.toString('utf8');
  if(!Buffer.from(json,'utf8').equals(body))return safe('R2_ORIGINAL_UTF8_INVALID');
  try{
    const ledger=JSON.parse(json),replay=replayOneGlobalEodPaperLedger(ledger);
    if(replay.valid!==true||ledger.events.length<3||ledger.events[2]?.hash!==PREFIX_HASH)return safe('R2_ORIGINAL_HISTORY_MISMATCH');
    return safe('R2_ORIGINAL_CANDIDATE_BYTES_VERIFIED',{expectedFingerprintMatched:true,originalPrefixVerified:true,replayVerified:true,journalEventCount:ledger.events.length});
  }catch{return safe('R2_ORIGINAL_REPLAY_INVALID');}
}
