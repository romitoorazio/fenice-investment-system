/** Owner-authenticated independent prospective PAPER genesis. No fills, market calls or LIVE. */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createProspectiveR2PaperStore} from '../../../../lib/trading/one-global-r2-prospective-paper-store.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json=(body,status=200)=>Response.json({...body,paperCycleActive:false,certifiedTrades:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false},{status,headers});
function authorized(request,mutation){
  const secret=process.env.FENICE_AI_OWNER_TOKEN;
  if(typeof secret!=='string'||secret.length<32)return false;
  const auth=request.headers.get('authorization');
  const bearer=auth?.startsWith('Bearer ')?auth.slice(7):null;
  if(isOwnerAuthorized(bearer,secret))return true;
  if(mutation&&(request.headers.get('origin')!==new URL(request.url).origin
    ||request.headers.get('x-fenice-diagnostic')!=='r2-prospective-genesis'))return false;
  return verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),secret,Date.now());
}
export async function GET(request){
  if(process.env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!authorized(request,false))return json({state:'OWNER_AUTH_REQUIRED'},401);
  try{
    const recovery=await createProspectiveR2PaperStore().verifyCurrentSnapshot();
    return json(recovery?{state:'R2_PROSPECTIVE_GENESIS_PRESENT',...recovery}:{state:'R2_PROSPECTIVE_GENESIS_ABSENT'});
  }catch{return json({state:'R2_PROSPECTIVE_VERIFICATION_BLOCKED'},409);}
}
export async function POST(request){
  if(process.env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!authorized(request,true))return json({state:'OWNER_AUTH_REQUIRED'},401);
  // A fixed explicit command only; no caller-provided journal, timestamps or orders.
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'
    ||request.headers.get('content-length')!=='37')return json({state:'GENESIS_REQUEST_INVALID'},400);
  try{
    const body=await request.text();
    if(body!=='{"action":"INITIALIZE_PAPER_GENESIS"}')return json({state:'GENESIS_REQUEST_INVALID'},400);
    const store=createProspectiveR2PaperStore();
    const genesis=await store.initialize();
    const recovery=await store.verifyCurrentSnapshot();
    if(!recovery?.verified)return json({state:'R2_PROSPECTIVE_VERIFICATION_BLOCKED'},409);
    return json({state:'R2_PROSPECTIVE_GENESIS_VERIFIED',created:genesis.created,...recovery,paperFillsCreated:0});
  }catch{return json({state:'R2_PROSPECTIVE_INITIALIZATION_BLOCKED_RECHECK'},409);}
}
