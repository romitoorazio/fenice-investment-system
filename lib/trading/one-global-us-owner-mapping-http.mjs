/** Private same-origin owner review transport; no unauthenticated source or broker API. */
import {inspectOneGlobalUsOwnerMapping,connectOneGlobalUsOwnerMapping} from './one-global-us-owner-mapping.mjs';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const blocked=state=>({state,paperFillsCreated:0,brokerConnectivityAllowed:false,liveTradingAllowed:false});
export async function handleOneGlobalUsOwnerMappingRequest(request,{
  production,authorized,sameOrigin,storageFactory,clock=()=>new Date().toISOString(),fetcher=fetch
}={}){
  if(production!==true)return json(blocked('US_OWNER_MAPPING_PRODUCTION_ONLY'),403);
  if(authorized!==true)return json(blocked('US_OWNER_MAPPING_OWNER_AUTH_REQUIRED'),401);
  if(!['GET','POST'].includes(request.method))return json(blocked('US_OWNER_MAPPING_METHOD_DENIED'),405);
  if(request.method==='POST'&&sameOrigin!==true)return json(blocked('US_OWNER_MAPPING_CSRF_DENIED'),403);
  try{
    const store=await storageFactory(),nowIso=clock();
    if(request.method==='GET')return json(await inspectOneGlobalUsOwnerMapping({storage:store,nowIso}));
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')
      return json(blocked('US_OWNER_MAPPING_JSON_REQUIRED'),400);
    const reader=request.body?.getReader();if(!reader)return json(blocked('US_OWNER_MAPPING_BODY_REQUIRED'),400);
    const pieces=[];let size=0;
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;
        size+=value.length;if(size>1400){await reader.cancel();return json(blocked('US_OWNER_MAPPING_BODY_TOO_LARGE'),413);}
        pieces.push(Buffer.from(value));}
    }finally{reader.releaseLock();}
    const input=JSON.parse(Buffer.concat(pieces).toString('utf8'));
    const result=await connectOneGlobalUsOwnerMapping({storage:store,nowIso,input,fetcher});
    return json(result);
  }catch(error){
    const code=/^US_OWNER_MAPPING_[A-Z0-9_]{3,100}$/.test(error?.message||'')
      ?error.message:'US_OWNER_MAPPING_PRIVATE_EVIDENCE_NOT_CONFIRMED';
    return json(blocked(code),409);
  }
}
