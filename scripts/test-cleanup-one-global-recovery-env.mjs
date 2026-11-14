import assert from 'node:assert/strict';
import {cleanupOneGlobalRecoveryEnv as clean} from './cleanup-one-global-recovery-env.mjs';
const original={id:'bSDdgPwXOubEHHLm',key:'FENICE_ONE_GLOBAL_EOD_RECOVERY_JSON',
  target:['production'],type:'sensitive',value:'DO_NOT_DISCLOSE_PRIVATE_SEED'};
let envs=[original,{id:'other',key:'BLOB_STORE_ID'}],deletes=0;
const fetcher=async(url,o)=>{
  assert.equal(url.origin,'https://api.vercel.com');
  assert.equal(url.searchParams.get('teamId'),'team_qi2mFTw4tEjq6x5zWqDyjNDP');
  assert(url.pathname.startsWith('/'+(o.method==='GET'?'v10':'v9')
    +'/projects/prj_KuTRkfN5G5cSMkqOaH5xlEV1K5By/env'));
  assert.equal(o.redirect,'error');
  if(o.method==='GET'){assert.equal(url.searchParams.get('decrypt'),'false');return Response.json({envs});}
  assert.equal(o.method,'DELETE');assert(url.pathname.endsWith('/bSDdgPwXOubEHHLm'));
  deletes++;envs=envs.filter(e=>e.id!==original.id);return new Response(null,{status:204});
};
const r=await clean({token:'fixture-vercel-only',fetcher});
assert.equal(r.state,'OBSOLETE_RECOVERY_ENV_REMOVED_VERIFIED');assert.equal(deletes,1);
assert.equal(envs[0].key,'BLOB_STORE_ID');
assert.equal((await clean({token:'fixture-vercel-only',fetcher})).removed,0);assert.equal(deletes,1);
for(const delta of [{id:'new-unreviewed-id'},{type:'plain'},{target:['preview']},{gitBranch:'other'}]){
  envs=[{...original,...delta}];await assert.rejects(clean({token:'fixture-vercel-only',fetcher}),/CLEANUP_NOT_CONFIRMED/);
  assert.equal(deletes,1);
}
for(const status of [401,403,429,500]){
  const e=await clean({token:'fixture-vercel-only',fetcher:async()=>Response.json({secret:original.value},{status})}).catch(e=>e);
  assert.equal(e.message,'FENICE_RECOVERY_ENV_CLEANUP_NOT_CONFIRMED');
}
assert(!JSON.stringify(r).includes(original.value));
console.log('PASS recovery cleanup: exact reviewed variable/project/team/production only, no decrypt, verified removal, idempotent, wrong-scope/auth failure closed.');
