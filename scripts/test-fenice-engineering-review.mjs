import assert from "node:assert/strict";
import {reviewInput,reviewComparison,parseReview,reviewFenicePullRequest} from "../lib/ai/fenice-engineering-review.ts";
const head="a".repeat(40),base="b".repeat(40),repo={full_name:"romitoorazio/fenice-investment-system",private:false};
const input={pr:666,head,confirmMeteredReview:true};
const metadata={state:"open",head:{sha:head,repo},base:{sha:base,repo,ref:"main"},changed_files:1};
const file={filename:"lib/intelligence/calibration-engine.mjs",status:"modified",patch:"@@ -1 +1 @@\n-old\n+new",additions:1,deletions:1};
const comparison={base_commit:{sha:base},merge_base_commit:{sha:base},commits:[{sha:head}],files:[file]};
assert.deepEqual(reviewInput(input),input);
assert.equal(reviewInput({...input,confirmMeteredReview:false}),null);
assert.equal(reviewInput({...input,head:"main"}),null);
assert.equal(reviewComparison(metadata,comparison,head).length,1);

// The actual #683 file scope: exact research runner, research helper and test.
// Other runners, private data, broker code and self-review remain forbidden.
const ledgerFiles=[
  {...file,filename:"lib/intelligence/decision-ledger-price-evidence.mjs"},
  {...file,filename:"scripts/run-decision-ledger.mjs"},
  {...file,filename:"scripts/test-decision-ledger-retention.mjs"}
];
assert.equal(reviewComparison({...metadata,changed_files:3},{...comparison,files:ledgerFiles},head)?.length,3);
for(const filename of ["scripts/run-paper-oms.mjs","scripts/run-directa-readonly.mjs","scripts/run-decision-ledger-extra.mjs","lib/ai/fenice-engineering-review.ts","data/decision-ledger.json"]){
  assert.equal(reviewComparison(metadata,{...comparison,files:[{...file,filename}]},head),null);
}

assert.equal(reviewComparison({...metadata,head:{sha:base,repo}},comparison,head),null);
assert.equal(reviewComparison(metadata,{...comparison,files:[{...file,filename:"data/private.json"}]},head),null);
assert.equal(reviewComparison(metadata,{...comparison,files:[{...file,additions:2}]},head),null);
assert.equal(parseReview({assessment:"NO_FINDINGS",findings:[{path:file.filename,severity:"HIGH",reason:"x"}]},[file.filename]),null);
assert.equal(parseReview({assessment:"FINDINGS",findings:[{path:"other",severity:"HIGH",reason:"x"}]},[file.filename]),null);
let calls=[];
const fetcher=async(url,opts)=>{calls.push({url,opts});return Response.json(url.includes("/pulls/")?metadata:url.includes("/compare/")?comparison:{choices:[{finish_reason:"stop",message:{content:JSON.stringify({assessment:"NO_FINDINGS",findings:[]})}}]});};
const key="sk-"+"x".repeat(30);
const reserve=async()=>({allowed:true,reservedCents:400,warning:true});
const result=await reviewFenicePullRequest(input,key,fetcher,reserve,()=>Date.parse("2026-11-15T12:00:00Z"));
assert.equal(result.pr,666);assert.equal(result.base,base);assert.equal(result.mergeBase,base);
assert.equal(reviewComparison({...metadata,head:{sha:head,repo:{...repo,private:true}}},comparison,head),null);
assert.equal(reviewComparison(metadata,{...comparison,merge_base_commit:null},head),null);
assert.equal(parseReview({assessment:["NO_FINDINGS"],findings:[]},[file.filename]),null);
assert.equal(parseReview({assessment:"FINDINGS",findings:[{path:file.filename,severity:["HIGH"],reason:"x"}]},[file.filename]),null);
assert.equal(reviewComparison({...metadata,changed_files:2},{...comparison,files:[file,file]},head),null);
assert.equal(result.state,"ADVISORY");assert.equal(result.budget.warning,true);assert.equal(result.budget.reservedCents,400);assert.equal(JSON.parse(calls[2].opts.body).max_tokens,1024);assert.equal(result.mergeAllowed,false);assert.equal(result.liveTradingAllowed,false);assert.equal(calls.length,3);
assert.equal(calls[0].opts.headers.Authorization,undefined);
assert.equal(JSON.parse(calls[2].opts.body).store,false);
calls=[];const refused=await reviewFenicePullRequest({...input,confirmMeteredReview:false},key,fetcher);
assert.equal(refused.state,"UNAVAILABLE");assert.equal(calls.length,0);
for(const deny of [undefined,async()=>({allowed:false,reservedCents:500,warning:true}),async()=>{throw Error("storage down");}]){
  calls=[];const blocked=await reviewFenicePullRequest(input,key,fetcher,deny);
  assert.equal(blocked.state,"UNAVAILABLE");assert.equal(calls.filter(c=>c.url.includes("api.openai.com")).length,0);
}
calls=[];let ticks=[Date.parse("2026-11-30T23:58:00Z"),Date.parse("2026-12-01T00:00:01Z")];
assert.equal((await reviewFenicePullRequest(input,key,fetcher,reserve,()=>ticks.shift())).state,"UNAVAILABLE");
assert.equal(calls.filter(c=>c.url.includes("api.openai.com")).length,0);
console.log("PASS integrated engineering review: explicit consent, exact SHA, restricted source, bounded diff, advisory only");

/* Exercise the actual Next route with synthetic credentials, not real API access. */
import {GET,POST} from "../app/api/analista-ingegneristica/route.ts";
import {createFeniceOwnerSession,FENICE_AI_SESSION_COOKIE} from "../lib/ai/fenice-owner-session.ts";
const testEnv={VERCEL_ENV:"preview",FENICE_GENERATIVE_AI_ENABLED:"true",FENICE_AI_MANUAL_ONLY:"true",FENICE_AI_OWNER_TOKEN:"fixture-owner-".repeat(4),OPENAI_API_KEY:key};
const previousEnv=Object.fromEntries(Object.keys(testEnv).map(k=>[k,process.env[k]]));
const previousFetch=globalThis.fetch;
const origin="https://example.invalid";
const req=(body,headers={})=>new Request(origin+"/api/analista-ingegneristica",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,Cookie:FENICE_AI_SESSION_COOKIE+"="+createFeniceOwnerSession(testEnv.FENICE_AI_OWNER_TOKEN,Date.now()),...headers},body});
const locked=async(response,status)=>{
  assert.equal(response.status,status);
  assert.match(response.headers.get("Cache-Control"),/no-store/);
  const result=await response.json();
  assert.equal(result.mergeAllowed,false);assert.equal(result.brokerOrderAllowed,false);assert.equal(result.liveTradingAllowed,false);
  return result;
};
try {
  Object.assign(process.env,testEnv);
  globalThis.fetch=fetcher;
  calls=[];
  assert.equal((await locked(await GET(),200)).state,"READY");
  await locked(await POST(req(JSON.stringify(input),{Cookie:""})),403);
  await locked(await POST(req(JSON.stringify(input),{Origin:"https://foreign.invalid"})),403);
  await locked(await POST(req(JSON.stringify(input),{Cookie:FENICE_AI_SESSION_COOKIE+"=invalid"})),403);
  await locked(await POST(req(JSON.stringify({...input,confirmMeteredReview:false}))),400);
  await locked(await POST(req("{invalid")),400);
  await locked(await POST(req("x".repeat(801))),400);
  await locked(await POST(req(JSON.stringify(input),{"Content-Length":"801"})),400);
  await locked(await POST(req(JSON.stringify(input),{"Content-Type":"text/application/json"})),400);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await locked(await GET(),200)).state,"SETUP_REQUIRED");
  await locked(await POST(req(JSON.stringify(input))),503);
  assert.equal(calls.length,0,"no external calls on readiness or rejected requests");
  process.env.OPENAI_API_KEY=key;
  assert.equal((await locked(await POST(req(JSON.stringify(input))),200)).state,"UNAVAILABLE");
  assert.equal(calls.length,2,"preview cannot reserve production budget or invoke paid API");
  console.log("PASS real route handlers with mocked upstream: session, origin, consent, request limits and invariant safety flags");
} finally {
  globalThis.fetch=previousFetch;
  for(const [k,v] of Object.entries(previousEnv)) {if(v===undefined)delete process.env[k];else process.env[k]=v;}
}


/* Independent fallback: real provider quota fixture, bounded request-only plan,
   no model calls, no authorization by a PR author or untrusted comment. */
import {reviewFallbackPlan,routeIndependentReview} from "./route-independent-review.mjs";
const routerRepo={full_name:"romitoorazio/fenice-investment-system",private:false};
const routerHead="d".repeat(40),routerTime=Date.parse("2026-11-25T21:28:00Z");
const rabbit={login:"coderabbitai[bot]",type:"Bot"};
const quotaComment={id:101,user:rabbit,created_at:new Date(routerTime-1000).toISOString(),
  body:"<!-- coderabbit-ai-generated:v1 -->\n<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->"};
const routerEvent={action:"created",repository:routerRepo,issue:{number:685,pull_request:{}},
  sender:rabbit,comment:quotaComment};
const routerPr={number:685,state:"open",draft:false,head:{sha:routerHead,repo:routerRepo},
  base:{ref:"main",repo:routerRepo}};
const plan=reviewFallbackPlan(routerEvent,routerPr,[quotaComment],[],routerTime);
assert.equal(plan.action,"REQUEST_CUBIC");
assert.equal(plan.head,routerHead);assert.equal(plan.mergeAllowed,false);assert.equal(plan.liveTradingAllowed,false);
assert.match(plan.body,/^@cubic-dev-ai review this PR/);
const quotaReply={...quotaComment,body:"<!-- This is an auto-generated reply by CodeRabbit -->\n<!-- CodeRabbit review command invocation: v2:fixture -->\n<details>\n<summary>Action not completed</summary>\n\nReview rate limited.\n</details>"};
assert.equal(reviewFallbackPlan({...routerEvent,comment:quotaReply},routerPr,[quotaReply],[],routerTime).action,"REQUEST_CUBIC");
for(const body of ["Review rate limited.","<!-- coderabbit-ai-generated:v1 -->\nReview rate limited.","<!-- This is an auto-generated reply by CodeRabbit -->\nReview finished."]){
  const invalid={...quotaComment,body};
  assert.equal(reviewFallbackPlan({...routerEvent,comment:invalid},routerPr,[invalid],[],routerTime).action,"SKIP");
}
const blockedFixtures=[
  [{...routerEvent,sender:{login:"attacker",type:"User"}},routerPr,[quotaComment],[]],
  [{...routerEvent,comment:{...quotaComment,user:{login:"coderabbitai[bot]",type:"User"}}},routerPr,[quotaComment],[]],
  [routerEvent,{...routerPr,draft:true},[quotaComment],[]],
  [routerEvent,{...routerPr,head:{...routerPr.head,repo:{...routerRepo,full_name:"fork/fenice"}}},[quotaComment],[]],
  [routerEvent,{...routerPr,base:{...routerPr.base,ref:"other"}},[quotaComment],[]],
  [routerEvent,routerPr,[{...quotaComment,created_at:new Date(routerTime-3600000).toISOString()}],[]],
  [routerEvent,routerPr,[quotaComment,{body:plan.body}],[]],
  [routerEvent,routerPr,[quotaComment,{user:{login:"cubic-dev-ai[bot]",type:"Bot"},body:"started"}],[]],
  [routerEvent,routerPr,[quotaComment],[{state:"CHANGES_REQUESTED"}]],
  [routerEvent,routerPr,Array(100).fill(quotaComment),[]],
  [routerEvent,routerPr,[],[]]
];
for(const fixture of blockedFixtures)assert.equal(reviewFallbackPlan(...fixture,routerTime).action,"SKIP");
function fakeGithub({changeHead=false,duplicate=false,fail=false,failPost=false}={}){
  let reads=0,commentReads=0;const requests=[];
  return {requests,fetcher:async(url,opts)=>{
    requests.push({url,opts});
    if(fail)return Response.json({}, {status:403});
    if(opts.method==="POST")return failPost?Response.json({}, {status:403}):Response.json({id:987});
    if(url.endsWith("/pulls/685"))return Response.json({...routerPr,head:{...routerPr.head,
      sha:changeHead&&++reads>1?"e".repeat(40):routerHead}});
    if(url.includes("/comments?"))return Response.json(duplicate&&++commentReads>1?[quotaComment,{body:plan.body}]:[quotaComment]);
    if(url.includes("/reviews?"))return Response.json([]);
    throw Error("unexpected request");
  }};
}
const goodRoute=fakeGithub();
const posted=await routeIndependentReview(routerEvent,"fixture-token",goodRoute.fetcher,()=>routerTime);
assert.equal(posted.action,"REQUEST_POSTED");assert.equal(posted.commentId,987);
const writes=goodRoute.requests.filter(c=>c.opts.method==="POST");
assert.equal(writes.length,1);
assert.match(writes[0].url,/\/issues\/685\/comments$/);
assert.deepEqual(JSON.parse(writes[0].opts.body),{body:plan.body});
for(const options of [{changeHead:true},{duplicate:true}]){
  const mock=fakeGithub(options);
  assert.equal((await routeIndependentReview(routerEvent,"fixture-token",mock.fetcher,()=>routerTime)).action,"SKIP");
  assert.equal(mock.requests.filter(c=>c.opts.method==="POST").length,0);
}
const failedRoute=fakeGithub({fail:true});
await assert.rejects(routeIndependentReview(routerEvent,"fixture-token",failedRoute.fetcher,()=>routerTime));
assert.equal(failedRoute.requests.filter(c=>c.opts.method==="POST").length,0);
const failedWrite=fakeGithub({failPost:true});
await assert.rejects(routeIndependentReview(routerEvent,"fixture-token",failedWrite.fetcher,()=>routerTime),/GITHUB_REQUEST_FAILED/);
assert.equal(failedWrite.requests.filter(c=>c.opts.method==="POST").length,1);
assert.equal(failedWrite.requests.filter(c=>c.opts.method==="GET").length,6);
console.log("PASS independent review fallback: authenticated rate-limit evidence, no duplicate, no merge permissions, changed head fail closed");
