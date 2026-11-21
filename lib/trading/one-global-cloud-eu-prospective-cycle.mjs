/** Genuine Milan dual-venue research -> one forward-only SIGNAL, never a fill. */
import {createHash} from 'node:crypto';
import {buildOneGlobalEuDualVenueReport,fetchOneGlobalCboeCeuxFile,fetchOneGlobalEuronextMilanFile,
  isOneGlobalMilanRegularSessionDate2026,oneGlobalNextReviewedMilanSession2026,ONE_GLOBAL_MILAN_INSTRUMENTS} from '../market/one-global-eu-delayed-eod.mjs';
import {recordOneGlobalEodSignal,replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {commitOneGlobalCloudPrivateLedger} from './one-global-cloud-private-ledger.mjs';
import {ensureOneGlobalEuEvidenceContext} from './one-global-eu-evidence-context.mjs';
import {verifyOneGlobalPrecommitSignalArchive,assertOneGlobalSignalClockAfterArchive} from './one-global-private-signal-origin-proof.mjs';

const fail=code=>{throw Error('CLOUD_EU_SIGNAL_CYCLE_'+code);};
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>hash(JSON.stringify(x));
const safeAccessBlocker=error=>/^(?:EU_DELAYED_EOD|EU_EVIDENCE_CONTEXT|CLOUD_EU_SIGNAL_CYCLE)_[A-Z0-9_]{3,120}$/.test(error?.message||'')
  ?error.message:'EU_SOURCE_ACCESS_EXTERNAL_EVIDENCE_UNAVAILABLE';
function romeClock(nowIso){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(nowIso)).map(x=>[x.type,x.value]));
  return {sessionDate:`${p.year}-${p.month}-${p.day}`,weekday:p.weekday,minute:Number(p.hour)*60+Number(p.minute)};
}
function nextMilanSession(date){
  return oneGlobalNextReviewedMilanSession2026(date)||fail('CALENDAR_YEAR_NOT_REVIEWED');
}
function ledger(snapshot){
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>1_500_000)fail('ORIGINAL_JOURNAL_REQUIRED');
  const parsed=JSON.parse(snapshot.body);replayOneGlobalEodPaperLedger(parsed);if(!parsed.events.length)fail('NONEMPTY_ORIGINAL_REQUIRED');return parsed;
}
function sameDayCommitted(original,date){return original.events.some(e=>e.kind==='SIGNAL'&&e.referenceSessionDate===date
  &&/^fenice-xmil-(?:enel|bami|ucg|eni|isp|trn)-\d{8}-dual-venue-eod(?:-exit)?$/.test(e.signalId));}
export function isOneGlobalEuConfirmedExitResearch(report){
  // Read-only qualification from two exact-venue observations. NO_UPTREND
  // alone is insufficient: require a substantial intraday decline confirmed
  // by the closing auction, regular final trade and independent Cboe close.
  const p=report?.primary,s=report?.secondary;
  if(report?.mic!=='XMIL'||!ONE_GLOBAL_MILAN_INSTRUMENTS[report.symbol]
    ||report.key!==ONE_GLOBAL_MILAN_INSTRUMENTS[report.symbol].key
    ||report.researchIndicator!=='NO_UPTREND'||report.closeDifferencePct>0.5
    ||![p?.open,p?.close,p?.vwap,p?.continuousLast,s?.close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0))
    return false;
  return p.close<p.open*0.99&&p.close<p.vwap*0.995
    &&p.continuousLast<p.vwap*0.995&&s.close<p.open*0.99;
}
async function artifact(storage,body,contentType){
  const claimed=hash(body),saved=await storage.createSourceArtifact({hash:claimed,body,contentType});
  if(saved?.verified!==true)fail('RAW_ARTIFACT_NOT_CONFIRMED');return claimed;
}
export async function runOneGlobalCloudEuProspectiveCycle({storage,clock=()=>new Date().toISOString(),fetcher=fetch,
  tradingDay='CURRENT_TRADING_DAY',ensureEvidenceContext=ensureOneGlobalEuEvidenceContext}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.createSourceArtifact!=='function'||typeof storage.createResearchObservation!=='function'
    ||typeof storage.readResearchObservation!=='function')fail('PRIVATE_EVIDENCE_STORE_REQUIRED');
  const before=ledger(await storage.read()),state=replayOneGlobalEodPaperLedger(before),nowIso=clock(),local=romeClock(nowIso);
  const base={mode:'ONE_GLOBAL_EU_DUAL_VENUE_PRIVATE_SIGNAL_CYCLE',state:'EU_OUTSIDE_POSTCLOSE_WINDOW',
    journalEventCount:before.events.length,pendingSignalCount:state.pendingSignals.length,newSignals:0,
    sourcePairsAttempted:0,canonicalSignalCommitted:false,sourceEvidenceArchived:false,
    // Safe integer counts, not quotes or credentials. These distinguish
    // unavailable data, independent-close disagreement and genuine no-signal.
    validatedCandidatePairs:0,agreedCandidatePairs:0,uptrendCandidatePairs:0,
    eligibleBuyCandidates:0,eligibleExitCandidates:0,
    paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
  const window=isOneGlobalMilanRegularSessionDate2026(local.sessionDate)
    &&local.minute>=18*60&&local.minute<=21*60;
  if(!window)return base;
  if(sameDayCommitted(before,local.sessionDate))return {...base,state:'EU_SESSION_SIGNAL_ALREADY_COMMITTED'};
  // Do not discard held positions: they may require an evidence-backed SELL.
  // An unheld candidate remains eligible only for a BUY uptrend.
  const candidates=Object.values(ONE_GLOBAL_MILAN_INSTRUMENTS).filter(x=>!state.pendingSignals.includes(x.key));
  if(!candidates.length)return {...base,state:'EU_ALL_CANDIDATES_ALREADY_HELD_OR_PENDING'};
  let euronext,cboe;
  try{[euronext,cboe]=await Promise.all([
    fetchOneGlobalEuronextMilanFile({tradingDay,fetcher}),fetchOneGlobalCboeCeuxFile({sessionDate:local.sessionDate,fetcher})]);}
  catch{return {...base,state:'EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE',sourcePairsAttempted:candidates.length};}
  const observedAt=clock(),reports=[];
  let rejectedCandidatePairs=0;
  for(const candidate of candidates){
    try{reports.push(buildOneGlobalEuDualVenueReport({euronextRaw:euronext.raw,cboeRaw:cboe.raw,symbol:candidate.symbol,
      sessionDate:local.sessionDate,observedAt}));}
    catch{rejectedCandidatePairs++;}
  }
  // Parsing can reject every candidate even when both HTTPS fetches succeeded.
  // Do not mislabel unusable venue observations as a genuine lack of uptrend.
  if(reports.length===0)return {...base,state:'EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE',sourcePairsAttempted:candidates.length,rejectedCandidatePairs};
  const agreed=reports.filter(x=>x.closeDifferencePct<=0.5);
  const uptrends=reports.filter(x=>x.researchIndicator==='UPTREND_RESEARCH_ONLY');
  const exits=reports.filter(x=>state.positions[x.key]?.quantity>0&&isOneGlobalEuConfirmedExitResearch(x));
  const buys=reports.filter(x=>!state.positions[x.key]?.quantity
    &&x.closeDifferencePct<=0.5&&x.researchIndicator==='UPTREND_RESEARCH_ONLY');
  const researchCounts={validatedCandidatePairs:reports.length,rejectedCandidatePairs,agreedCandidatePairs:agreed.length,
    uptrendCandidatePairs:uptrends.length,eligibleBuyCandidates:buys.length,eligibleExitCandidates:exits.length};
  // Reuse the exact unchanged priority: evidence-backed SELL before fresh BUY.
  const exitReport=exits[0],report=exitReport||buys[0];
  // Distinguish valid-but-divergent venue prices from a genuine absence of
  // eligible trend/exit signals. This is diagnostic only: neither case writes
  // evidence, a SIGNAL, a FILL or an order.
  if(!report)return {...base,...researchCounts,
    state:agreed.length===0?'EU_DUAL_VENUE_CLOSE_DIVERGENCE'
      :rejectedCandidatePairs>0?'EU_PARTIAL_SOURCE_PAIR_UNAVAILABLE':'EU_NO_DUAL_VENUE_UPTREND',
    sourcePairsAttempted:candidates.length};
  const isExit=Boolean(exitReport);
  const [euronextHash,cboeHash,discoveryHash]=await Promise.all([
    artifact(storage,euronext.raw,'application/zip'),artifact(storage,cboe.raw,'text/csv'),artifact(storage,cboe.discoveryRaw,'application/json')]);
  const snapshotHash=digest(report),observation={version:1,kind:'ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION',
    report,rawArtifacts:{euronextHash,cboeHash,cboeDiscoveryHash:discoveryHash},paperSettlementEligible:false,
    strategyPerformanceCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false};
  const archiveBody=JSON.stringify(observation)+'\n';
  const archived=await storage.createResearchObservation({hash:snapshotHash,body:archiveBody});
  if(archived?.created!==true)fail('EVIDENCE_ARCHIVE_NOT_CONFIRMED');
  const targetSessionDate=nextMilanSession(local.sessionDate);
  await ensureEvidenceContext({storage,sessionDate:targetSessionDate,nowIso:clock(),fetcher,
    rawEvidence:{sessionDate:local.sessionDate,euronextHash,cboeHash,cboeDiscoveryHash:discoveryHash}});
  // Original source bytes and authoritative Vercel HEAD timestamp must exist
  // before the SIGNAL CAS. Context and reviewed rights remain separate gates.
  const origin=await verifyOneGlobalPrecommitSignalArchive({
    storage,hash:snapshotHash,body:archiveBody,clock});
  const committed=await commitOneGlobalCloudPrivateLedger({storage,makeNext:current=>{
    if(sameDayCommitted(current,local.sessionDate))fail('SESSION_SIGNAL_ALREADY_COMMITTED');
    // CAS rechecks position ownership. No SELL without holdings and no new
    // BUY for an already-held ticker, even if the journal changed mid-fetch.
    if(Boolean(replayOneGlobalEodPaperLedger(current).positions[report.key]?.quantity)!==isExit)
      fail('POSITION_STATE_CHANGED_BEFORE_SIGNAL');
    const decisionAt=clock(),currentClock=romeClock(decisionAt);
    assertOneGlobalSignalClockAfterArchive({uploadedAt:origin.uploadedAt,recordedAt:decisionAt});
    if(currentClock.sessionDate!==local.sessionDate||currentClock.minute<18*60||currentClock.minute>21*60)fail('WINDOW_ELAPSED_BEFORE_COMMIT');
    return recordOneGlobalEodSignal({previousLedger:current,nowIso:decisionAt,signal:{
      signalId:`fenice-xmil-${report.symbol.toLowerCase()}-${local.sessionDate.replaceAll('-','')}-dual-venue-eod${isExit?'-exit':''}`,
      key:report.key,mic:'XMIL',side:isExit?'SELL':'BUY',currency:'EUR',decisionAt,
      referenceSessionDate:local.sessionDate,referenceCloseAt:report.primary.tradeAt,
      referencePublishedAt:report.observedAt,sourceSnapshotHash:snapshotHash,maxNotionalEuro:50,
      strategyReason:isExit?'DOWNTREND_EXIT':'UPTREND_CONFIRMATION',
      researchSignalOnly:true,sourceRightsIndependentlyCertified:false}});
  }});
  if(committed.committed!==true||committed.eventKind!=='SIGNAL'||committed.newEvents!==1)fail('SINGLE_SIGNAL_NOT_CONFIRMED');
  const after=ledger(await storage.read());
  if(!after.events.some(e=>e.kind==='SIGNAL'&&e.hash===committed.lastHash))fail('SIGNAL_READBACK_NOT_CONFIRMED');
  return {...base,...researchCounts,state:isExit?'EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE':'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',
    journalEventCount:after.events.length,
    pendingSignalCount:replayOneGlobalEodPaperLedger(after).pendingSignals.length,newSignals:1,
    // Count every candidate actually attempted, including rejected venue pairs.
    // Otherwise a committed SIGNAL with partial source coverage fails the
    // downstream validated + rejected <= attempted forensic report invariant.
    sourcePairsAttempted:candidates.length,
    canonicalSignalCommitted:true,sourceEvidenceArchived:true,rightsAndNextSessionEvidenceConnected:true};
}

/** Weekend/read-only qualification plus evidence connection; never a SIGNAL/FILL. */
export async function inspectOneGlobalEuSourceAccess({storage,clock=()=>new Date().toISOString(),fetcher=fetch,
  ensureEvidenceContext=ensureOneGlobalEuEvidenceContext}={}){
  const nowIso=clock(),local=romeClock(nowIso);let date=new Date(local.sessionDate+'T12:00:00.000Z');
  let sessionDate;
  for(let attempts=0;attempts<10;attempts++){
    date.setUTCDate(date.getUTCDate()-1);const candidate=date.toISOString().slice(0,10);
    if(isOneGlobalMilanRegularSessionDate2026(candidate)){sessionDate=candidate;break;}
  }
  if(!sessionDate)fail('CALENDAR_YEAR_NOT_REVIEWED');
  const base={state:'EU_SOURCE_ACCESS_NOT_CONFIRMED',sessionDate,
    sourcePairsReceived:0,sourcePairsAgree:0,uptrendCandidates:0,rawArtifactsVerified:false,rightsEvidenceConnected:false,
    paperFillsCreated:0,certifiedTrades:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
  try{
    const [euronext,cboe]=await Promise.all([fetchOneGlobalEuronextMilanFile({tradingDay:'PREVIOUS_TRADING_DAY',fetcher}),
      fetchOneGlobalCboeCeuxFile({sessionDate,fetcher})]);
    const reports=Object.keys(ONE_GLOBAL_MILAN_INSTRUMENTS).flatMap(symbol=>{try{return [buildOneGlobalEuDualVenueReport({
      euronextRaw:euronext.raw,cboeRaw:cboe.raw,symbol,sessionDate,observedAt:clock()})];}catch{return [];}});
    const [euronextHash,cboeHash,discoveryHash]=await Promise.all([artifact(storage,euronext.raw,'application/zip'),
      artifact(storage,cboe.raw,'text/csv'),artifact(storage,cboe.discoveryRaw,'application/json')]);
    const compact={version:1,kind:'ONE_GLOBAL_PRIVATE_EU_SOURCE_ACCESS_OBSERVATION',sessionDate,reports,
      rawArtifacts:{euronextHash,cboeHash,cboeDiscoveryHash:discoveryHash},paperFillsCreated:0,liveTradingAllowed:false};
    const saved=await storage.createResearchObservation({hash:digest(compact),body:JSON.stringify(compact)+'\n'});
    if(saved?.created!==true)fail('EVIDENCE_ARCHIVE_NOT_CONFIRMED');
    await ensureEvidenceContext({storage,nowIso:clock(),fetcher,
      rawEvidence:{sessionDate,euronextHash,cboeHash,cboeDiscoveryHash:discoveryHash}});
    return {...base,state:reports.length&&reports.every(x=>x.closeDifferencePct<=0.5)
      ?'EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED':'EU_SOURCE_PAIR_DIVERGES_OR_INCOMPLETE',
      sourcePairsReceived:reports.length,sourcePairsAgree:reports.filter(x=>x.closeDifferencePct<=0.5).length,
      uptrendCandidates:reports.filter(x=>x.researchIndicator==='UPTREND_RESEARCH_ONLY').length,
      rawArtifactsVerified:true,rightsEvidenceConnected:true};
  }catch(error){return {...base,blocker:safeAccessBlocker(error)};}
}
