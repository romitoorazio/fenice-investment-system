// Event-driven, request-only fallback. Never approves, merges or trades.
// Only GitHub's trusted main workflow executes this file; PR code is not run.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const REPO="romitoorazio/fenice-investment-system";
const SHA=/^[a-f0-9]{40}$/;
const COMMAND="@cubic-dev-ai review this PR";
const BOT="coderabbitai[bot]";
const isBot=(user,login)=>user?.login===login&&user?.type==="Bot";
const isRateLimited=comment=>isBot(comment?.user,BOT)
  &&typeof comment.body==="string"
  &&comment.body.includes("<!-- coderabbit-ai-generated:v1 -->")
  &&(comment.body.split(/\r?\n/).includes("Review rate limited.")
    ||comment.body.includes("<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->"));
const validPr=pr=>pr?.state==="open"&&pr.draft===false&&pr.base?.ref==="main"
  &&pr.base?.repo?.full_name===REPO&&pr.base.repo.private===false
  &&pr.head?.repo?.full_name===REPO&&pr.head.repo.private===false
  &&typeof pr.head.sha==="string"&&SHA.test(pr.head.sha);
const skip=reason=>({action:"SKIP",reason,mergeAllowed:false,liveTradingAllowed:false});
function validEvent(event){
  return event?.action==="created"&&event.repository?.full_name===REPO
    &&event.repository.private===false&&event.issue?.pull_request
    &&Number.isSafeInteger(event.issue.number)&&event.issue.number>0
    &&Number.isSafeInteger(event.comment?.id)&&event.comment.id>0
    &&isBot(event.sender,BOT)&&isRateLimited(event.comment);
}
export function reviewFallbackPlan(event,pr,comments,reviews,now=Date.now()){
  if(!validEvent(event)||!validPr(pr)||pr.number!==event.issue.number)return skip("UNTRUSTED_EVENT_OR_PR");
  if(!Array.isArray(comments)||!Array.isArray(reviews)||comments.length>=100||reviews.length>=100)
    return skip("INCOMPLETE_HISTORY");
  const source=comments.find(c=>c.id===event.comment.id);
  const created=Date.parse(source?.created_at);
  if(!isRateLimited(source)||!Number.isFinite(created)||!Number.isFinite(now)
    ||created>now||now-created>30*60*1000)return skip("STALE_OR_UNVERIFIED_RATE_LIMIT");
  // Prefer no duplicate over guessing whether a prior manual request used this head.
  // Any prior Cubic request or response holds automatic fallback on this PR.
  if(comments.some(c=>typeof c.body==="string"&&(
    c.body.split(/\r?\n/).some(l=>l.trim()===COMMAND)
    ||isBot(c.user,"cubic-dev-ai[bot]")))
    ||reviews.some(v=>isBot(v.user,"cubic-dev-ai[bot]")||v.user?.login==="cubic-dev-ai"))
    return skip("CUBIC_ALREADY_REQUESTED_OR_REVIEWED");
  // The router never interprets or dismisses findings as approvals.
  if(reviews.some(v=>v.state==="CHANGES_REQUESTED"))return skip("EXISTING_CHANGE_REQUEST");
  const head=pr.head.sha;
  return {action:"REQUEST_CUBIC",pr:pr.number,head,body:COMMAND+"\n\n<!-- fenice-review-fallback:v1:"+head+" -->",
    mergeAllowed:false,liveTradingAllowed:false};
}
export async function routeIndependentReview(event,token,fetcher=fetch,clock=Date.now){
  if(!validEvent(event)||typeof token!=="string"||!token)return skip("UNTRUSTED_EVENT_OR_TOKEN");
  const number=event.issue.number;
  const root="https://api.github.com/repos/"+REPO;
  async function request(path,method="GET",body){
    const response=await fetcher(root+path,{
      method,redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok)throw Error("GITHUB_REQUEST_FAILED");
    return response.json();
  }
  const [pr,comments,reviews]=await Promise.all([
    request("/pulls/"+number),request("/issues/"+number+"/comments?per_page=100"),
    request("/pulls/"+number+"/reviews?per_page=100")
  ]);
  const plan=reviewFallbackPlan(event,pr,comments,reviews,clock());
  if(plan.action!=="REQUEST_CUBIC")return plan;
  // Recheck the head and history immediately before the sole write. A PR-wide
  // workflow concurrency group serializes requests; manual races remain possible.
  const [latest,latestComments,latestReviews]=await Promise.all([
    request("/pulls/"+number),request("/issues/"+number+"/comments?per_page=100"),
    request("/pulls/"+number+"/reviews?per_page=100")
  ]);
  const fresh=reviewFallbackPlan(event,latest,latestComments,latestReviews,clock());
  if(fresh.action!=="REQUEST_CUBIC"||fresh.head!==plan.head)return skip("PR_OR_HISTORY_CHANGED");
  const receipt=await request("/issues/"+number+"/comments","POST",{body:fresh.body});
  if(!Number.isSafeInteger(receipt?.id))throw Error("COMMENT_RECEIPT_UNVERIFIED");
  return {...fresh,action:"REQUEST_POSTED",commentId:receipt.id};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));
    const result=await routeIndependentReview(event,process.env.GH_TOKEN);
    console.log(JSON.stringify(result));
  }catch{
    console.error("FENICE_REVIEW_FALLBACK_UNAVAILABLE: no automatic retry; inspect GitHub state");
    process.exitCode=1;
  }
}
