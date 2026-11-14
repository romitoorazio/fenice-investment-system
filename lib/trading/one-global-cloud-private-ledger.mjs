/**
 * ONE GLOBAL EOD — private cloud journal transaction boundary.
 * Storage is injected: only an authenticated, PRIVATE, durable backend with
 * real atomic ETag compare-and-swap may be connected. Never use public
 * GitHub artifacts, mutable cache or ephemeral runner files as journal state.
 *
 * Does not create owner approval, fabricate market data, initialize a new
 * journal, or ever connect to brokers. The existing original strict ledger
 * must be explicitly migrated and fully replayed before writing one event.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';

const fail=code=>{throw Error('CLOUD_PRIVATE_LEDGER_'+code);};
const MAX_BYTES=1_500_000;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function assertPrivateStore(store){
  if(!store||store.privateAccess!==true
    ||store.durable!==true||store.atomicCompareAndSwap!==true
    ||typeof store.read!=='function'||typeof store.compareAndSwap!=='function')
    fail('AUTHENTICATED_DURABLE_CAS_STORE_REQUIRED');
}
function parseExisting(snapshot){
  if(!snapshot)fail('ORIGINAL_JOURNAL_NOT_MIGRATED');
  if(typeof snapshot.etag!=='string'||!snapshot.etag.trim()
    ||snapshot.etag.length>256||typeof snapshot.body!=='string')
    fail('STORAGE_RESPONSE_INVALID');
  const size=Buffer.byteLength(snapshot.body,'utf8');
  if(size<30||size>MAX_BYTES)fail('SNAPSHOT_SIZE_INVALID');
  let ledger;
  try{ledger=JSON.parse(snapshot.body);}catch{fail('CORRUPT_ORIGINAL_JSON');}
  // Reject a legacy/non-original/broken hash chain instead of silently
  // resetting to a brand-new Genesis campaign.
  replayOneGlobalEodPaperLedger(ledger);
  return ledger;
}
function assertSingleForwardEvent(before,after){
  replayOneGlobalEodPaperLedger(before);
  replayOneGlobalEodPaperLedger(after);
  if(after.events.length!==before.events.length+1
    ||!equal(after.events.slice(0,-1),before.events)
    ||after.events.at(-1)?.prevHash!==before.lastHash
    ||after.events.at(-1)?.seq!==before.events.length+1
    ||after.cashEuro<0
    ||after.phase9Credit!==0
    ||after.liveTradingAllowed!==false
    ||after.brokerConnectivityAllowed!==false)
    fail('NOT_EXACTLY_ONE_VALID_FORWARD_EVENT');
  const event=after.events.at(-1);
  if(!['SIGNAL','FILL','CANCEL'].includes(event.kind)||!sha(event.hash))
    fail('INVALID_EVENT_KIND_OR_HASH');
  return event;
}
/**
 * Private ledger CAS writer. A truly private store implementation must
 * enforce its ETag CAS on the server side; a successful write may never be
 * reported by the adapter before the provider actually confirms it.
 *
 * @param {{storage, makeNext:(original)=>{ledger}|object}} args
 */
export async function commitOneGlobalCloudPrivateLedger({storage,makeNext}){
  assertPrivateStore(storage);
  if(typeof makeNext!=='function')fail('MUTATION_CALLBACK_REQUIRED');
  const snapshot=await storage.read();
  const original=parseExisting(snapshot);
  // Caller must compute the genuine event under the original strict engine,
  // using NOW and actual owner-reviewed EOD receipts when settling a FILL.
  const changed=await makeNext(structuredClone(original));
  const next=changed?.ledger??changed;
  const event=assertSingleForwardEvent(original,next);
  const serialized=JSON.stringify(next,null,2)+'\n';
  if(Buffer.byteLength(serialized,'utf8')>MAX_BYTES)fail('NEXT_JOURNAL_TOO_LARGE');
  let result;
  try{
    result=await storage.compareAndSwap({
      expectedEtag:snapshot.etag,body:serialized,contentType:'application/json',
    });
  }catch{
    // No blind retry, override or last-write-wins. Caller must re-read and
    // re-evaluate any authorization and actual market evidence from scratch.
    fail('ATOMIC_WRITE_REJECTED_RELOAD_REQUIRED');
  }
  if(result?.committed!==true||typeof result.etag!=='string'||!result.etag.trim())
    fail('ATOMIC_WRITE_NOT_CONFIRMED');
  return {committed:true,newEvents:1,eventKind:event.kind,
    lastHash:next.lastHash,ledgerEventCount:next.events.length,
    virtualBuys:next.events.filter(x=>x.kind==='FILL'&&x.side==='BUY').length,
    virtualSells:next.events.filter(x=>x.kind==='FILL'&&x.side==='SELL').length,
    certifiedTrades:0,phase9Credit:0,
    brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
