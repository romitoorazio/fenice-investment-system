/** Authenticated owner transport; imports documents only, never a settlement. */
import {importOneGlobalPrivateInputs,inspectOneGlobalPrivateInputs} from './one-global-private-input-intake.mjs';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const safe=state=>({state,paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false});
const json=(body,status=200)=>Response.json(body,{status,headers});
async function boundedBody(request){
  const reader=request.body?.getReader();if(!reader)throw Error('EMPTY_BODY');
  const parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.length;if(size>750000){await reader.cancel();throw Error('BODY_SIZE');}parts.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function handleOneGlobalPrivateInputRequest(request,{production,authorized,sameOrigin,storageFactory,clock=()=>new Date().toISOString()}={}){
  if(production!==true)return json(safe('PRODUCTION_ONLY'),403);
  if(authorized!==true)return json(safe('OWNER_AUTH_REQUIRED'),401);
  if(!['GET','POST'].includes(request.method))return json(safe('METHOD_NOT_ALLOWED'),405);
  if(request.method==='POST'&&sameOrigin!==true)return json(safe('ORIGIN_DENIED'),403);
  try{
    let input;
    if(request.method==='POST'){
      const length=Number(request.headers.get('content-length')||0);
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'
        ||!Number.isFinite(length)||length<0||length>750000)return json(safe('INVALID_PRIVATE_INPUT_REQUEST'),400);
      input=await boundedBody(request);
    }
    const storage=await storageFactory(),nowIso=clock();
    return json(request.method==='GET'?await inspectOneGlobalPrivateInputs({storage,nowIso}):
      await importOneGlobalPrivateInputs({storage,input,nowIso}));
  }catch(error){
    // Fixed codes only. Never echo uploaded bytes, API keys, source URLs or stacks.
    const code=/^(?:PRIVATE_INPUT|CLOUD_SETTLEMENT|CLOUD_BLOB)_[A-Z0-9_]{3,100}$/.test(error?.message||'')
      ?error.message:'PRIVATE_INPUT_IMPORT_NOT_CONFIRMED';
    return json(safe(code),409);
  }
}
