import { pathToFileURL } from "node:url";

export const FENICE_VERCEL_SCOPE = Object.freeze({
  teamId: "team_qi2mFTw4tEjq6x5zWqDyjNDP",
  projectId: "prj_KuTRkfN5G5cSMkqOaH5xlEV1K5By",
  alias: "fenice-investment-system.vercel.app",
});
const SAFE_CODES=new Set(["forbidden","unauthorized","not_authorized","invalid_token","invalid_scope",
  "access_denied","token_expired","not_found","invalid_request","rate_limited","too_many_requests",
  "api-deployments-free-per-day","payment_required"]);
class VercelRequestError extends Error {}

function failure(code,status=0,upstreamCode="UPSTREAM_ERROR"){
  const advice=status===401||status===403
    ? "Verify the existing VERCEL_TOKEN credential has deployment access to the configured Fenice team/project; never bypass the release guard."
    : status===402 ? "Vercel quota or billing rejected the request; do not create repeated deployments or purchase an upgrade automatically."
    : status===429 ? "Vercel rate limit reached; do not retry this deployment in a tight loop."
    : "No deployment success is established. Inspect the scoped request and retry only after correcting the cause.";
  const error=new VercelRequestError(code+" (HTTP "+status+", code="+upstreamCode+"). "+advice);
  error.code=code;
  error.httpStatus=status;
  error.upstreamCode=upstreamCode;
  return error;
}

export function normalizeVercelToken(input){
  if(typeof input!=="string")throw failure("VERCEL_TOKEN_MISSING");
  const token=input.trim().replace(/^Bearer[ \t]+/i,"");
  if(!token)throw failure("VERCEL_TOKEN_MISSING");
  if(/[\s\x00-\x1f\x7f]/.test(token))throw failure("VERCEL_TOKEN_FORMAT_INVALID");
  return token;
}

export function hasPublishedExactSha(deployments,alias,sha){
  if(!/^[a-f0-9]{40}$/.test(sha||"")||alias?.projectId!==FENICE_VERCEL_SCOPE.projectId
    ||typeof alias?.deploymentId!=="string"||!Array.isArray(deployments?.deployments))return false;
  return deployments.deployments.some(row=>row?.state==="READY"
    &&row?.meta?.githubCommitSha===sha&&(row?.uid||row?.id)===alias.deploymentId);
}

function scopedRequest(method,resource,body){
  if(!["GET","POST"].includes(method)||typeof resource!=="string"||!resource.startsWith("/")
    ||resource.startsWith("//")||resource.includes("\\")||/[\s#]/.test(resource)){
    throw failure("VERCEL_REQUEST_SCOPE_INVALID");
  }
  const url=new URL(resource,"https://api.vercel.com");
  const scope=FENICE_VERCEL_SCOPE;
  if(url.origin!=="https://api.vercel.com"||url.searchParams.getAll("teamId").length!==1
    ||url.searchParams.get("teamId")!==scope.teamId)throw failure("VERCEL_REQUEST_SCOPE_INVALID");
  const listing=method==="GET"&&url.pathname==="/v6/deployments";
  const alias=method==="GET"&&url.pathname==="/v4/aliases/"+scope.alias;
  const inspect=method==="GET"&&/^\/v13\/deployments\/dpl_[A-Za-z0-9]+$/.test(url.pathname);
  const create=method==="POST"&&url.pathname==="/v13/deployments";
  if(!listing&&!alias&&!inspect&&!create)throw failure("VERCEL_REQUEST_SCOPE_INVALID");
  if((listing||alias)&&(url.searchParams.getAll("projectId").length!==1
    ||url.searchParams.get("projectId")!==scope.projectId))throw failure("VERCEL_REQUEST_SCOPE_INVALID");
  if(create){
    const source=body?.gitSource;
    if(body?.project!==scope.projectId||body?.name!=="fenice-investment-system"||body?.target!=="production"
      ||source?.type!=="github"||source?.org!=="romitoorazio"||source?.repo!=="fenice-investment-system"
      ||source?.ref!=="main"||!/^[a-f0-9]{40}$/.test(source?.sha||"")
      ||body?.meta?.githubCommitSha!==source.sha||body?.gitMetadata?.commitSha!==source.sha){
      throw failure("VERCEL_EXACT_RELEASE_BODY_INVALID");
    }
  }else if(body!==undefined)throw failure("VERCEL_REQUEST_SCOPE_INVALID");
  return url;
}

/** One bounded request. Neither credentials nor raw provider error bodies are logged. */
export async function requestVercelJson({method="GET",resource,body,token,fetcher=fetch,timeoutMs=30000}={}){
  const url=scopedRequest(method,resource,body);
  const credential=normalizeVercelToken(token);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw failure("VERCEL_TIMEOUT_INVALID");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher(url.href,{
      method,redirect:"error",signal:controller.signal,
      headers:{Authorization:"Bearer "+credential,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    let payload;
    try{payload=await response.json();}
    catch{
      if(controller.signal.aborted)throw failure("VERCEL_REQUEST_TIMEOUT");
      if(!response.ok)throw failure("VERCEL_API_REJECTED",response.status);
      throw failure("VERCEL_INVALID_JSON",response.status);
    }
    if(!response.ok){
      const rawCode=payload?.error?.code;
      const code=typeof rawCode==="string"&&SAFE_CODES.has(rawCode)?rawCode:"UPSTREAM_ERROR";
      throw failure(response.status===401||response.status===403?"VERCEL_API_AUTH_DENIED":"VERCEL_API_REJECTED",response.status,code);
    }
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw failure("VERCEL_INVALID_JSON",response.status);
    return payload;
  }catch(error){
    if(error instanceof VercelRequestError)throw error;
    throw failure(controller.signal.aborted?"VERCEL_REQUEST_TIMEOUT":"VERCEL_REQUEST_FAILED");
  }finally{clearTimeout(timer);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [, ,method,resource]=process.argv;
    let body;
    if(method==="POST"||method==="PUBLISHED_SHA"){
      let text="";
      for await(const part of process.stdin){
        text+=part;
        if(Buffer.byteLength(text)>1048576)throw failure("VERCEL_RELEASE_BODY_TOO_LARGE");
      }
      try{body=JSON.parse(text);}catch{throw failure("VERCEL_RELEASE_BODY_INVALID_JSON");}
    }
    if(method==="PUBLISHED_SHA"){
      process.stdout.write(JSON.stringify(hasPublishedExactSha(body?.deployments,body?.alias,resource)));
    }else{
    const result=await requestVercelJson({method,resource,body,token:process.env.VERCEL_TOKEN});
    process.stdout.write(JSON.stringify(result));
    }
  }catch(error){
    process.stderr.write((error instanceof VercelRequestError?error.message:"VERCEL_RELEASE_REQUEST_FAILED")+"\n");
    process.exitCode=1;
  }
}

