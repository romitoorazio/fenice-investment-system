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

import {probePrivateR2Write} from '../lib/trading/one-global-r2-write-probe.mjs';
import {createHash} from 'node:crypto';
for(const fault of ['none','corrupt','ignore-conditions','no-delete','network','late-write','delete-ignored','ambiguous-http']){
 let value=null, key=null, calls=0;
 const etag=()=>'"'+createHash('md5').update(value).digest('hex')+'"';
 const result=await probePrivateR2Write({env,clock:()=>now,fetcher:async(url,options)=>{
  calls++;
  assert.match(url.pathname,/^\/fenice-private-storage\/diagnostics\/r2-write-probe\/[a-f0-9-]{36}$/);
  if(key)assert.equal(url.href,key);else key=url.href;
  assert.equal(options.redirect,'error');
  const headers=options.headers;
  assert.match(headers.authorization,/^AWS4-HMAC-SHA256 /);
  if(options.method==='PUT'){
   assert.equal(headers['x-amz-content-sha256'],createHash('sha256').update(options.body).digest('hex'));
   if(fault==='network'||fault==='late-write')throw Error('sensitive');
   if(fault==='ambiguous-http')return new Response(null,{status:503});
   if(headers['if-none-match'])assert.match(headers.authorization,/SignedHeaders=host;if-none-match;x-amz-content-sha256;x-amz-date/);
   if(headers['if-match'])assert.match(headers.authorization,/SignedHeaders=host;if-match;x-amz-content-sha256;x-amz-date/);
   if(fault!=='ignore-conditions'&&((headers['if-none-match']==='*'&&value!==null)||(headers['if-match']&&(!value||headers['if-match']!==etag()))))return new Response(null,{status:412});
   value=options.body;return new Response(null,{status:200});
  }
  if(options.method==='GET')return new Response(fault==='corrupt'?'bad':value,{status:200,headers:{etag:etag()}});
  if(options.method==='HEAD'){
   // Simulate an unresolved PUT arriving after the absence observation.
   if(fault==='late-write'){value='late diagnostic write';return new Response(null,{status:404});}
   return new Response(null,{status:value===null?404:200});
  }
  assert.equal(options.method,'DELETE');
  if(fault==='no-delete')return new Response(null,{status:403});
  if(fault!=='delete-ignored')value=null;
  return new Response(null,{status:204});
 }});
 assert.equal(result.state,fault==='none'?'R2_WRITE_PROBE_VERIFIED':'R2_WRITE_PROBE_FAILED');
 if(fault==='none'){assert.ok(Object.values(result.checks).every(Boolean));assert.equal(calls,8);}
 assert.ok(!JSON.stringify(result).includes('sensitive'));
 if(['network','late-write','ambiguous-http','delete-ignored','no-delete'].includes(fault)){
  assert.equal(result.checks.cleanup,false);
  assert.equal(result.cleanupPending,true);
  assert.match(result.diagnosticId,/^[a-f0-9-]{36}$/);
 }
 if(['network','late-write','ambiguous-http'].includes(fault))assert.equal(result.writeOutcomeAmbiguous,true);
 if(!['no-delete','late-write','delete-ignored'].includes(fault))assert.equal(value,null);
}
console.log('R2 conditional write diagnostic mock tests passed');

// Owner page exposes the isolated POST only after explicit interaction.
import {readFileSync} from 'node:fs';
const ownerPage=readFileSync(new URL('../app/recupero-paper/page.tsx',import.meta.url),'utf8');
assert.match(ownerPage,/const R2_PROBE="\/api\/paper\/one-global-r2-probe"/);
assert.match(ownerPage,/if\(!authenticated\|\|r2InFlight\.current\|\|r2Uncertain\.current\)return/);
assert.match(ownerPage,/fetch\(R2_PROBE,\{method:"POST",credentials:"same-origin",cache:"no-store",headers:\{"x-fenice-diagnostic":"r2-write"\}\}\)/);
assert.match(ownerPage,/R2_CHECKS\.every\(key=>payload\.checks\?\.\[key\]===true\)/);
assert.match(ownerPage,/onClick=\{\(\)=>void runR2Probe\(\)\}/);
assert.equal((ownerPage.match(/fetch\(R2_PROBE/g)||[]).length,1);
console.log('R2 owner page wiring checks passed');
