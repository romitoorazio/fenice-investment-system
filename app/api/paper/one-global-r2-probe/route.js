/** Owner-only isolated R2 HEAD diagnostic. No journal access. */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {
  feniceSessionCookieFromRequest,verifyFeniceOwnerSession,
} from '@/lib/ai/fenice-owner-session';
import {probePrivateR2} from '../../../../lib/trading/one-global-r2-probe.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow',
};
const json=(body,status=200)=>Response.json({...body,journalMutationAllowed:false,brokerConnectivityAllowed:false,liveTradingAllowed:false},{status,headers});

export async function GET(request){
  const secret=process.env.FENICE_AI_OWNER_TOKEN;
  if(!secret||secret.length<32)return json({
    state:'PRIVATE_OWNER_ACCESS_NOT_CONFIGURED',brokerConnectivityAllowed:false,
    liveTradingAllowed:false,
  },503);
  const auth=request.headers.get('authorization');
  const bearer=typeof auth==='string'&&auth.startsWith('Bearer ')?
    auth.slice(7):null;
  const owner=isOwnerAuthorized(bearer,secret)
    ||verifyFeniceOwnerSession(
      feniceSessionCookieFromRequest(request),secret,Date.now(),
    );
  if(!owner)return json({state:'OWNER_AUTH_REQUIRED',brokerConnectivityAllowed:false,
    liveTradingAllowed:false},401);
  const result=await probePrivateR2();
  return json({...result,journalMutationAllowed:false,brokerConnectivityAllowed:false,liveTradingAllowed:false},result.state==='R2_PROBE_OBJECT_PRESENT'||result.state==='R2_PROBE_OBJECT_NOT_FOUND'?200:503);
}
