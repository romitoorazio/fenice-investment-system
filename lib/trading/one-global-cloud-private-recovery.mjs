/**
 * ONE GLOBAL: owner-confirmed, create-only recovery of the 13 Nov 2026
 * ORIGINAL EOD journal from a sensitive Vercel environment value.
 *
 * No automatic GENESIS, no synthetic source data, no broker or PAPER FILL.
 * An existing Blob is never replaced, even if invalid, incomplete or older.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';

const fail=code=>{throw Error('CLOUD_PRIVATE_RECOVERY_'+code);};
const EXPECTED_LAST_HASH='a733637275ad95c086566a6d29213035fbb0f5060d222df7eddbf99f074adf89';
const MAX_BYTES=1_500_000;
const safe=(state,other={})=>({
  state,mode:'ONE_GLOBAL_ORIGINAL_PRIVATE_RECOVERY_ONCE',
  originalOverwritten:false,virtualFillsCreated:0,phase9Credit:0,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,...other,
});
function decodeOriginal(seedJson,expectedLastHash,expectedCount){
  if(typeof seedJson!=='string'||Buffer.byteLength(seedJson,'utf8')>MAX_BYTES
    ||Buffer.byteLength(seedJson,'utf8')<100)fail('PRIVATE_ORIGINAL_SEED_INVALID');
  let ledger;
  try{ledger=JSON.parse(seedJson);}catch{fail('PRIVATE_ORIGINAL_JSON_INVALID');}
  const state=replayOneGlobalEodPaperLedger(ledger);
  if(state.valid!==true||ledger.events?.length!==expectedCount
    ||ledger.lastHash!==expectedLastHash)
    fail('RECOVERED_ORIGINAL_FINGERPRINT_MISMATCH');
  // The known Nov13 recovery must preserve the two original country signals,
  // BAMI's invalid-window cancellation and still-pending CBA. This is NOT
  // permission to reconstruct prices or settle retroactively.
  if(expectedLastHash===EXPECTED_LAST_HASH
    &&(ledger.events[0]?.key!=='XASX:CBA'
      ||ledger.events[0]?.kind!=='SIGNAL'
      ||ledger.events[1]?.key!=='XMIL:BAMI'
      ||ledger.events[1]?.kind!=='SIGNAL'
      ||ledger.events[2]?.key!=='XMIL:BAMI'
      ||ledger.events[2]?.kind!=='CANCEL'
      ||state.virtualBuys!==0||state.virtualSells!==0
      ||state.pendingSignals.length!==1
      ||state.pendingSignals[0]!=='XASX:CBA'))
    fail('RECOVERED_ORIGINAL_HISTORY_MISMATCH');
  return {body:JSON.stringify(ledger,null,2)+'\n',events:ledger.events.length};
}
export async function recoverOneGlobalOriginalPrivateEod({
  storage,seedJson,expectedLastHash=EXPECTED_LAST_HASH,expectedEventCount=3,
}={}){
  if(storage?.privateAccess!==true||storage?.durable!==true
    ||typeof storage.read!=='function'
    ||typeof storage.createIfAbsent!=='function')
    fail('AUTHENTICATED_CREATE_ONLY_PRIVATE_STORAGE_REQUIRED');
  const prepared=decodeOriginal(seedJson,expectedLastHash,expectedEventCount);
  // Read before write, then rely on provider-side create-only atomicity
  // because a separate runner might race. There is NO overwrite fallback.
  let existing;
  try{existing=await storage.read();}catch{fail('PRIVATE_STORE_READ_FAILED');}
  if(existing!==null)return safe('EXISTING_ORIGINAL_NEVER_OVERWRITE');
  try{
    const inserted=await storage.createIfAbsent(prepared.body);
    if(inserted?.created!==true||!inserted.etag)
      fail('PRIVATE_CREATE_NOT_CONFIRMED');
  }catch(e){
    if(String(e?.message??'')==='CLOUD_PRIVATE_RECOVERY_PRIVATE_CREATE_NOT_CONFIRMED')throw e;
    fail('PRIVATE_CREATE_REJECTED_OR_CONCURRENT');
  }
  // Never count a successful transport receipt as successful original
  // recovery until a FULL private readback passes engine replay.
  let readback;
  try{readback=await storage.read();}catch{
    return safe('IMPORT_CREATED_AWAITING_READBACK');
  }
  if(!readback||readback.body!==prepared.body)
    return safe('IMPORT_CREATED_READBACK_UNVERIFIED');
  decodeOriginal(readback.body,expectedLastHash,expectedEventCount);
  return safe('ORIGINAL_JOURNAL_RECOVERED_PRIVATE',{
    journalEventCount:prepared.events,
    originalReplayVerified:true,
    paperFillCreated:false,
    sourceRightsIndependentlyCertified:false,
  });
}
