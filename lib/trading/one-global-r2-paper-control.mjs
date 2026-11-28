import {fetchOneGlobalSettlementSource} from '../market/one-global-cloud-settlement-sources.mjs';
import {PRIVATE_EOD_SYMBOLS,privateEodNewYorkClock} from './one-global-private-eod-autopilot.mjs';
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
  const assertCurrentAuthority=async()=>{
    const current=await storage.readSettlementContext();
    if(!current)fail();
    inspectOneGlobalSettlementOriginals({context:JSON.parse(current.body),nowIso:clock()});
  };
  // Provider GETs and private supporting evidence only; never expose a ledger writer.
  const evidenceStore={privateAccess:storage.privateAccess,durable:storage.durable,atomicCompareAndSwap:storage.atomicCompareAndSwap,
    campaignKind:storage.campaignKind,read:storage.read.bind(storage),readSettlementContext:storage.readSettlementContext.bind(storage),
    async verifyProspectivePrecommitObservation(args){await assertCurrentAuthority();return storage.verifyProspectivePrecommitObservation(args);},
    async createSourceArtifact(args){await assertCurrentAuthority();return storage.createSourceArtifact(args);},
    readSourceArtifact:storage.readSourceArtifact.bind(storage),
    async createResearchObservation(args){await assertCurrentAuthority();return storage.createResearchObservation(args);},
    readResearchObservation:storage.readResearchObservation.bind(storage),
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
  await assertCurrentAuthority();
  if(result.paperFillsCreated!==0||result.certifiedTrades!==0||result.liveTradingAllowed!==false||result.brokerConnectivityAllowed!==false)fail();
  return validateR2EuPreflightSummary({...base,state:result.state,sourcePairsReceived:result.sourcePairsReceived,
    sourcePairsAgree:result.sourcePairsAgree,uptrendCandidates:result.uptrendCandidates,
    rawArtifactsVerified:result.rawArtifactsVerified,rightsEvidenceConnected:result.rightsEvidenceConnected});
}

 
// Access diagnostic only. No raw vendor data persists without reviewed rights.
// Numerical agreement of an IEX-only and another close is NOT independence.
const usAccessStates=new Set(['R2_PREFLIGHT_OUTSIDE_WEEKEND','R2_PREFLIGHT_AUTHORITY_REQUIRED','US_ACCESS_DIAGNOSTIC_COMPLETED']);
const accessOutcomes=new Set(['EXACT_DAILY_ROW_RECEIVED','ACCESS_NOT_CONFIRMED','NOT_REQUESTED']);
// Only bounded categories may leave the server. Never expose provider payloads,
// credentials, URLs or arbitrary exception messages.
const accessReasons=new Set(['RECEIVED','NOT_REQUESTED','KEY_MISSING_OR_INVALID','AUTH_OR_PLAN_DENIED','PROVIDER_LIMIT_OR_ERROR','RATE_LIMIT','EXACT_ROW_NOT_VERIFIED','IDENTITY_NOT_VERIFIED','HTTP_REJECTED','TRANSPORT_OR_FORMAT_UNAVAILABLE']);
function usAccessReason(error){
  const code=error?.message||'';
  if(!/^CLOUD_SETTLEMENT_SOURCE_[A-Z_]+$/.test(code))return 'TRANSPORT_OR_FORMAT_UNAVAILABLE';
  if(/KEY.*(?:MISSING|INVALID|REQUIRED)/.test(code))return 'KEY_MISSING_OR_INVALID';
  if(/AUTH_OR_|ENTITLEMENT_DENIED/.test(code))return 'AUTH_OR_PLAN_DENIED';
  if(/RATE_LIMIT/.test(code))return 'RATE_LIMIT';
  if(/PROVIDER_ERROR/.test(code))return 'PROVIDER_LIMIT_OR_ERROR';
  if(/SYMBOL|IDENTITY|MAPPING/.test(code))return 'IDENTITY_NOT_VERIFIED';
  if(/EXACT_|DATED_SERIES|INCOMPLETE_OR_STALE/.test(code))return 'EXACT_ROW_NOT_VERIFIED';
  if(/HTTP_REJECTED/.test(code))return 'HTTP_REJECTED';
  return 'TRANSPORT_OR_FORMAT_UNAVAILABLE';
}
const usSourceFields=['alpha','iex','eodhd','twelve'];
export function validateR2UsPreflightSummary(r){
  if(!r||!usAccessStates.has(r.state)||typeof r.authorityValid!=='boolean'
    ||!Array.isArray(r.symbols)||r.symbols.length!==(r.state==='US_ACCESS_DIAGNOSTIC_COMPLETED'?3:0)
    ||r.rightsApproved!==false||r.independenceCertified!==false||r.exchangeSessionEvidenceValidated!==false
    ||r.newSignals!==0||r.paperFillsCreated!==0||r.certifiedTrades!==0||r.phase9Credit!==0
    ||r.originalJournalVerified!==false||r.liveTradingAllowed!==false||r.brokerConnectivityAllowed!==false
    ||(r.state==='US_ACCESS_DIAGNOSTIC_COMPLETED'&&(!r.authorityValid||!/^\d{4}-\d\d-\d\d$/.test(r.sessionDate)))
    ||(r.state!=='US_ACCESS_DIAGNOSTIC_COMPLETED'&&r.sessionDate!==null))fail();
  const symbols=r.symbols.map((x,i)=>{
    // Accept the previous release's three-field report during rolling deploy.
    const extended=x.twelve!==undefined||x.reasons!==undefined;
    const fields=extended?usSourceFields:usSourceFields.slice(0,3);
    const received=fields.filter(k=>x[k]==='EXACT_DAILY_ROW_RECEIVED').length;
    if(x.symbol!==PRIVATE_EOD_SYMBOLS[i]||!fields.every(k=>accessOutcomes.has(x[k]))
      ||typeof x.numericalAgreement!=='boolean'||received>2
      ||(x.numericalAgreement&&received!==2))fail();
    const result={symbol:x.symbol,alpha:x.alpha,iex:x.iex,eodhd:x.eodhd,numericalAgreement:x.numericalAgreement};
    if(!extended)return result;
    if(!x.reasons||Object.keys(x.reasons).length!==fields.length||!fields.every(k=>
      accessReasons.has(x.reasons[k])&&
      (x[k]==='EXACT_DAILY_ROW_RECEIVED'?x.reasons[k]==='RECEIVED':
       x[k]==='NOT_REQUESTED'?x.reasons[k]==='NOT_REQUESTED':
       !['RECEIVED','NOT_REQUESTED'].includes(x.reasons[k]))))fail();
    return {...result,twelve:x.twelve,reasons:Object.fromEntries(fields.map(k=>[k,x.reasons[k]]))};
  });
  return {state:r.state,authorityValid:r.authorityValid,sessionDate:r.sessionDate,symbols,
    rightsApproved:false,independenceCertified:false,exchangeSessionEvidenceValidated:false,newSignals:0,paperFillsCreated:0,...flags};
}
export async function runR2UsSourcePreflight({storage,clock=clockDefault,fetcher=fetch,collect=fetchOneGlobalSettlementSource}){
  const now=clock(),before=await readStatus(storage,now);
  const base={authorityValid:before.authorityValid,sessionDate:null,symbols:[],rightsApproved:false,independenceCertified:false,
    exchangeSessionEvidenceValidated:false,newSignals:0,paperFillsCreated:0,...flags};
  if(!before.authorityValid)return validateR2UsPreflightSummary({...base,state:'R2_PREFLIGHT_AUTHORITY_REQUIRED'});
  const local=privateEodNewYorkClock(now);
  if(!['Sat','Sun'].includes(local.weekday))return validateR2UsPreflightSummary({...base,state:'R2_PREFLIGHT_OUTSIDE_WEEKEND'});
  let date=new Date(local.sessionDate+'T12:00:00Z');
  do{date=new Date(date.getTime()-86400000);}while([0,6].includes(date.getUTCDay()));
  const sessionDate=date.toISOString().slice(0,10);
  const symbols=await Promise.all(PRIVATE_EOD_SYMBOLS.map(async symbol=>{
    const signal={key:'XNAS:'+symbol,mic:'XNAS',currency:'USD'};
    const read=async providerId=>{
      try{
        const source={...signal,symbol:providerId==='eodhd'?symbol+'.US':symbol,providerId,sourceFamily:providerId};
        const {receipt}=await collect({source,signal,sessionDate,clock,fetcher});
        if(receipt?.key!==signal.key||receipt.mic!==signal.mic||receipt.currency!==signal.currency
          ||receipt.sessionDate!==sessionDate||receipt.providerId!==providerId||receipt.simulatedOrSynthetic!==false
          ||!Number.isFinite(receipt.close)||receipt.close<=0)return {close:null,reason:'IDENTITY_NOT_VERIFIED'};
        return {close:receipt.close,reason:'RECEIVED'};
      }catch(error){return {close:null,reason:usAccessReason(error)};}
    };
    const absent={close:null,reason:'NOT_REQUESTED'};
    const [alpha,iex]=await Promise.all([read('alpha-vantage'),read('alpaca-iex')]);
    const eodhd=alpha.close===null||iex.close===null?await read('eodhd'):absent;
    const first=[alpha,iex,eodhd].filter(x=>x.close!==null);
    // One additional bounded GET only when the existing adapters cannot
    // provide two observations. Never shop for a matching price after a disagreement.
    const twelve=first.length<2?await read('twelve-data'):absent;
    const sources={alpha,iex,eodhd,twelve};
    const received=Object.values(sources).filter(x=>x.close!==null).map(x=>x.close);
    const state=x=>x.reason==='NOT_REQUESTED'?'NOT_REQUESTED':x.close===null?'ACCESS_NOT_CONFIRMED':'EXACT_DAILY_ROW_RECEIVED';
    return {symbol,...Object.fromEntries(usSourceFields.map(k=>[k,state(sources[k])])),
      reasons:Object.fromEntries(usSourceFields.map(k=>[k,sources[k].reason])),
      numericalAgreement:received.length===2&&Math.abs(received[0]-received[1])/((received[0]+received[1])/2)<=0.005};
  }));
  const after=await readStatus(storage,clock());
  if(!after.authorityValid)fail();
  return validateR2UsPreflightSummary({...base,state:'US_ACCESS_DIAGNOSTIC_COMPLETED',sessionDate,symbols});
}
