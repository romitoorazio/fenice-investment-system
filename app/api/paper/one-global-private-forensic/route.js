/** Existing owner session only. No raw sources, consent or credentials exported. */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore} from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {handleOneGlobalPrivateForensicRequest} from '../../../../lib/trading/one-global-private-forensic-audit.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=60;
export async function GET(request){
  const secret=process.env.FENICE_AI_OWNER_TOKEN;
  const auth=request.headers.get('authorization');
  const bearer=typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7):null;
  const authorized=typeof secret==='string'&&secret.length>=32&&(isOwnerAuthorized(bearer,secret)
    ||verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),secret,Date.now()));
  return handleOneGlobalPrivateForensicRequest(request,{production:process.env.VERCEL_ENV==='production',
    authorized,storageFactory:async()=>pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore())});
}
