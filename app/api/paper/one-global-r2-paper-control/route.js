/** Owner session only. Explicit PAPER consent, no journal mutations. */
import {feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createProspectiveR2PaperStore} from '../../../../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {authorizeR2Paper,readR2PaperControl} from '../../../../lib/trading/one-global-r2-paper-control.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const json=(body,status=200)=>Response.json({...body,brokerConnectivityAllowed:false,liveTradingAllowed:false,certifiedTrades:0,phase9Credit:0},{status,headers});
async function handle(request){
  if(process.env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),process.env.FENICE_AI_OWNER_TOKEN,Date.now()))return json({state:'OWNER_AUTH_REQUIRED'},401);
  try{
    if(request.method==='POST'){
      if(!feniceSameOrigin(request)||request.headers.get('x-fenice-diagnostic')!=='r2-paper-control')return json({state:'ORIGIN_DENIED'},403);
      const expected='{"action":"AUTHORIZE_R2_PAPER_30_DAYS"}';
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||Number(request.headers.get('content-length'))!==Buffer.byteLength(expected))return json({state:'REQUEST_INVALID'},400);
      if(await request.text()!==expected)return json({state:'REQUEST_INVALID'},400);
      return json(await authorizeR2Paper({storage:createProspectiveR2PaperStore(),reviewedCommit:process.env.VERCEL_GIT_COMMIT_SHA}));
    }
    return json(await readR2PaperControl({storage:createProspectiveR2PaperStore()}));
  }catch{return json({state:'R2_PAPER_CONTROL_RECHECK_REQUIRED'},409);}
}
export const GET=handle;
export const POST=handle;
