/** Original-document intake, signed owner session, no journal or market mutation. */
import {feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore} from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {handleOneGlobalPrivateInputRequest} from '../../../../lib/trading/one-global-private-input-http.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=30;
function handle(request){
  return handleOneGlobalPrivateInputRequest(request,{
    production:process.env.VERCEL_ENV==='production',
    authorized:verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),process.env.FENICE_AI_OWNER_TOKEN,Date.now()),
    sameOrigin:feniceSameOrigin(request),
    storageFactory:async()=>pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore()),
  });
}
export const GET=handle;
export const POST=handle;
