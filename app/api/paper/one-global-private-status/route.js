/**
 * Vercel-only read-only ONE GLOBAL private EOD health endpoint.
 * Strictly OWNER-AUTHENTICATED. No write handler, no market-data ingestion,
 * no Directa, and no original journal bytes leave the server.
 */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {
  feniceSessionCookieFromRequest,verifyFeniceOwnerSession,
} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {inspectOneGlobalPrivateEodCloudStatus} from '../../../../lib/trading/one-global-cloud-private-status.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow',
};
const json=(body,status=200)=>Response.json(body,{status,headers});

export async function GET(request){
  const secret=process.env.FENICE_AI_OWNER_TOKEN;
  // Reuse the existing owner credential and signed HttpOnly session; do not
  // create, echo or change any secret merely to inspect Blob availability.
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
  try{
    const storage=await createVercelPrivateEodBlobStore();
    const status=await inspectOneGlobalPrivateEodCloudStatus({storage});
    return json(status);
  }catch{
    // Storage errors may include sensitive upstream details. Never return
    // original provider responses, URL, token or exception stack.
    return json({
      mode:'ONE_GLOBAL_PRIVATE_EOD_CLOUD_STATUS',
      state:'PRIVATE_STORE_CONNECTION_UNAVAILABLE',
      journalMutationAllowed:false,brokerConnectivityAllowed:false,
      liveTradingAllowed:false,certifiedTrades:0,phase9Credit:0,
    },503);
  }
}
// Deliberately no POST/PUT/PATCH/DELETE exports: this endpoint cannot commit
// a signal or PAPER fill. All future writes need their own explicit gate.
