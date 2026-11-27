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
// Exercise opaque/legacy wire formats without replacing the server's version.
for(const format of ['opaque','bare','weak','missing','wildcard','list','oversize']){
 let value=null,casCalls=0;
 const token=()=> 'version-'+createHash('sha256').update(value).digest('hex');
 const valid=format==='opaque'||format==='bare';
 const result=await probePrivateR2Write({env,clock:()=>now,fetcher:async(url,options)=>{
  const h=options.headers;
  if(options.method==='PUT'){
   if(h['if-none-match']==='*'&&value!==null)return new Response(null,{status:412});
   if(h['if-match']){
    casCalls++;assert.equal(valid,true);
    if(h['if-match']!=='"'+token()+'"')return new Response(null,{status:412});
   }
   value=options.body;return new Response(null,{status:200});
  }
  if(options.method==='GET'){
   const tags={opaque:'"'+token()+'"',bare:token(),weak:'W/"'+token()+'"',wildcard:'*',list:'"a", "b"',oversize:'"'+ 'a'.repeat(257)+'"'};
   return new Response(value,{status:200,headers:format==='missing'?{}:{etag:tags[format]}});
  }
  if(options.method==='DELETE'){value=null;return new Response(null,{status:204});}
  assert.equal(options.method,'HEAD');return new Response(null,{status:value===null?404:200});
 }});
 assert.equal(result.state,valid?'R2_WRITE_PROBE_VERIFIED':'R2_WRITE_PROBE_FAILED');
 assert.equal(result.checks.sha256Verified,true);assert.equal(result.checks.cleanup,true);
 assert.equal(casCalls,valid?2:0);
 if(!valid){assert.equal(result.failedStep,'METADATA');assert.equal(result.failureCode,'STRONG_ETAG_MISSING_OR_UNSUPPORTED');}
 assert.equal(value,null);
}
// Missing GET validator: independently read provider metadata and bind it
// to the winning bytes before sending a conditional update.
for(const fault of ['head','put','direct-get','conflict','no-metadata','head-403','wrong-bound-body','bound-412','bound-tag-conflict']){
 let value=null,casCalls=0,boundCalls=0,metadataCalls=0;
 const token=()=>'"version-'+createHash('sha256').update(value).digest('hex')+'"';
 const response=(status,body=null,tag=null)=>new Response(body,{status,headers:tag?{etag:tag}:{}});
 const fetcher=async(url,o)=>{
  if(o.method==='PUT'){
   if(o.headers['if-none-match']==='*'&&value!==null)return response(412);
   if(o.headers['if-match']){casCalls++;if(o.headers['if-match']!==token())return response(412);}
   value=o.body;
   return response(200,null,['put','conflict'].includes(fault)?token():null);
  }
  if(o.method==='GET')return response(200,value);
  if(o.method==='DELETE'){value=null;return response(204);}
  assert.equal(o.method,'HEAD');return response(value===null?404:200);
 };
 const metadataFetcher=async(url,o)=>{
  metadataCalls++;
  assert.match(url.pathname,/^\\/fenice-private-storage\\/diagnostics\\/r2-write-probe\\/[a-f0-9-]{36}$/);
  if(o.method==='HEAD')return fault==='head-403'?response(403):response(200,null,fault==='conflict'?'"other"':['head','wrong-bound-body','bound-412','bound-tag-conflict'].includes(fault)?token():null);
  assert.equal(o.method,'GET');
  if(o.headers['if-match']){
   boundCalls++;assert.equal(o.headers['if-match'],token());
   if(fault==='bound-412')return response(412);
   return response(200,fault==='wrong-bound-body'?'wrong':value,fault==='bound-tag-conflict'?'"other"':null);
  }
  return response(200,value,fault==='direct-get'?token():null);
 };
 const result=await probePrivateR2Write({env,clock:()=>now,fetcher,metadataFetcher});
 const valid=['head','put','direct-get'].includes(fault);
 assert.equal(result.state,valid?'R2_WRITE_PROBE_VERIFIED':'R2_WRITE_PROBE_FAILED');
 assert.equal(result.checks.sha256Verified,true);
 assert.equal(result.checks.cleanup,true);
 assert.equal(casCalls,valid?2:0);
 assert.ok(metadataCalls>=1);
 if(valid){assert.equal(boundCalls,1);assert.ok(Object.values(result.checks).every(Boolean));}
 if(!valid)assert.equal(result.failedStep,'METADATA');
 assert.equal(value,null);
}
console.log('R2 conditional write diagnostic mock tests passed');

// Owner page exposes the isolated POST only after explicit interaction.
import {readFileSync} from 'node:fs';
const ownerPage=readFileSync(new URL('../app/recupero-paper/page.tsx',import.meta.url),'utf8');
assert.match(ownerPage,/const R2_PROBE="\/api\/paper\/one-global-r2-probe"/);
assert.match(ownerPage,/if\(!authenticated\|\|r2InFlight\.current\|\|r2Blocked\)return/);
assert.match(ownerPage,/fetch\(R2_PROBE,\{method:"POST",credentials:"same-origin",cache:"no-store",headers:\{"x-fenice-diagnostic":"r2-write"\}\}\)/);
assert.match(ownerPage,/R2_CHECKS\.every\(key=>payload\.checks\?\.\[key\]===true\)/);
assert.match(ownerPage,/onClick=\{\(\)=>void runR2Probe\(\)\}/);
assert.equal((ownerPage.match(/fetch\(R2_PROBE/g)||[]).length,1);
console.log('R2 owner page wiring checks passed');

assert.match(ownerPage,/window\.localStorage\.setItem\(R2_PENDING_KEY,"pending"\)/);
assert.ok(ownerPage.indexOf('window.localStorage.setItem(R2_PENDING_KEY,"pending")')<ownerPage.indexOf('await fetch(R2_PROBE'));
assert.match(ownerPage,/restoreR2Guard\(\);\s*setAuthenticated\(true\)/);
assert.match(ownerPage,/disabled=\{r2Busy\|\|r2Blocked\}/);
assert.match(ownerPage,/window\.localStorage\.removeItem\(R2_PENDING_KEY\)/);
