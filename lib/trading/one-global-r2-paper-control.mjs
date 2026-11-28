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

const preflightStates=new Set(['R2_PREFLIGHT_OUTSIDE_WEEKEND','R2_PREFLIGHT_AUTHORITY_REQUIRED','EU_SOURCE_ACCESS_NOT_CONFIRMED','EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED','EU_SOURCE_PAIR_DIVERGES_OR_INCOMPLETE']);
export function validateR2EuPreflightSummary(r){
  if(!r||!preflightStates.has(r.state)||typeof r.authorityValid!=='boolean'
    ||!['sourcePairsReceived','sourcePairsAgree','uptrendCandidates'].every(k=>integer(r[k])&&r[k]<=6)
    ||r.sourcePairsAgree>r.sourcePairsReceived||r.uptrendCandidates>r.sourcePairsReceived
    ||typeof r.rawArtifactsVerified!=='boolean'||typeof r.rightsEvidenceConnected!=='boolean'
    ||r.paperFillsCreated!==0||r.newSignals!==0||r.certifiedTrades!==0||r.phase9Credit!==0
    ||r.liveTradingAllowed!==false||r.brokerConnectivityAllowed!==false||r.originalJournalVerified!==false
    ||(r.state==='EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED'&&(r.sourcePairsAgree!==6||!r.rawArtifactsVerified||!r.rightsEvidenceConnected))
    ||(!r.authorityValid&&(r.sourcePairsReceived!==0||r.rawArtifactsVerified||r.rightsEvidenceConnected)))fail();
  return {state:r.state,authorityValid:r.authorityValid,sourcePairsReceived:r.sourcePairsReceived,
    sourcePairsAgree:r.sourcePairsAgree,uptrendCandidates:r.uptrendCandidates,rawArtifactsVerified:r.rawArtifactsVerified,
    rightsEvidenceConnected:r.rightsEvidenceConnected,paperFillsCreated:0,newSignals:0,...flags};
}
export async function runR2EuSourcePreflight({storage,qualify,clock=clockDefault}){
  const now=clock(),before=await readStatus(storage,now);
  const base={authorityValid:before.authorityValid,sourcePairsReceived:0,sourcePairsAgree:0,uptrendCandidates:0,
    rawArtifactsVerified:false,rightsEvidenceConnected:false,paperFillsCreated:0,newSignals:0,...flags};
  if(!before.authorityValid)return validateR2EuPreflightSummary({...base,state:'R2_PREFLIGHT_AUTHORITY_REQUIRED'});
  const weekday=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Europe/Rome'}).format(new Date(now));
  if(!['Sat','Sun'].includes(weekday))return validateR2EuPreflightSummary({...base,state:'R2_PREFLIGHT_OUTSIDE_WEEKEND'});
  // Provider GETs and private supporting evidence only; never expose a ledger writer.
  const evidenceStore={privateAccess:storage.privateAccess,durable:storage.durable,atomicCompareAndSwap:storage.atomicCompareAndSwap,
    campaignKind:storage.campaignKind,read:storage.read.bind(storage),readSettlementContext:storage.readSettlementContext.bind(storage),
    createSourceArtifact:storage.createSourceArtifact.bind(storage),readSourceArtifact:storage.readSourceArtifact.bind(storage),
    createResearchObservation:storage.createResearchObservation.bind(storage),readResearchObservation:storage.readResearchObservation.bind(storage),
    async writeSettlementContext(args){
      const current=await storage.readSettlementContext();
      if(!current||current.etag!==args.expectedEtag)fail();
      const old=JSON.parse(current.body),next=JSON.parse(args.body),nowIso=clock();
      inspectOneGlobalSettlementOriginals({context:old,nowIso});
      inspectOneGlobalSettlementOriginals({context:next,nowIso});
      if(JSON.stringify(old.authority)!==JSON.stringify(next.authority))fail();
      return storage.writeSettlementContext(args);
    }};
  const result=await qualify({storage:evidenceStore,clock});
  if(result.paperFillsCreated!==0||result.certifiedTrades!==0||result.liveTradingAllowed!==false||result.brokerConnectivityAllowed!==false)fail();
  return validateR2EuPreflightSummary({...base,state:result.state,sourcePairsReceived:result.sourcePairsReceived,
    sourcePairsAgree:result.sourcePairsAgree,uptrendCandidates:result.uptrendCandidates,
    rawArtifactsVerified:result.rawArtifactsVerified,rightsEvidenceConnected:result.rightsEvidenceConnected});
}
