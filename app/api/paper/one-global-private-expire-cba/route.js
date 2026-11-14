/**
 * Owner-only, explicit retirement of the known Nov 2026 CBA pilot.
 * This cannot submit or backfill a PAPER fill. No market quote is accepted.
 * A 48h regular-session window must have ACTUALLY elapsed; the exact
 * original CBA hash is pinned and the original private Blob is updated only
 * by server-atomic ETag CAS, preserving every prior original event.
 */
import {
  feniceSameOrigin,feniceSessionCookieFromRequest,verifyFeniceOwnerSession,
} from '@/lib/ai/fenice-owner-session';
import {createVercelPrivateEodBlobStore} from '../../../../lib/trading/one-global-vercel-private-blob-store.mjs';
import {commitOneGlobalCloudPrivateLedger} from '../../../../lib/trading/one-global-cloud-private-ledger.mjs';
import {expireOneGlobalEodSignal} from '../../../../lib/trading/one-global-eod-paper.mjs';
import {ORIGINAL_CBA_SIGNAL_HASH,ORIGINAL_CBA_SIGNAL_ID} from '../../../../lib/trading/one-global-private-pending-windows.mjs';

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
const safe=(state)=>({
  state,originalEventsPreserved:true,
  paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
export async function POST(request){
  if(!feniceSameOrigin(request))return json(safe('ORIGIN_DENIED'),403);
  const ownerSecret=process.env.FENICE_AI_OWNER_TOKEN;
  if(!ownerSecret||ownerSecret.length<32)
    return json(safe('OWNER_AUTH_NOT_CONFIGURED'),503);
  if(!verifyFeniceOwnerSession(
    feniceSessionCookieFromRequest(request),ownerSecret,Date.now(),
  ))return json(safe('OWNER_AUTH_REQUIRED'),401);
  const contentType=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const declared=Number(request.headers.get('content-length')||0);
  if(contentType!=='application/json'||!Number.isFinite(declared)||declared>110)
    return json(safe('INVALID_OWNER_CONFIRMATION'),400);
  try{
    const inputText=await request.text();
    if(inputText.length>110)return json(safe('INVALID_OWNER_CONFIRMATION'),400);
    const input=JSON.parse(inputText);
    if(!input||typeof input!=='object'||Array.isArray(input)
      ||Object.keys(input).length!==1
      ||input.confirm!=='RETIRE_EXPIRED_CBA_ORIGINAL_PAPER_PILOT')
      return json(safe('INVALID_OWNER_CONFIRMATION'),400);
    const storage=await createVercelPrivateEodBlobStore();
    const nowIso=new Date().toISOString();
    const applied=await commitOneGlobalCloudPrivateLedger({
      storage,
      makeNext:(original)=>{
        const cba=original.events.find(e=>e.kind==='SIGNAL'
          &&e.hash===ORIGINAL_CBA_SIGNAL_HASH
          &&e.signalId===ORIGINAL_CBA_SIGNAL_ID
          &&e.key==='XASX:CBA'&&e.referenceSessionDate==='2026-11-12'
          &&e.currency==='AUD'&&e.side==='BUY');
        if(!cba)throw Error('EXPECTED_ORIGINAL_CBA_NOT_FOUND');
        return expireOneGlobalEodSignal({
          previousLedger:original,nowIso,signalHash:cba.hash,
        });
      },
    });
    if(applied?.committed!==true||applied.eventKind!=='EXPIRE'
      ||applied.newEvents!==1||applied.virtualBuys!==0
      ||applied.virtualSells!==0||applied.liveTradingAllowed!==false)
      return json(safe('ORIGINAL_RETIREMENT_NOT_CONFIRMED'),409);
    return json({...safe('ORIGINAL_CBA_RETIRED_APPEND_ONLY'),
      journalEventCount:applied.ledgerEventCount});
  }catch{
    // This includes TOO_EARLY, conflicting ETag, missing Blob, corrupt
    // journal, already expired and any source error. Never echo raw details.
    return json(safe('ORIGINAL_CBA_RETIREMENT_BLOCKED_OR_NOT_YET_DUE'),409);
  }
}
// Never add GET/PUT/PATCH/DELETE; no untrusted event body or broker import.
