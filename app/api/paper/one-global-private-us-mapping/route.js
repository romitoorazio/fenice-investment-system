/** FENICE authenticated original US evidence review, owner-click only. */
import {feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore} from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {createProspectiveR2PaperStore} from '../../../../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {handleOneGlobalUsOwnerMappingRequest} from '../../../../lib/trading/one-global-us-owner-mapping-http.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=30;
function handle(request){
  // Explicit campaign selection only. No fallback between private journals.
  const campaign=new URL(request.url).searchParams.get('campaign')??'legacy';
  return handleOneGlobalUsOwnerMappingRequest(request,{
    production:process.env.VERCEL_ENV==='production',
    authorized:verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),process.env.FENICE_AI_OWNER_TOKEN,Date.now()),
    sameOrigin:feniceSameOrigin(request),
    storageFactory:async()=>{
      if(campaign==='r2')return createProspectiveR2PaperStore();
      if(campaign==='legacy')return pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore());
      throw Error('US_OWNER_MAPPING_CAMPAIGN_INVALID');
    }
  });
}
export const GET=handle;
export const POST=handle;
