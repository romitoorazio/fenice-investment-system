import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {authorizeOneGlobalCloudWorkflow as auth,SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'synthetic-github-key',use:'sig',alg:'RS256'};
const nowMs=Date.parse('2026-11-14T15:00:00.000Z'),now=nowMs/1000;
const claims={iss:'https://token.actions.githubusercontent.com',aud:SIGNAL_CYCLE_AUDIENCE,
  sub:'repo:romitoorazio/fenice-investment-system:ref:refs/heads/main',
  repository:'romitoorazio/fenice-investment-system',repository_id:'1298430952',
  repository_owner:'romitoorazio',repository_owner_id:'255534957',
  ref:'refs/heads/main',ref_type:'branch',event_name:'schedule',
  workflow_ref:'romitoorazio/fenice-investment-system/.github/workflows/one-global-eod-private-paper.yml@refs/heads/main',
  sha:'a'.repeat(40),run_id:'1234',iat:now,nbf:now-5,exp:now+300};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(c=claims,h={alg:'RS256',typ:'JWT',kid:key.kid}){
  const head=encode(h)+'.'+encode(c);
  return head+'.'+sign('RSA-SHA256',Buffer.from(head),privateKey).toString('base64url');
}
let calls=0;
const fetcher=async(url,options)=>{
  calls++;assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  return Response.json({keys:[key]});
};
const check=(c=claims,h)=>auth({token:jwt(c,h),nowMs,fetcher});
assert.deepEqual(await check(),{authorized:true});
assert.deepEqual(await check({...claims,event_name:'workflow_run'}),{authorized:true});
assert.deepEqual(await check({...claims,sub:'repo:romitoorazio@255534957/fenice-investment-system@1298430952:ref:refs/heads/main'}),{authorized:true});
for(const delta of [{iss:'https://attacker.example'},{aud:'other-route'},
  {repository:'attacker/fork'},{repository_id:'999'},{repository_owner_id:'999'},
  {ref:'refs/pull/1/merge'},{ref_type:'tag'},{event_name:'pull_request'},
  {event_name:'pull_request_target'},{event_name:'push'},
  {workflow_ref:claims.workflow_ref.replace('one-global-eod-private-paper','ci')},
  {sub:'repo:romitoorazio/fenice-investment-system:pull_request'},
  {sub:claims.sub.replace('main','feature')},{exp:now},{iat:now+60},
  {iat:now-901,exp:now+300},{nbf:now+90},{exp:now+3600},
  {sha:'not-a-sha'},{run_id:'../1'}]){
  const before=calls;await assert.rejects(check({...claims,...delta}),/CLOUD_WORKFLOW_AUTH_DENIED/);
  assert.equal(calls,before,'wrong claims rejected before network');
}
for(const delta of [{alg:'none'},{alg:'HS256'},{jku:'https://evil.example'},{kid:'../evil'}])
  await assert.rejects(check(claims,{alg:'RS256',typ:'JWT',kid:key.kid,...delta}),/AUTH_DENIED/);
const token=jwt();
await assert.rejects(auth({token:token.slice(0,-20)+'a'.repeat(20),nowMs,fetcher}),/AUTH_DENIED/);
await assert.rejects(auth({token,nowMs,fetcher:async()=>Response.json({keys:[{...key,kid:'wrong'}]})}),/AUTH_DENIED/);
await assert.rejects(auth({token,nowMs,fetcher:async()=>{throw Error('sensitive-raw-token');}}),/^Error: CLOUD_WORKFLOW_AUTH_DENIED$/);
console.log('PASS GitHub OIDC: real RSA verification, exact audience/repo IDs/main/workflow, immutable subject, PR/fork/expiry/algorithm/signature/key/transport denial.');
