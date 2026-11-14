/** Remove ONLY the obsolete recovery input. Never read/decrypt/copy its value. */
import {pathToFileURL} from 'node:url';
import {FENICE_VERCEL_SCOPE,normalizeVercelToken} from './vercel-api-request.mjs';
const KEY='FENICE_ONE_GLOBAL_EOD_RECOVERY_JSON';
const fail=()=>{throw Error('FENICE_RECOVERY_ENV_CLEANUP_NOT_CONFIRMED');};
export async function cleanupOneGlobalRecoveryEnv({token,fetcher=fetch}={}){
  const scope=FENICE_VERCEL_SCOPE,credential=normalizeVercelToken(token);
  async function call(method,suffix=''){
    try{
      const url=new URL('https://api.vercel.com/'+(method==='GET'?'v10':'v9')
        +'/projects/'+scope.projectId+'/env'+suffix);url.searchParams.set('teamId',scope.teamId);
      if(method==='GET')url.searchParams.set('decrypt','false');
      const r=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Authorization:'Bearer '+credential,Accept:'application/json'}});
      if(!r.ok)fail();
      if(method==='DELETE')return;
      const body=await r.json();
      if(!Array.isArray(body.envs)||body.envs.length>1000)fail();
      return body.envs.filter(e=>e.key===KEY).map(e=>({id:e.id,key:e.key,
        type:e.type,target:e.target,gitBranch:e.gitBranch,
        customEnvironmentIds:e.customEnvironmentIds}));
    }catch{fail();}
  }
  const entries=await call('GET');
  if(entries.length===0)return {state:'OBSOLETE_RECOVERY_ENV_ABSENT',removed:0};
  if(entries.length!==1)fail();
  const e=entries[0];
  // Pin the previously inspected variable as well as its exact purpose and
  // production-only scope. A changed variable requires a new review.
  if(e.id!=='bSDdgPwXOubEHHLm'||e.key!==KEY||e.type!=='sensitive'
    ||JSON.stringify(e.target)!=='["production"]'||e.gitBranch
    ||(e.customEnvironmentIds?.length||0)!==0)fail();
  await call('DELETE','/'+e.id);
  if((await call('GET')).length!==0)fail();
  return {state:'OBSOLETE_RECOVERY_ENV_REMOVED_VERIFIED',removed:1};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await cleanupOneGlobalRecoveryEnv({token:process.env.VERCEL_TOKEN})));}
  catch{console.error('FENICE_RECOVERY_ENV_CLEANUP_NOT_CONFIRMED');process.exitCode=1;}
}
