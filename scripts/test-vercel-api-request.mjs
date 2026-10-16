import assert from "node:assert/strict";
import { requestVercelJson,normalizeVercelToken,hasPublishedExactSha,FENICE_VERCEL_SCOPE as scope } from "./vercel-api-request.mjs";
const token="fixture-private-token";
const list="/v6/deployments?projectId="+scope.projectId+"&teamId="+scope.teamId+"&target=production&limit=30";
let calls=0;
const fetcher=async (url,options)=>{
  calls++;
  assert.equal(new URL(url).origin,"https://api.vercel.com");
  assert.equal(options.headers.Authorization,"Bearer "+token);
  assert.equal(options.redirect,"error");
  return Response.json({deployments:[]});
};
assert.equal(normalizeVercelToken(" \nBearer "+token+"\n"),token);
assert.throws(()=>normalizeVercelToken("bad\nheader"),/VERCEL_TOKEN_FORMAT_INVALID/);
assert.deepEqual(await requestVercelJson({resource:list,token:" Bearer "+token+" ",fetcher}),{deployments:[]});
assert.equal(calls,1);
for(const status of [401,403,402,429]){
  let attempts=0;
  const error=await requestVercelJson({resource:list,token,fetcher:async()=>{
    attempts++;return Response.json({error:{code:status===403?"forbidden":"UNKNOWN_"+token,message:token,secret:token}},{status});
  }}).then(()=>null,e=>e);
  assert.equal(error.httpStatus,status);
  assert.equal(error.message.includes(token),false,"Error details must not disclose raw upstream bodies or arbitrary codes");
  assert.equal(attempts,1,"Auth/quota failures must not create retry storms");
  if(status===403)assert.equal(error.upstreamCode,"forbidden");
}
for(const resource of ["https://evil.example/x","//evil.example/x","/v6/deployments?teamId=wrong&projectId="+scope.projectId,
  "/v6/deployments?teamId="+scope.teamId+"&teamId=wrong&projectId="+scope.projectId,
  "/v6/deployments?teamId="+scope.teamId+"&projectId=wrong",
  "/v9/projects?teamId="+scope.teamId]){
  await assert.rejects(()=>requestVercelJson({resource,token,fetcher}),/VERCEL_REQUEST_SCOPE_INVALID/);
}
assert.equal(calls,1,"Wrong scopes must be rejected before any request");
const sha="a".repeat(40);
const deployments={deployments:[{uid:"dpl_Current",state:"READY",meta:{githubCommitSha:sha}}]};
const alias={deploymentId:"dpl_Current",projectId:scope.projectId};
assert.equal(hasPublishedExactSha(deployments,alias,sha),true);
assert.equal(hasPublishedExactSha(deployments,{...alias,deploymentId:"dpl_Older"},sha),false,
  "An existing READY build cannot hide a stale or rolled-back production alias");
assert.equal(hasPublishedExactSha(deployments,{...alias,projectId:"wrong-project"},sha),false);
assert.equal(hasPublishedExactSha(deployments,alias,"b".repeat(40)),false);
assert.equal(hasPublishedExactSha({deployments:[{...deployments.deployments[0],state:"BUILDING"}]},alias,sha),false);
const body={name:"fenice-investment-system",project:scope.projectId,target:"production",
  gitSource:{type:"github",org:"romitoorazio",repo:"fenice-investment-system",ref:"main",sha},
  meta:{githubCommitSha:sha},gitMetadata:{commitSha:sha}};
let post=0;
await requestVercelJson({method:"POST",resource:"/v13/deployments?teamId="+scope.teamId,body,token,fetcher:async(url,options)=>{
  post++;assert.equal(options.method,"POST");assert.deepEqual(JSON.parse(options.body),body);
  return Response.json({id:"dpl_Fixture"});
}});
assert.equal(post,1);
await assert.rejects(()=>requestVercelJson({method:"POST",resource:"/v13/deployments?teamId="+scope.teamId,
  body:{...body,gitSource:{...body.gitSource,ref:"other"}},token,fetcher}),/VERCEL_EXACT_RELEASE_BODY_INVALID/);
await assert.rejects(()=>requestVercelJson({resource:list,token,fetcher:async()=>new Response("<html>"+token+"</html>",{status:403})}),/HTTP 403/);
const networkError=await requestVercelJson({resource:list,token,fetcher:async()=>{throw Error(token);}}).then(()=>null,e=>e);
assert(!networkError.message.includes(token));
const forgedNetworkError=await requestVercelJson({resource:list,token,fetcher:async()=>{
  const error=new Error(token);error.code="VERCEL_FORGED";throw error;
}}).then(()=>null,e=>e);
assert(!forgedNetworkError.message.includes(token));
await assert.rejects(()=>requestVercelJson({resource:list,token,timeoutMs:5,fetcher:async(url,{signal})=>
  new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(Error(token)),{once:true}))}),/VERCEL_REQUEST_TIMEOUT/);
console.log("Scoped Vercel requests: exact SHA/target, credential normalization, redacted 403/quota and bounded timeout PASS");

