/** Explicit genesis HTTP boundary; dependencies are fixed by the production route. */
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json=(body,status=200)=>Response.json({...body,paperCycleActive:false,certifiedTrades:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false},{status,headers});
export function createGenesisHandlers({env, isOwnerAuthorized, feniceSessionCookieFromRequest, verifyFeniceOwnerSession, createProspectiveR2PaperStore, clock=Date.now}){
function authorized(request,mutation){
  const secret=env.FENICE_AI_OWNER_TOKEN;
  if(typeof secret!=='string'||secret.length<32)return false;
  const auth=request.headers.get('authorization');
  const bearer=auth?.startsWith('Bearer ')?auth.slice(7):null;
  if(isOwnerAuthorized(bearer,secret))return true;
  if(mutation&&(request.headers.get('origin')!==new URL(request.url).origin
    ||request.headers.get('x-fenice-diagnostic')!=='r2-prospective-genesis'))return false;
  return verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),secret,clock());
}
async function GET(request){
  if(env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!authorized(request,false))return json({state:'OWNER_AUTH_REQUIRED'},401);
  try{
    const recovery=await createProspectiveR2PaperStore().verifyCurrentSnapshot();
    return json(recovery?{state:'R2_PROSPECTIVE_GENESIS_PRESENT',...recovery}:{state:'R2_PROSPECTIVE_GENESIS_ABSENT'});
  }catch{return json({state:'R2_PROSPECTIVE_VERIFICATION_BLOCKED'},409);}
}
async function POST(request){
  if(env.VERCEL_ENV!=='production')return json({state:'PRODUCTION_ONLY'},403);
  if(!authorized(request,true))return json({state:'OWNER_AUTH_REQUIRED'},401);
  // A fixed explicit command only; no caller-provided journal, timestamps or orders.
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'
    ||!['37','33'].includes(request.headers.get('content-length')))return json({state:'GENESIS_REQUEST_INVALID'},400);
  try{
    const body=await request.text();
    if(body==='{"action":"BACKUP_PAPER_JOURNAL"}'){
      try{
        const store=createProspectiveR2PaperStore();
        const result=await store.backupCurrent();
        if(result?.verified!==true)return json({state:'R2_INDEPENDENT_BACKUP_BLOCKED'},409);
        const restored=await store.verifyIndependentBackup(result.digest);
        if(restored?.verified!==true||restored.eventCount!==result.eventCount||restored.startedAt!==result.startedAt)
          return json({state:'R2_INDEPENDENT_BACKUP_BLOCKED'},409);
        return json({state:'R2_INDEPENDENT_BACKUP_VERIFIED',verified:true,eventCount:restored.eventCount,startedAt:restored.startedAt,historicalCredit:0,paperFillsCreated:0});
      }catch{return json({state:'R2_INDEPENDENT_BACKUP_BLOCKED'},409);}
    }
    if(body!=='{"action":"INITIALIZE_PAPER_GENESIS"}')return json({state:'GENESIS_REQUEST_INVALID'},400);
    const store=createProspectiveR2PaperStore();
    const genesis=await store.initialize();
    const recovery=await store.verifyCurrentSnapshot();
    if(!recovery?.verified)return json({state:'R2_PROSPECTIVE_VERIFICATION_BLOCKED'},409);
    return json({state:'R2_PROSPECTIVE_GENESIS_VERIFIED',created:genesis.created,...recovery,paperFillsCreated:0});
  }catch{return json({state:'R2_PROSPECTIVE_INITIALIZATION_BLOCKED_RECHECK'},409);}
}

return {GET,POST};
}
