/** Fixed trusted workflow only. Never accepts journals, source data, consent or orders. */
import {authorizeOneGlobalCloudWorkflow} from '../../../../lib/trading/one-global-cloud-workflow-auth.mjs';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {pinOneGlobalRecoveredOriginalStore} from '../../../../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {runOneGlobalCloudPaperCycle} from '../../../../lib/trading/one-global-cloud-paper-cycle.mjs';
import {auditOneGlobalFirstPrivateFill} from '../../../../lib/trading/one-global-private-forensic-audit.mjs';
import {publicOneGlobalFirstFillForensicSummary} from '../../../../lib/trading/one-global-cloud-cycle-report.mjs';
import {fetchOneGlobalCloudDualEod} from '../../../../lib/market/one-global-cloud-dual-eod-fetch.mjs';
import {inspectOneGlobalCloudSourceAccess} from '../../../../lib/trading/one-global-cloud-source-access.mjs';
import {alpacaSipCredentialsPresent} from '../../../../lib/market/one-global-alpaca-sip-eod.mjs';
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
    if(!input||Object.keys(input).length!==1
      ||!['RESEARCH_SIGNAL_CYCLE','AUDIT_FIRST_FILL_READ_ONLY'].includes(input.action))
      return json('CYCLE_REQUEST_INVALID',400);
    const storage=pinOneGlobalRecoveredOriginalStore(await createVercelPrivateEodBlobStore());
    if(input.action==='AUDIT_FIRST_FILL_READ_ONLY'){
      // Trusted workflow identity already passed the existing OIDC guard.
      // Read private originals; return only a strict, hash-free attestation.
      const audit=await auditOneGlobalFirstPrivateFill({storage});
      return Response.json(publicOneGlobalFirstFillForensicSummary(audit),{headers});
    }
    const report=await runOneGlobalCloudPaperCycle({storage,collect:fetchOneGlobalCloudDualEod,checkSourceAccess:inspectOneGlobalCloudSourceAccess});
    return Response.json({...report,providerConfiguration:{
      alphaVantageKeyPresent:Boolean(process.env.ALPHA_VANTAGE_API_KEY),
      alpacaSipKeyPresent:alpacaSipCredentialsPresent(),
      eodhdPersonalKeyPresent:Boolean(process.env.EODHD_API_TOKEN),
      twelveDataKeyPresent:Boolean(process.env.TWELVE_DATA_API_KEY||process.env.TWELVEDATA_API_KEY),
    }},{headers});
  }catch{
    // Error bodies and hashes from providers/Blob never enter response/logs.
    return Response.json({state:'PRIVATE_CYCLE_BLOCKED_RECHECK_ORIGINAL',paperFillsCreated:null,
      certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false},{status:409,headers});
  }
}
