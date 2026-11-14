/** Genuine dual-source research -> one append-only SIGNAL in the existing journal. */
import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {planPrivateEodSignalCycle} from './one-global-private-eod-autopilot.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod} from './one-global-prospective-dual-eod-bridge.mjs';
import {commitOneGlobalCloudPrivateLedger} from './one-global-cloud-private-ledger.mjs';
import {buildFirstPaperFreeEodEvidence} from '../market/one-global-first-paper-dual-eod.mjs';

const fail=code=>{throw Error('CLOUD_SIGNAL_CYCLE_'+code);};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ORIGINAL_HASH='a733637275ad95c086566a6d29213035fbb0f5060d222df7eddbf99f074adf89';
function parse(snapshot){
  if(!snapshot||typeof snapshot.body!=='string'||Buffer.byteLength(snapshot.body)>1500000)
    fail('ORIGINAL_JOURNAL_REQUIRED');
  let ledger;try{ledger=JSON.parse(snapshot.body);}catch{fail('ORIGINAL_JOURNAL_INVALID');}
  replayOneGlobalEodPaperLedger(ledger);
  if(ledger.events.length===0)fail('NONEMPTY_ORIGINAL_REQUIRED');
  return ledger;
}
/** Production-only wrapper pins the actual recovered original prefix on EVERY read. */
export function pinOneGlobalRecoveredOriginalStore(storage){
  return {...storage,async read(){
    const snapshot=await storage.read(),ledger=parse(snapshot);
    if(ledger.events[0]?.key!=='XASX:CBA'||ledger.events[0]?.kind!=='SIGNAL'
      ||ledger.events[1]?.key!=='XMIL:BAMI'||ledger.events[1]?.kind!=='SIGNAL'
      ||ledger.events[2]?.key!=='XMIL:BAMI'||ledger.events[2]?.kind!=='CANCEL'
      ||ledger.events[2]?.hash!==ORIGINAL_HASH)fail('RECOVERED_ORIGINAL_PREFIX_MISMATCH');
    return snapshot;
  }};
}
function safeCode(error){
  const msg=error?.message||'';
  // No raw exception, source body, receipt hash, endpoint URL or credential.
  return /^(?:CLOUD_DUAL_EOD|FIRST_PAPER_EOD|EOD_PROSPECTIVE_BRIDGE)_[A-Z0-9_]{3,90}$/.test(msg)
    ?msg:'REAL_PROVIDER_PAIR_OR_RESEARCH_GATE_REJECTED';
}
function alreadyRecorded(ledger,date){
  return ledger.events.some(e=>e.kind==='SIGNAL'&&e.referenceSessionDate===date
    &&/^fenice-xnas-(?:aapl|msft|tsla)-\d{8}-eod-research$/.test(e.signalId));
}
function noDailyRepeat(ledger,date){
  if(alreadyRecorded(ledger,date))fail('SESSION_SIGNAL_ALREADY_COMMITTED');
}
export async function runOneGlobalCloudProspectiveCycle({storage,collect,
  clock=()=>new Date().toISOString()}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.createResearchObservation!=='function'||typeof collect!=='function')
    fail('PRIVATE_EVIDENCE_AND_CAS_STORE_REQUIRED');
  const original=parse(await storage.read());
  const plan=planPrivateEodSignalCycle({nowIso:clock(),originalLedger:original});
  const result={mode:'ONE_GLOBAL_ORIGINAL_PRIVATE_CLOUD_SIGNAL_CYCLE',
    state:'ORIGINAL_VERIFIED_NO_ELIGIBLE_SIGNAL',originalJournalVerified:true,
    originalEventsPreserved:true,journalEventCount:original.events.length,
    pendingSignalCount:replayOneGlobalEodPaperLedger(original).pendingSignals.length,
    sourcePairsAttempted:0,newSignals:0,canonicalSignalCommitted:false,
    sourceEvidenceArchived:false,paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    sourceRightsIndependentlyCertified:false,providerIndependenceCertified:false,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,outcomes:[]};
  if(!plan.expectedPostcloseWindow)return {...result,state:'ORIGINAL_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW'};
  if(alreadyRecorded(original,plan.sessionDate))return {...result,state:'SESSION_SIGNAL_ALREADY_COMMITTED'};
  for(const candidate of plan.candidates.filter(x=>x.eligible)){
    result.sourcePairsAttempted++;
    let evidence,report,prepared,decisionAt;
    try{
      evidence=await collect({symbol:candidate.symbol,sessionDate:plan.sessionDate});
      // Rebuild from actual bounded raw source bytes, never from a caller's
      // claimed "UPTREND" report. The HTTP route accepts no market input.
      report=buildFirstPaperFreeEodEvidence({
        alphaRaw:evidence.alphaRaw,eodhdRaw:evidence.eodhdRaw,alpacaRaw:evidence.alpacaRaw,
        symbol:candidate.symbol,sessionDate:plan.sessionDate,
        observedAt:evidence.report?.observedAt,
      });
      if(JSON.stringify(evidence.report)!==JSON.stringify(report))fail('SOURCE_REPORT_MISMATCH');
      decisionAt=clock();
      const still=planPrivateEodSignalCycle({nowIso:decisionAt,originalLedger:original});
      if(!still.expectedPostcloseWindow||still.sessionDate!==plan.sessionDate)
        return {...result,state:'WINDOW_ELAPSED_DURING_COLLECTION'};
      prepared=buildOneGlobalProspectiveSignalFromDualEod({report,previousLedger:original,nowIso:decisionAt});
    }catch(error){
      result.outcomes.push({symbol:candidate.symbol,state:safeCode(error)});
      continue;
    }
    const snapshotHash=hash(report);
    if(prepared.ledger.events.at(-1)?.sourceSnapshotHash!==snapshotHash)fail('SOURCE_HASH_MISMATCH');
    // Preserve actual bytes privately in the ALREADY connected Blob before
    // recording their immutable hash. Never publish them as Actions artifacts.
    const archived=await storage.createResearchObservation({hash:snapshotHash,
      body:JSON.stringify({version:1,kind:'ONE_GLOBAL_PRIVATE_RESEARCH_SOURCE_OBSERVATION',
        report,...Object.fromEntries(['alphaRaw','eodhdRaw','alpacaRaw'].filter(k=>Buffer.isBuffer(evidence[k])).map(k=>[k+'Base64',evidence[k].toString('base64')])),
        paperSettlementEligible:false,liveTradingAllowed:false})+'\n'});
    if(archived?.created!==true)fail('EVIDENCE_ARCHIVE_NOT_CONFIRMED');
    // Re-read original from the real store, check daily idempotency again,
    // then let the existing strict CAS writer append EXACTLY one event.
    // A conflict is terminal for this cycle: no blind retries/second symbol.
    const committed=await commitOneGlobalCloudPrivateLedger({storage,makeNext:ledger=>{
      noDailyRepeat(ledger,plan.sessionDate);
      const nowIso=clock();
      const current=planPrivateEodSignalCycle({nowIso,originalLedger:ledger});
      if(!current.expectedPostcloseWindow||current.sessionDate!==plan.sessionDate)
        fail('WINDOW_ELAPSED_BEFORE_COMMIT');
      return buildOneGlobalProspectiveSignalFromDualEod({report,previousLedger:ledger,nowIso});
    }});
    if(committed.eventKind!=='SIGNAL'||committed.newEvents!==1||committed.committed!==true)
      fail('SINGLE_SIGNAL_NOT_CONFIRMED');
    const after=parse(await storage.read());
    if(!after.events.some(e=>e.hash===committed.lastHash&&e.kind==='SIGNAL'))
      fail('SIGNAL_READBACK_NOT_CONFIRMED');
    return {...result,state:'PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',
      journalEventCount:after.events.length,
      pendingSignalCount:replayOneGlobalEodPaperLedger(after).pendingSignals.length,
      newSignals:1,canonicalSignalCommitted:true,sourceEvidenceArchived:true,
      outcomes:[...result.outcomes,{symbol:candidate.symbol,state:'RESEARCH_SIGNAL_ONLY_NO_FILL'}]};
  }
  return result;
}
