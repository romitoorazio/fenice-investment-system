/** Owner-only, read-only original PAPER BUY->SELL forensic P&L.
 * Never discloses symbols, source documents, hashes or credentials.
 * No POST, broker transport, approval change, archive or journal writer.
 */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {feniceSessionCookieFromRequest,verifyFeniceOwnerSession}
  from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore}
  from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore}
  from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {auditOneGlobalLatestPrivateRoundTrip}
  from '../../../../lib/trading/one-global-private-roundtrip-audit.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow'};
const json=(state,status)=>Response.json({
  mode:'ONE_GLOBAL_PRIVATE_ROUNDTRIP_FORENSIC_READ_ONLY',state,
  roundTripForensicallyVerified:false,virtualPerformanceCertified:false,
  strategyPerformanceCertified:false,actualBrokerExecutionProven:false,
  journalMutationAllowed:false,paperFillsCreated:0,certifiedTrades:0,
  phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
},{status,headers});
export async function GET(request){
  if(process.env.VERCEL_ENV!=='production')return json('PRODUCTION_ONLY',403);
  const secret=process.env.FENICE_AI_OWNER_TOKEN;
  if(typeof secret!=='string'||secret.length<32)return json('OWNER_ACCESS_NOT_CONFIGURED',503);
  const auth=request.headers.get('authorization');
  const bearer=auth?.startsWith('Bearer ')?auth.slice(7):null;
  const owner=isOwnerAuthorized(bearer,secret)
    ||verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),secret,Date.now());
  if(!owner)return json('OWNER_AUTH_REQUIRED',401);
  try{
    const storage=pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore());
    const report=await auditOneGlobalLatestPrivateRoundTrip({storage});
    return Response.json(report,{status:report.state==='ROUNDTRIP_AUDIT_NOT_CONFIRMED'?503:200,headers});
  }catch{return json('ROUNDTRIP_AUDIT_NOT_CONFIRMED',503);}
}
// Never implement a write method here.
