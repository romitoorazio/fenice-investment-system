import { generativeAvailability,FENICE_GENERATIVE_MODEL } from "../../../lib/ai/fenice-generative-research.ts";
import { feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession } from "../../../lib/ai/fenice-owner-session.ts";
import { reserveProductionAiBudget } from "../../../lib/ai/fenice-budget-blob.ts";
import { reviewInput,reviewFenicePullRequest } from "../../../lib/ai/fenice-engineering-review.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const json=(body:object,status=200)=>Response.json({...body,mergeAllowed:false,brokerOrderAllowed:false,liveTradingAllowed:false},{status,headers});
export async function GET(){return json({state:generativeAvailability(process.env)==="READY"?"READY":"SETUP_REQUIRED",model:FENICE_GENERATIVE_MODEL,ownerAccessRequired:true,manualOnly:true,costMetered:true,mergeAllowed:false,brokerOrderAllowed:false});}
export async function POST(request:Request){
  if(!feniceSameOrigin(request)||!verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),process.env.FENICE_AI_OWNER_TOKEN,Date.now()))return json({error:"OWNER_AUTH_REQUIRED",mergeAllowed:false},403);
  if(generativeAvailability(process.env)!=="READY")return json({error:"AI_NOT_CONFIGURED",mergeAllowed:false},503);
  if(request.headers.get("content-type")?.toLowerCase().split(";")[0].trim()!=="application/json")return json({error:"INVALID_REQUEST",mergeAllowed:false},400);
  const declared=request.headers.get("content-length");
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>800))return json({error:"INVALID_REQUEST"},400);
  const reader=request.body?.getReader();if(!reader)return json({error:"INVALID_REQUEST",mergeAllowed:false},400);
  let bytes=0;const chunks:Buffer[]=[];
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>800)return json({error:"INVALID_REQUEST",mergeAllowed:false},400);chunks.push(Buffer.from(value));}
    const input=reviewInput(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if(!input)return json({error:"INVALID_REQUEST_OR_COST_CONFIRMATION",mergeAllowed:false},400);
    const result=await reviewFenicePullRequest(input,process.env.OPENAI_API_KEY||"",fetch,()=>reserveProductionAiBudget(Date.now()));
    return json(result);
  }catch{return json({error:"REVIEW_UNAVAILABLE",mergeAllowed:false},400);}
  finally{try{await reader.cancel();}catch{}}
}
