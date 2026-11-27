/** R2-only owner authority and trusted scheduled cycle. No historical attestations. */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {inspectOneGlobalSettlementOriginals} from './one-global-cloud-settlement.mjs';
import {importOneGlobalPrivateInputs} from './one-global-private-input-intake.mjs';
import {runOneGlobalCloudPaperCycle} from './one-global-cloud-paper-cycle.mjs';
import {assertProspectiveSnapshot} from './one-global-prospective-cycle-proof.mjs';
const flags={certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,originalJournalVerified:false};
const clockDefault=()=>new Date().toISOString();
const fail=()=>{throw Error('R2_PAPER_CONTROL_RECHECK_REQUIRED');};
async function readStatus(storage,nowIso){
  const snapshot=await storage.read();
  if(!snapshot)return {state:'R2_PAPER_GENESIS_REQUIRED',authorityValid:false};
  if(!assertProspectiveSnapshot(storage,snapshot))fail();
  const ledger=JSON.parse(snapshot.body),r=replayOneGlobalEodPaperLedger(ledger);
  const context=await storage.readSettlementContext();
  let authorityValid=false;
  if(context)try{inspectOneGlobalSettlementOriginals({context:JSON.parse(context.body),nowIso});authorityValid=true;}catch{}
  return {state:authorityValid?'R2_PAPER_AUTHORITY_VALID':context?'R2_PAPER_CONSENT_REVIEW_REQUIRED':'R2_PAPER_CONSENT_REQUIRED',
    authorityValid,journalEventCount:ledger.events.length,pendingSignalCount:r.pendingSignals.length,
    virtualFillCount:r.virtualBuys+r.virtualSells,closedVirtualRoundTrips:r.closedVirtualRoundTrips,
    cashEuro:r.cashEuro,realizedNetEuro:r.realizedNetEuro,positionCount:Object.values(r.positions).filter(p=>p.quantity>0).length};
}
export async function readR2PaperControl({storage,clock=clockDefault}){return {...await readStatus(storage,clock()),...flags};}
// Called only after explicit authenticated same-origin owner action. Existing
// contexts are never overwritten or automatically renewed by this initializer.
export async function authorizeR2Paper({storage,reviewedCommit,clock=clockDefault}){
  const nowIso=clock(),before=await readStatus(storage,nowIso);
  if(before.state==='R2_PAPER_AUTHORITY_VALID')return {...before,...flags};
  if(before.state!=='R2_PAPER_CONSENT_REQUIRED'||! /^[a-f0-9]{40}$/.test(reviewedCommit||''))fail();
  const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
    approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit},
    executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
    approvedAt:nowIso,expiresAt:new Date(Date.parse(nowIso)+30*86400000).toISOString()};
  await importOneGlobalPrivateInputs({storage,nowIso,input:{kind:'ORIGINAL_OWNER_PAPER_CONSENT',
    documentBase64:Buffer.from(JSON.stringify(authority)).toString('base64'),expectedEtag:null}});
  return readR2PaperControl({storage,clock});
}
const states=new Set(['R2_PAPER_GENESIS_REQUIRED','R2_PAPER_CONSENT_REQUIRED','R2_PAPER_CONSENT_REVIEW_REQUIRED',
 'R2_PROSPECTIVE_VERIFIED_NO_ELIGIBLE_SIGNAL','R2_PROSPECTIVE_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW',
 'SESSION_SIGNAL_ALREADY_COMMITTED','WINDOW_ELAPSED_DURING_COLLECTION','PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',
 'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE','EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE','STRICT_PAPER_FILL_COMMITTED_PRIVATE']);
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000;
export function validateR2PublicCycleSummary(r){
  if(!r||!states.has(r.state)||r.originalJournalVerified!==false||r.certifiedTrades!==0||r.phase9Credit!==0
    ||r.brokerConnectivityAllowed!==false||r.liveTradingAllowed!==false||typeof r.authorityValid!=='boolean'
    ||!['journalEventCount','pendingSignalCount','virtualFillCount','paperFillsCreated','newSignals','closedVirtualRoundTrips'].every(k=>integer(r[k]))
    ||r.paperFillsCreated>1||r.newSignals>1||r.virtualFillCount>r.journalEventCount||r.pendingSignalCount>r.journalEventCount
    ||r.closedVirtualRoundTrips*2>r.virtualFillCount||(!r.authorityValid&&(r.paperFillsCreated!==0||r.newSignals!==0)))fail();
  return {state:r.state,authorityValid:r.authorityValid,journalEventCount:r.journalEventCount,pendingSignalCount:r.pendingSignalCount,
    virtualFillCount:r.virtualFillCount,paperFillsCreated:r.paperFillsCreated,newSignals:r.newSignals,closedVirtualRoundTrips:r.closedVirtualRoundTrips,...flags};
}
export async function runAuthorizedR2PaperCycle({storage,collect,clock=clockDefault,fetcher=fetch,run=runOneGlobalCloudPaperCycle}){
  const before=await readStatus(storage,clock());
  if(!before.authorityValid)return validateR2PublicCycleSummary({...before,journalEventCount:before.journalEventCount??0,
    pendingSignalCount:before.pendingSignalCount??0,virtualFillCount:before.virtualFillCount??0,
    closedVirtualRoundTrips:before.closedVirtualRoundTrips??0,paperFillsCreated:0,newSignals:0,...flags});
  // The final journal write must independently revalidate current consent.
  // Source collection can span the authorization expiry boundary.
  const guardedStorage={...storage,async compareAndSwap(args){
    const current=await storage.readSettlementContext();
    if(!current)fail();
    const ledger=JSON.parse(args.body),event=ledger.events.at(-1);
    const now=clock();
    const checked=inspectOneGlobalSettlementOriginals({context:JSON.parse(current.body),nowIso:now});
    if(!event||event.recordedAt>now||event.recordedAt<checked.authority.approvedAt)fail();
    return storage.compareAndSwap(args);
  }};
  const report=await run({storage:guardedStorage,collect,clock,fetcher});
  if(report?.originalJournalVerified!==false||report.prospectiveJournalVerified!==true||report.certifiedTrades!==0
    ||report.phase9Credit!==0||report.brokerConnectivityAllowed!==false||report.liveTradingAllowed!==false)fail();
  const after=await readStatus(storage,clock());
  return validateR2PublicCycleSummary({...after,state:report.state,authorityValid:after.authorityValid,
    paperFillsCreated:report.paperFillsCreated,newSignals:report.newSignals,...flags});
}
