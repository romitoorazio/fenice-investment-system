/** Fixed trusted workflow only. Never accepts journals, source data, consent or orders. */
import {authorizeOneGlobalCloudWorkflow} from '../../../../lib/trading/one-global-cloud-workflow-auth.mjs';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore,runOneGlobalCloudProspectiveCycle} from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {fetchOneGlobalCloudDualEod} from '../../../../lib/market/one-global-cloud-dual-eod-fetch.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow'};
const json=(state,status)=>Response.json({state,paperFillsCreated:0,
  certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false},{status,headers});
export async function POST(request){
  if(process.env.VERCEL_ENV!=='production')return json('PRODUCTION_ONLY',403);
  const auth=request.headers.get('authorization');
  try{
    await authorizeOneGlobalCloudWorkflow({token:auth?.startsWith('Bearer ')?auth.slice(7):null});
  }catch{return json('TRUSTED_WORKFLOW_AUTH_REQUIRED',401);}
  try{
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json'
      ||Number(request.headers.get('content-length')||0)>80)return json('CYCLE_REQUEST_INVALID',400);
    const text=await request.text();if(text.length>80)return json('CYCLE_REQUEST_INVALID',400);
    const input=JSON.parse(text);
    if(!input||Object.keys(input).length!==1||input.action!=='RESEARCH_SIGNAL_CYCLE')
      return json('CYCLE_REQUEST_INVALID',400);
    const storage=pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore());
    const report=await runOneGlobalCloudProspectiveCycle({storage,collect:fetchOneGlobalCloudDualEod});
    return Response.json(report,{headers});
  }catch{
    // Error bodies and hashes from providers/Blob never enter response/logs.
    return json('PRIVATE_CYCLE_BLOCKED_RECHECK_ORIGINAL',409);
  }
}
