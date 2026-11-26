import assert from 'node:assert/strict';
import {probePrivateR2} from '../lib/trading/one-global-r2-probe.mjs';
const env={R2_ACCESS_KEY_ID:'test-id',R2_SECRET_ACCESS_KEY:'test-secret',R2_ENDPOINT:'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',R2_BUCKET_NAME:'fenice-private-storage'};
const now=new Date('2026-11-26T12:34:56Z');
for(const [status,state] of [[200,'R2_PROBE_OBJECT_PRESENT'],[404,'R2_PROBE_OBJECT_NOT_FOUND'],[403,'R2_PROBE_ACCESS_DENIED'],[429,'R2_PROBE_HTTP_FAILED'],[500,'R2_PROBE_HTTP_FAILED']]){
 let calls=0;
 const result=await probePrivateR2({env,now,fetcher:async(url,options)=>{
  calls++;
  assert.equal(url.href,env.R2_ENDPOINT+'/fenice-private-storage/diagnostics/r2-readiness-v1');
  assert.equal(options.method,'HEAD');
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers['x-amz-date'],'20261126T123456Z');
  assert.match(options.headers.authorization,/^AWS4-HMAC-SHA256 Credential=test-id\/20261126\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
  assert.ok(!options.headers.authorization.includes('test-secret'));
  return {status};
 }});
 assert.equal(calls,1);
 assert.deepEqual(result,{state,httpStatus:status});
}
assert.deepEqual(await probePrivateR2({env,now,fetcher:async()=>{throw Error('secret error');}}),{state:'R2_PROBE_NETWORK_FAILED'});
assert.deepEqual(await probePrivateR2({env:{},fetcher:async()=>{assert.fail('unexpected network');}}),{state:'R2_PROBE_CONFIGURATION_FAILED'});
const originalTimeout=AbortSignal.timeout;
try{
 const signal=new AbortController().signal;
 let timeoutCalls=0;
 AbortSignal.timeout=ms=>{assert.equal(ms,8000);timeoutCalls++;return signal;};
 await probePrivateR2({env,now,fetcher:async(url,options)=>{assert.equal(options.signal,signal);return {status:404};}});
 assert.equal(timeoutCalls,1);
}finally{AbortSignal.timeout=originalTimeout;}
console.log('R2 probe isolation tests passed');
