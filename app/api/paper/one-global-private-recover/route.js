/**
 * Owner-only, explicit one-time original EOD journal restoration.
 * Never accepts client-supplied journal bytes. Only the recovered immutable
 * source already stored in a server-side SENSITIVE environment variable.
 * A new Blob may be created once; an existing Blob is never overwritten.
 */
import {
  feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession,
} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {recoverOneGlobalOriginalPrivateEod} from '../../../../lib/trading/one-global-cloud-private-recovery.mjs';

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
export async function POST(request){
  // A browser must submit exactly from the same authenticated Fenice origin.
  if(!feniceSameOrigin(request))
    return json({state:'ORIGIN_DENIED',brokerConnectivityAllowed:false},403);
  const ownerSecret=process.env.FENICE_AI_OWNER_TOKEN;
  if(!ownerSecret||ownerSecret.length<32)
    return json({state:'OWNER_AUTH_NOT_CONFIGURED',brokerConnectivityAllowed:false},503);
  const authenticated=verifyFeniceOwnerSession(
    feniceSessionCookieFromRequest(request),ownerSecret,Date.now(),
  );
  if(!authenticated)
    return json({state:'OWNER_AUTH_REQUIRED',brokerConnectivityAllowed:false},401);
  const declared=Number(request.headers.get('content-length')||0);
  if(!Number.isFinite(declared)||declared>150
    ||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')
    return json({state:'INVALID_RECOVERY_CONFIRMATION',brokerConnectivityAllowed:false},400);
  try{
    const body=await request.text();
    if(body.length>150)return json({state:'INVALID_RECOVERY_CONFIRMATION',brokerConnectivityAllowed:false},400);
    const input=JSON.parse(body);
    if(input&&typeof input==='object'&&!Array.isArray(input)
      &&Object.keys(input).length===1
      &&input.confirm==='RECOVER_ORIGINAL_EOD_20261113'){
      const seedJson=process.env.FENICE_ONE_GLOBAL_EOD_RECOVERY_JSON;
      if(!seedJson)
        return json({state:'ORIGINAL_RECOVERY_SOURCE_NOT_CONFIGURED',
          brokerConnectivityAllowed:false},503);
      const storage=await createVercelPrivateEodBlobStore();
      const result=await recoverOneGlobalOriginalPrivateEod({
        storage,seedJson,
      });
      return json(result,result.state==='ORIGINAL_JOURNAL_RECOVERED_PRIVATE'?200:409);
    }
  }catch{
    // Never log raw journal, source evidence, signatures, tokens or SDK error.
    return json({state:'ORIGINAL_RECOVERY_BLOCKED',
      journalMutationAllowed:false,virtualFillsCreated:0,
      liveTradingAllowed:false,brokerConnectivityAllowed:false},409);
  }
  return json({state:'INVALID_RECOVERY_CONFIRMATION',brokerConnectivityAllowed:false},400);
}
// Intentionally no GET/PUT/PATCH/DELETE and no direct market/broker imports.
