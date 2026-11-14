/**
 * Read-only, owner-scoped private Blob journal health.
 * Never returns journal bytes, hashes, instruments, prices, positions, cash,
 * owner consent, publisher receipts, or credentials.
 * Does not initialize storage, mutate any event or contact a broker.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';

const safe=(state,extra={})=>({
  mode:'ONE_GLOBAL_PRIVATE_EOD_CLOUD_STATUS',
  state,
  journalMutationAllowed:false,
  brokerConnectivityAllowed:false,
  liveTradingAllowed:false,
  certifiedTrades:0,
  phase9Credit:0,
  ...extra,
});
export async function inspectOneGlobalPrivateEodCloudStatus({storage}={}){
  if(storage?.privateAccess!==true||storage?.durable!==true
    ||typeof storage?.read!=='function')
    return safe('PRIVATE_STORE_NOT_CONFIGURED');
  let snapshot;
  try{snapshot=await storage.read();}
  catch{return safe('PRIVATE_STORE_READ_UNAVAILABLE');}
  if(snapshot===null)return safe('ORIGINAL_JOURNAL_NOT_MIGRATED');
  if(!snapshot||typeof snapshot.body!=='string'
    ||typeof snapshot.etag!=='string'||!snapshot.etag.trim()
    ||Buffer.byteLength(snapshot.body,'utf8')>1_500_000)
    return safe('PRIVATE_STORE_SNAPSHOT_INVALID');
  try{
    const journal=JSON.parse(snapshot.body);
    const verified=replayOneGlobalEodPaperLedger(journal);
    if(verified?.valid!==true)return safe('ORIGINAL_JOURNAL_REPLAY_INVALID');
    return safe('ORIGINAL_JOURNAL_VALID_PRIVATE',{
      journalEventCount:journal.events.length,
      pendingSignalCount:verified.pendingSignals.length,
      virtualBuyCount:verified.virtualBuys,
      virtualSellCount:verified.virtualSells,
      closedVirtualRoundTrips:verified.closedVirtualRoundTrips,
      sourceLicensingAndOwnerApprovalStillRequired:true,
      actualMarketFillProven:false,
    });
  }catch{
    return safe('ORIGINAL_JOURNAL_REPLAY_INVALID');
  }
}
