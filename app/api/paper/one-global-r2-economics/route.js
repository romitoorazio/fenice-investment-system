import {feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createProspectiveR2PaperStore} from '../../../../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {assertProspectiveSnapshot} from '../../../../lib/trading/one-global-prospective-cycle-proof.mjs';
import {projectR2PaperEconomics} from '../../../../lib/ui/r2-paper-economics.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const json=(body,status=200)=>Response.json({...body,liveTradingAllowed:false,brokerConnectivityAllowed:false},{status,headers});
export async function GET(request){
  if(process.env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),process.env.FENICE_AI_OWNER_TOKEN,Date.now()))return json({state:'OWNER_AUTH_REQUIRED'},401);
  try{
    const storage=createProspectiveR2PaperStore(),snapshot=await storage.read();
    if(!snapshot||!assertProspectiveSnapshot(storage,snapshot))return json({state:'R2_ECONOMICS_NOT_VERIFIED'},409);
    return json(projectR2PaperEconomics(JSON.parse(snapshot.body)));
  }catch{return json({state:'R2_ECONOMICS_NOT_VERIFIED'},409);}
}
