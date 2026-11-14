/** One existing cloud cycle, one original journal, settlement before new research. */
import {runOneGlobalCloudSettlementCycle} from './one-global-cloud-settlement.mjs';
import {runOneGlobalCloudProspectiveCycle} from './one-global-cloud-prospective-cycle.mjs';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
export async function runOneGlobalCloudPaperCycle({storage,collect,clock=()=>new Date().toISOString(),fetcher=fetch,checkSourceAccess}={}){
  const settlement=await runOneGlobalCloudSettlementCycle({storage,clock,fetcher});
  // Keep invocation bounded; a successful FILL never waits on another provider.
  const research=settlement.paperFillsCreated===1?{
    state:'STRICT_PAPER_FILL_COMMITTED_PRIVATE',newSignals:0,sourcePairsAttempted:0,
    canonicalSignalCommitted:false,
  }:await runOneGlobalCloudProspectiveCycle({storage,collect,clock});
  // Outside-window weekend checks exercise the new data path without a
  // historical SIGNAL or FILL. The callback is fixed by the trusted route.
  let sourceAccessCheck;
  if(typeof checkSourceAccess==='function'&&settlement.paperFillsCreated===0
    &&research.state==='ORIGINAL_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW'
    &&[0,6].includes(new Date(clock()).getUTCDay())){
    sourceAccessCheck=await checkSourceAccess({storage,clock,fetcher});
  }
  // Report the final authenticated read, including any legitimate concurrent
  // writer, rather than returning a count captured before the research stage.
  const snapshot=await storage.read();
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>1500000)
    throw Error('CLOUD_SETTLEMENT_FINAL_JOURNAL_READBACK_REQUIRED');
  const ledger=JSON.parse(snapshot.body),verified=replayOneGlobalEodPaperLedger(ledger);
  return {...research,...(sourceAccessCheck?{sourceAccessCheck}:{}),mode:'ONE_GLOBAL_ORIGINAL_PRIVATE_CLOUD_PAPER_CYCLE',
    state:settlement.paperFillsCreated===1?settlement.state:research.state,
    originalJournalVerified:true,originalEventsPreserved:true,
    journalEventCount:ledger.events.length,pendingSignalCount:verified.pendingSignals.length,
    virtualFillCount:verified.virtualBuys+verified.virtualSells,paperFillsCreated:settlement.paperFillsCreated,
    sourceEvidenceArchived:research.sourceEvidenceArchived===true||settlement.sourceEvidenceArchived,
    settlementState:settlement.state,settlementBlockers:settlement.settlementBlockers,
    settlementSourceRequests:settlement.settlementSourceRequests,sourceOutcomes:settlement.sourceOutcomes,
    originalSettlementContextPresent:settlement.originalSettlementContextPresent,
    ownerPaperAuthorityValidated:settlement.ownerPaperAuthorityValidated,
    sourceRightsEvidenceValidated:settlement.sourceRightsEvidenceValidated,
    upstreamEvidenceValidated:settlement.upstreamEvidenceValidated,
    exchangeSessionEvidenceValidated:settlement.exchangeSessionEvidenceValidated,
    certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
