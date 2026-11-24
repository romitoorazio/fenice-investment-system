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
assert.equal(reviewComparison({...metadata,head:{sha:base,repo}},comparison,head),null);
assert.equal(reviewComparison(metadata,{...comparison,files:[{...file,filename:"data/private.json"}]},head),null);
assert.equal(reviewComparison(metadata,{...comparison,files:[{...file,additions:2}]},head),null);
assert.equal(parseReview({assessment:"NO_FINDINGS",findings:[{path:file.filename,severity:"HIGH",reason:"x"}]},[file.filename]),null);
assert.equal(parseReview({assessment:"FINDINGS",findings:[{path:"other",severity:"HIGH",reason:"x"}]},[file.filename]),null);
let calls=[];
const fetcher=async(url,opts)=>{calls.push({url,opts});return Response.json(url.includes("/pulls/")?metadata:url.includes("/compare/")?comparison:{choices:[{finish_reason:"stop",message:{content:JSON.stringify({assessment:"NO_FINDINGS",findings:[]})}}]});};
const key="sk-"+"x".repeat(30);
const result=await reviewFenicePullRequest(input,key,fetcher);
assert.equal(result.pr,666);assert.equal(result.base,base);assert.equal(result.mergeBase,base);
assert.equal(reviewComparison({...metadata,head:{sha:head,repo:{...repo,private:true}}},comparison,head),null);
assert.equal(reviewComparison(metadata,{...comparison,merge_base_commit:null},head),null);
assert.equal(parseReview({assessment:["NO_FINDINGS"],findings:[]},[file.filename]),null);
assert.equal(parseReview({assessment:"FINDINGS",findings:[{path:file.filename,severity:["HIGH"],reason:"x"}]},[file.filename]),null);
assert.equal(reviewComparison({...metadata,changed_files:2},{...comparison,files:[file,file]},head),null);
assert.equal(result.state,"ADVISORY");assert.equal(result.mergeAllowed,false);assert.equal(result.liveTradingAllowed,false);assert.equal(calls.length,3);
assert.equal(calls[0].opts.headers.Authorization,undefined);
assert.equal(JSON.parse(calls[2].opts.body).store,false);
calls=[];const refused=await reviewFenicePullRequest({...input,confirmMeteredReview:false},key,fetcher);
assert.equal(refused.state,"UNAVAILABLE");assert.equal(calls.length,0);
console.log("PASS integrated engineering review: explicit consent, exact SHA, restricted source, bounded diff, advisory only");

/* Exercise the actual Next route with synthetic credentials, not real API access. */
import {GET,POST} from "../app/api/analista-ingegneristica/route.ts";
import {createFeniceOwnerSession,FENICE_AI_SESSION_COOKIE} from "../lib/ai/fenice-owner-session.ts";
const testEnv={FENICE_GENERATIVE_AI_ENABLED:"true",FENICE_AI_MANUAL_ONLY:"true",FENICE_AI_OWNER_TOKEN:"fixture-owner-".repeat(4),OPENAI_API_KEY:key};
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
  assert.equal((await locked(await POST(req(JSON.stringify(input))),200)).state,"ADVISORY");
  assert.equal(calls.length,3,"one bounded model call after authorized consent");
  console.log("PASS real route handlers with mocked upstream: session, origin, consent, request limits and invariant safety flags");
} finally {
  globalThis.fetch=previousFetch;
  for(const [k,v] of Object.entries(previousEnv)) {if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
